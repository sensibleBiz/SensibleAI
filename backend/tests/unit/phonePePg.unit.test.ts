import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { env } from "../../src/config/env.js";
import {
  assertPhonePePgConfigured,
  checkTransactionStatus,
  clearPhonePeTokenCacheForTests,
  initiatePayment,
  parsePaymentWebhook,
  verifyWebhookAuthorization,
} from "../../src/modules/billing/phonePePg.service.js";
import { phonePeOfflineService } from "../../src/modules/events/phonePeOffline.service.js";

const originalFetch = globalThis.fetch;
const originalNodeEnv = env.nodeEnv;
const pgConfig = env.billing.phonePePg;
const originalPgConfig = { ...pgConfig };
const offlineConfig = env.events.phonePe;
const originalOfflineConfig = { ...offlineConfig };

const tokenResponse = (token: string, lifetimeSeconds = 3_600): Response =>
  Response.json({
    access_token: token,
    issued_at: Math.floor(Date.now() / 1_000),
    expires_at: Math.floor(Date.now() / 1_000) + lifetimeSeconds,
    token_type: "O-Bearer",
  });

const configureSandbox = (): void => {
  env.nodeEnv = "test";
  Object.assign(pgConfig, {
    enabled: true,
    productionEnabled: false,
    legacyV1Enabled: false,
    clientIdTest: "sandbox-client-id",
    clientSecretTest: "sandbox-client-secret",
    clientVersionTest: "1",
    webhookUsernameTest: "sandbox-webhook-user",
    webhookPasswordTest: "sandbox-webhook-password",
  });
};

beforeEach(() => {
  configureSandbox();
  clearPhonePeTokenCacheForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  env.nodeEnv = originalNodeEnv;
  Object.assign(pgConfig, originalPgConfig);
  Object.assign(offlineConfig, originalOfflineConfig);
  clearPhonePeTokenCacheForTests();
});

test("OAuth success and v2 create request use the official contracts", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    if (url.endsWith("/v1/oauth/token")) return tokenResponse("token-one");
    return Response.json({
      orderId: "OMO-123",
      state: "PENDING",
      expireAt: Date.now() + 1_800_000,
      redirectUrl: "https://mercury-uat.phonepe.com/checkout/example",
    });
  }) as typeof fetch;

  const result = await initiatePayment({
    merchantOrderId: "TU123",
    amountPaise: 12_345,
    redirectUrl: "https://crm.example.test/billing/result?orderRef=TU123",
  });

  assert.equal(result.success, true);
  assert.equal(result.providerOrderId, "OMO-123");
  assert.equal(calls.length, 2);
  assert.equal(
    calls[0]!.url,
    "https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token",
  );
  assert.equal(calls[0]!.init?.method, "POST");
  assert.equal(
    new Headers(calls[0]!.init?.headers).get("content-type"),
    "application/x-www-form-urlencoded",
  );
  const oauthBody = new URLSearchParams(String(calls[0]!.init?.body));
  assert.deepEqual(Object.fromEntries(oauthBody), {
    client_id: "sandbox-client-id",
    client_version: "1",
    client_secret: "sandbox-client-secret",
    grant_type: "client_credentials",
  });

  assert.equal(
    calls[1]!.url,
    "https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay",
  );
  assert.equal(new Headers(calls[1]!.init?.headers).get("authorization"), "O-Bearer token-one");
  assert.deepEqual(JSON.parse(String(calls[1]!.init?.body)), {
    merchantOrderId: "TU123",
    amount: 12_345,
    expireAfter: 1_800,
    paymentFlow: {
      type: "PG_CHECKOUT",
      merchantUrls: {
        redirectUrl: "https://crm.example.test/billing/result?orderRef=TU123",
      },
    },
  });
});

test("OAuth failures and invalid credentials fail without exposing a token", async () => {
  globalThis.fetch = (async () =>
    Response.json({ code: "INVALID_CLIENT", message: "invalid credentials" }, { status: 401 })) as typeof fetch;

  await assert.rejects(
    checkTransactionStatus("TU-OAUTH-FAIL"),
    /OAuth token request returned HTTP 401/,
  );
});

test("OAuth token is cached while valid and refreshed near expiry", async () => {
  let tokenCalls = 0;
  let statusCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/v1/oauth/token")) {
      tokenCalls++;
      return tokenResponse(`token-${tokenCalls}`, tokenCalls === 1 ? 30 : 3_600);
    }
    statusCalls++;
    return Response.json({ orderId: "OMO-CACHE", state: "PENDING", amount: 100, paymentDetails: [] });
  }) as typeof fetch;

  await checkTransactionStatus("TU-CACHE");
  await checkTransactionStatus("TU-CACHE");
  await checkTransactionStatus("TU-CACHE");

  assert.equal(tokenCalls, 2, "near-expiry token should be replaced and the replacement cached");
  assert.equal(statusCalls, 3);
});

test("a 401 invalidates OAuth cache and retries once with a fresh token", async () => {
  let tokenCalls = 0;
  let statusCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/v1/oauth/token")) return tokenResponse(`token-${++tokenCalls}`);
    statusCalls++;
    const auth = new Headers(init?.headers).get("authorization");
    if (auth === "O-Bearer token-1") return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
    return Response.json({
      orderId: "OMO-REFRESH",
      state: "COMPLETED",
      amount: 500,
      paymentDetails: [{ transactionId: "OM-TXN", amount: 500, state: "COMPLETED" }],
    });
  }) as typeof fetch;

  const result = await checkTransactionStatus("TU-REFRESH");
  assert.equal(result.state, "COMPLETED");
  assert.equal(tokenCalls, 2);
  assert.equal(statusCalls, 2);
});

test("order status maps success, pending, failure, and unknown states", async () => {
  const states = ["COMPLETED", "PENDING", "FAILED", "CANCELLED"];
  let index = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/v1/oauth/token")) return tokenResponse("status-token");
    const state = states[index++]!;
    return Response.json({
      orderId: `OMO-${state}`,
      state,
      amount: 1_000,
      paymentDetails: state === "COMPLETED"
        ? [{ transactionId: "OM-COMPLETED", amount: 1_000, state: "COMPLETED" }]
        : [],
    });
  }) as typeof fetch;

  assert.equal((await checkTransactionStatus("TU-1")).state, "COMPLETED");
  assert.equal((await checkTransactionStatus("TU-2")).state, "PENDING");
  assert.equal((await checkTransactionStatus("TU-3")).state, "FAILED");
  assert.equal((await checkTransactionStatus("TU-4")).state, "UNKNOWN");
});

test("status GET retries one transient response", async () => {
  let statusCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/v1/oauth/token")) return tokenResponse("retry-token");
    statusCalls++;
    if (statusCalls === 1) return Response.json({ code: "INTERNAL_SERVER_ERROR" }, { status: 503 });
    return Response.json({ orderId: "OMO-RETRY", state: "PENDING", amount: 100, paymentDetails: [] });
  }) as typeof fetch;

  assert.equal((await checkTransactionStatus("TU-RETRY")).state, "PENDING");
  assert.equal(statusCalls, 2);
});

test("create timeout is ambiguous and is never automatically retried", async () => {
  let createCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/v1/oauth/token")) return tokenResponse("timeout-token");
    createCalls++;
    throw new DOMException("request timed out", "TimeoutError");
  }) as typeof fetch;

  await assert.rejects(
    initiatePayment({ merchantOrderId: "TU-TIMEOUT", amountPaise: 100, redirectUrl: "https://example.test" }),
    /create payment request failed/,
  );
  assert.equal(createCalls, 1);
});

test("valid SHA webhook authorization and payment payload are accepted", () => {
  const username = "callback-user";
  const password = "callback-password";
  const authorization = crypto.createHash("sha256").update(`${username}:${password}`).digest("hex");
  assert.equal(verifyWebhookAuthorization(authorization, username, password), true);
  assert.equal(
    parsePaymentWebhook({
      event: "checkout.order.completed",
      payload: { merchantOrderId: "TU-WEBHOOK", state: "COMPLETED", addedLater: true },
      addedLater: true,
    }).payload.merchantOrderId,
    "TU-WEBHOOK",
  );
});

test("invalid webhook authentication and unsupported events are rejected", () => {
  assert.equal(verifyWebhookAuthorization("0".repeat(64), "user", "password"), false);
  assert.equal(verifyWebhookAuthorization("malformed", "user", "password"), false);
  assert.throws(
    () => parsePaymentWebhook({ event: "pg.refund.completed", payload: { merchantOrderId: "TU1" } }),
    /not a supported payment event/,
  );
  assert.throws(
    () => parsePaymentWebhook({ event: "checkout.order.failed", payload: {} }),
    /merchantOrderId is missing/,
  );
});

test("production configuration fails closed until explicitly enabled", () => {
  env.nodeEnv = "production";
  Object.assign(pgConfig, { enabled: true, productionEnabled: false });
  assert.throws(assertPhonePePgConfigured, /production top-ups are disabled/);

  Object.assign(pgConfig, { productionEnabled: true });
  assert.throws(assertPhonePePgConfigured, /PHONEPE_PG_CLIENT_ID_PROD is required/);
});

test("legacy v1 enable flag is a fail-closed tripwire", () => {
  Object.assign(pgConfig, { legacyV1Enabled: true });
  assert.throws(assertPhonePePgConfigured, /legacy v1 must remain disabled/);
});

test("PhonePe Offline POS retains its independent X-VERIFY contract", async () => {
  Object.assign(offlineConfig, {
    testHostUrl: "https://offline.example.test",
    merchantIdTest: "OFFLINE-MERCHANT",
    storeIdTest: "OFFLINE-STORE",
    terminalIdTest: "OFFLINE-TERMINAL",
    providerIdTest: "OFFLINE-PROVIDER",
    saltKeyTest: "offline-test-salt",
    saltIndex: "1",
  });
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedUrl = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    capturedHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }) as typeof fetch;

  await phonePeOfflineService.initiatePayLink({
    isProd: false,
    transactionId: "OFFLINE-TXN",
    merchantOrderId: "OFFLINE-ORDER",
    amount: 100,
    customerPhoneNumber: "9999999999",
  });

  assert.equal(capturedUrl, "https://offline.example.test/v1/intent/init");
  assert.equal(capturedHeaders.get("x-provider-id"), "OFFLINE-PROVIDER");
  assert.match(capturedHeaders.get("x-verify") ?? "", /^[0-9a-f]{64}###1$/);
  assert.equal(capturedHeaders.has("authorization"), false);
});
