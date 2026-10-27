/**
 * PhonePe Payment Gateway Standard Checkout v2 — online wallet top-ups.
 *
 * ISOLATION: this module is completely separate from phonePeOffline.service.ts.
 * Offline POS uses different hosts, credentials, and signing and must not share
 * configuration with this adapter.
 *
 * Official contract:
 *   OAuth:  POST /v1/oauth/token (form-encoded client credentials)
 *   Pay:    POST /checkout/v2/pay (Authorization: O-Bearer <token>)
 *   Status: GET  /checkout/v2/order/{merchantOrderId}/status
 *   Webhook SHA auth: SHA256(username:password) in Authorization
 */

import crypto from "node:crypto";
import { env } from "../../config/env.js";
import type {
  PhonePeCreatePaymentResponse,
  PhonePeOrderStatusResponse,
  PhonePePaymentWebhook,
} from "./topUp.types.js";

const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_EXPIRY_SKEW_MS = 60_000;
const CREATE_PAYMENT_PATH = "/checkout/v2/pay";

interface PgEnvironment {
  name: "sandbox" | "production";
  clientId: string;
  clientSecret: string;
  clientVersion: string;
  webhookUsername: string;
  webhookPassword: string;
  oauthUrl: string;
  apiBaseUrl: string;
}

interface PhonePeOAuthResponse {
  access_token?: unknown;
  expires_at?: unknown;
  token_type?: unknown;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

const tokenCache = new Map<PgEnvironment["name"], CachedToken>();
const tokenRequests = new Map<PgEnvironment["name"], Promise<CachedToken>>();

const requireValue = (value: string, variable: string): string => {
  if (!value) throw new Error(`PhonePe PG is not configured: ${variable} is required`);
  return value;
};

const resolvePgEnvironment = (): PgEnvironment => {
  const cfg = env.billing.phonePePg;
  const production = env.nodeEnv === "production";

  if (cfg.legacyV1Enabled) {
    throw new Error("PhonePe PG legacy v1 must remain disabled");
  }
  if (!cfg.enabled) {
    throw new Error("PhonePe PG top-ups are disabled (PHONEPE_PG_ENABLED=false)");
  }
  if (production && !cfg.productionEnabled) {
    throw new Error(
      "PhonePe PG production top-ups are disabled (PHONEPE_PG_PRODUCTION_ENABLED=false)",
    );
  }

  return production
    ? {
        name: "production",
        clientId: requireValue(cfg.clientIdProd, "PHONEPE_PG_CLIENT_ID_PROD"),
        clientSecret: requireValue(cfg.clientSecretProd, "PHONEPE_PG_CLIENT_SECRET_PROD"),
        clientVersion: requireValue(cfg.clientVersionProd, "PHONEPE_PG_CLIENT_VERSION_PROD"),
        webhookUsername: requireValue(
          cfg.webhookUsernameProd,
          "PHONEPE_PG_WEBHOOK_USERNAME_PROD",
        ),
        webhookPassword: requireValue(
          cfg.webhookPasswordProd,
          "PHONEPE_PG_WEBHOOK_PASSWORD_PROD",
        ),
        oauthUrl: cfg.prodOauthUrl,
        apiBaseUrl: cfg.prodApiBaseUrl,
      }
    : {
        name: "sandbox",
        clientId: requireValue(cfg.clientIdTest, "PHONEPE_PG_CLIENT_ID_TEST"),
        clientSecret: requireValue(cfg.clientSecretTest, "PHONEPE_PG_CLIENT_SECRET_TEST"),
        clientVersion: requireValue(cfg.clientVersionTest, "PHONEPE_PG_CLIENT_VERSION_TEST"),
        webhookUsername: requireValue(
          cfg.webhookUsernameTest,
          "PHONEPE_PG_WEBHOOK_USERNAME_TEST",
        ),
        webhookPassword: requireValue(
          cfg.webhookPasswordTest,
          "PHONEPE_PG_WEBHOOK_PASSWORD_TEST",
        ),
        oauthUrl: cfg.sandboxOauthUrl,
        apiBaseUrl: cfg.sandboxApiBaseUrl,
      };
};

export const assertPhonePePgConfigured = (): void => {
  resolvePgEnvironment();
};

const parseJson = async <T>(response: Response, operation: string): Promise<T> => {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`PhonePe PG ${operation} returned non-JSON response (HTTP ${response.status})`);
  }
};

const executeRequest = async (
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Response> => {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new Error(`PhonePe PG ${operation} request failed: ${reason}`);
  }
};

const isTransientStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

const executeWithOneTransientRetry = async (
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Response> => {
  try {
    const first = await executeRequest(url, init, operation);
    if (!isTransientStatus(first.status)) return first;
  } catch {
    // OAuth and status checks are safe to retry once. The final failure below
    // remains ambiguous and is surfaced without exposing credentials or tokens.
  }
  return executeRequest(url, init, operation);
};

const fetchNewToken = async (pgEnv: PgEnvironment): Promise<CachedToken> => {
  const form = new URLSearchParams({
    client_id: pgEnv.clientId,
    client_version: pgEnv.clientVersion,
    client_secret: pgEnv.clientSecret,
    grant_type: "client_credentials",
  });
  const response = await executeWithOneTransientRetry(
    pgEnv.oauthUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
    },
    "OAuth token",
  );
  const body = await parseJson<PhonePeOAuthResponse>(response, "OAuth token");

  if (!response.ok) {
    throw new Error(`PhonePe PG OAuth token request returned HTTP ${response.status}`);
  }
  if (typeof body.access_token !== "string" || body.access_token.length === 0) {
    throw new Error("PhonePe PG OAuth response did not include an access token");
  }
  if (body.token_type !== "O-Bearer") {
    throw new Error("PhonePe PG OAuth response returned an unsupported token type");
  }
  if (typeof body.expires_at !== "number" || !Number.isFinite(body.expires_at)) {
    throw new Error("PhonePe PG OAuth response did not include a valid expires_at");
  }

  const expiresAtMs = body.expires_at * 1_000;
  if (expiresAtMs <= Date.now()) {
    throw new Error("PhonePe PG OAuth response returned an already-expired token");
  }
  return { accessToken: body.access_token, expiresAtMs };
};

const invalidateToken = (name: PgEnvironment["name"]): void => {
  tokenCache.delete(name);
};

const getAuthorizationToken = async (
  pgEnv: PgEnvironment,
  forceRefresh = false,
): Promise<string> => {
  if (forceRefresh) invalidateToken(pgEnv.name);
  const cached = tokenCache.get(pgEnv.name);
  if (cached && cached.expiresAtMs - TOKEN_EXPIRY_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }

  let pending = tokenRequests.get(pgEnv.name);
  if (!pending) {
    pending = fetchNewToken(pgEnv);
    tokenRequests.set(pgEnv.name, pending);
  }
  try {
    const token = await pending;
    tokenCache.set(pgEnv.name, token);
    return token.accessToken;
  } finally {
    if (tokenRequests.get(pgEnv.name) === pending) tokenRequests.delete(pgEnv.name);
  }
};

const executeAuthorizedRequest = async (
  pgEnv: PgEnvironment,
  url: string,
  init: RequestInit,
  operation: string,
  retryTransient: boolean,
): Promise<Response> => {
  const request = async (forceRefresh: boolean): Promise<Response> => {
    const token = await getAuthorizationToken(pgEnv, forceRefresh);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `O-Bearer ${token}`);
    headers.set("Accept", "application/json");
    const authorizedInit = { ...init, headers };
    return retryTransient
      ? executeWithOneTransientRetry(url, authorizedInit, operation)
      : executeRequest(url, authorizedInit, operation);
  };

  const first = await request(false);
  if (first.status !== 401) return first;
  return request(true);
};

export interface InitiatePaymentParams {
  merchantOrderId: string;
  amountPaise: number;
  redirectUrl: string;
}

export interface InitiatePaymentResult {
  success: boolean;
  redirectUrl: string | null;
  merchantOrderId: string;
  providerOrderId: string | null;
  rawResponse: PhonePeCreatePaymentResponse;
}

export const initiatePayment = async (
  params: InitiatePaymentParams,
): Promise<InitiatePaymentResult> => {
  const pgEnv = resolvePgEnvironment();
  const requestBody = {
    merchantOrderId: params.merchantOrderId,
    amount: params.amountPaise,
    expireAfter: 1_800,
    paymentFlow: {
      type: "PG_CHECKOUT",
      merchantUrls: { redirectUrl: params.redirectUrl },
    },
  };
  const response = await executeAuthorizedRequest(
    pgEnv,
    `${pgEnv.apiBaseUrl}${CREATE_PAYMENT_PATH}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
    "create payment",
    false,
  );
  const body = await parseJson<PhonePeCreatePaymentResponse>(response, "create payment");

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("PhonePe PG create payment was unauthorized after token refresh");
    }
    if (isTransientStatus(response.status)) {
      throw new Error(
        `PhonePe PG create payment returned HTTP ${response.status}; outcome is ambiguous and must be reconciled`,
      );
    }
    return {
      success: false,
      redirectUrl: null,
      merchantOrderId: params.merchantOrderId,
      providerOrderId: null,
      rawResponse: body,
    };
  }

  const valid =
    body.state === "PENDING" &&
    typeof body.orderId === "string" &&
    body.orderId.length > 0 &&
    typeof body.redirectUrl === "string" &&
    body.redirectUrl.length > 0;
  return {
    success: valid,
    redirectUrl: valid ? body.redirectUrl! : null,
    merchantOrderId: params.merchantOrderId,
    providerOrderId: valid ? body.orderId! : null,
    rawResponse: body,
  };
};

export interface CheckStatusResult {
  success: boolean;
  state: "COMPLETED" | "FAILED" | "PENDING" | "UNKNOWN";
  transactionId: string | null;
  amountPaise: number | null;
  merchantOrderId: string;
  providerOrderId: string | null;
  rawResponse: PhonePeOrderStatusResponse;
}

export const checkTransactionStatus = async (
  merchantOrderId: string,
): Promise<CheckStatusResult> => {
  const pgEnv = resolvePgEnvironment();
  const encodedOrderId = encodeURIComponent(merchantOrderId);
  const url =
    `${pgEnv.apiBaseUrl}/checkout/v2/order/${encodedOrderId}/status` +
    "?details=false&errorContext=true";
  const response = await executeAuthorizedRequest(
    pgEnv,
    url,
    { method: "GET", headers: { "Content-Type": "application/json" } },
    "order status",
    true,
  );
  const body = await parseJson<PhonePeOrderStatusResponse>(response, "order status");

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("PhonePe PG order status was unauthorized after token refresh");
    }
    throw new Error(`PhonePe PG order status returned HTTP ${response.status}`);
  }

  const state: CheckStatusResult["state"] =
    body.state === "COMPLETED"
      ? "COMPLETED"
      : body.state === "FAILED"
        ? "FAILED"
        : body.state === "PENDING"
          ? "PENDING"
          : "UNKNOWN";
  const completedAttempt = body.paymentDetails?.find(
    (attempt) => attempt.state === "COMPLETED" && typeof attempt.transactionId === "string",
  );

  return {
    success: state === "COMPLETED",
    state,
    transactionId: completedAttempt?.transactionId ?? null,
    amountPaise: typeof body.amount === "number" ? body.amount : null,
    merchantOrderId,
    providerOrderId: typeof body.orderId === "string" ? body.orderId : null,
    rawResponse: body,
  };
};

export const resolveWebhookCredentials = (): { username: string; password: string } => {
  const pgEnv = resolvePgEnvironment();
  return { username: pgEnv.webhookUsername, password: pgEnv.webhookPassword };
};

export const verifyWebhookAuthorization = (
  authorizationHeader: string,
  username: string,
  password: string,
): boolean => {
  if (!authorizationHeader || !username || !password) return false;
  const received = authorizationHeader.trim().toLowerCase();
  const expected = crypto.createHash("sha256").update(`${username}:${password}`).digest("hex");
  if (received.length !== expected.length || !/^[0-9a-f]{64}$/.test(received)) return false;
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
};

export const parsePaymentWebhook = (body: unknown): PhonePePaymentWebhook => {
  if (!body || typeof body !== "object") {
    throw new Error("PhonePe webhook body must be a JSON object");
  }
  const candidate = body as Record<string, unknown>;
  if (
    candidate["event"] !== "checkout.order.completed" &&
    candidate["event"] !== "checkout.order.failed"
  ) {
    throw new Error("PhonePe webhook event is not a supported payment event");
  }
  const payload = candidate["payload"];
  if (!payload || typeof payload !== "object") {
    throw new Error("PhonePe webhook payload is missing");
  }
  const merchantOrderId = (payload as Record<string, unknown>)["merchantOrderId"];
  if (typeof merchantOrderId !== "string" || merchantOrderId.length === 0) {
    throw new Error("PhonePe webhook merchantOrderId is missing");
  }
  return candidate as unknown as PhonePePaymentWebhook;
};

/** Test-only reset for deterministic token lifecycle tests. */
export const clearPhonePeTokenCacheForTests = (): void => {
  tokenCache.clear();
  tokenRequests.clear();
};
