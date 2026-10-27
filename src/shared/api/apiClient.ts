import { auth } from "@/shared/api/legacy-firebase/firebaseConfig";
import { clearSessionDataCache } from "@/shared/api/sessionDataCache";
import { getPostgresApiBaseUrl, postgresSession } from "./postgresSession";

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiFailure {
  success: false;
  message: string;
  code: string;
  detail?: string;
}

export type ApiAuthMode = "postgres" | "firebase" | "none";

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  authenticated?: boolean;
  authMode?: ApiAuthMode;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const PRODUCTION_API_BASE_URL =
  "https://sensible-crm-api-700529442570.asia-south1.run.app";
const configuredBaseUrl = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.trim();
const isValidApiBaseUrl =
  configuredBaseUrl !== undefined && /^https?:\/\//i.test(configuredBaseUrl);
const API_BASE_URL = (
  import.meta.env.DEV
    ? ""
    : isValidApiBaseUrl
      ? configuredBaseUrl
      : PRODUCTION_API_BASE_URL
).replace(/\/$/, "");

const getFirebaseAuthorizationHeader = async () => {
  await auth.authStateReady();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new ApiError(
      "Your session has expired. Please sign in again.",
      "AUTHENTICATION_REQUIRED",
      401,
    );
  }

  return `Bearer ${await currentUser.getIdToken()}`;
};

const getPostgresAuthorizationHeader = async () => {
  let token = postgresSession.getAccessToken();
  if (!token) {
    token = (await postgresSession.restoreSession()).accessToken;
  }
  return `Bearer ${token}`;
};

export const apiRequest = async <T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> => {
  const authMode: ApiAuthMode = options.authMode ??
    (options.authenticated === false ? "none" : "postgres");
  const baseUrl = authMode === "postgres" ? getPostgresApiBaseUrl() : API_BASE_URL;

  const execute = async () => {
    const headers = new Headers({ Accept: "application/json" });
    if (authMode === "firebase") {
      headers.set("Authorization", await getFirebaseAuthorizationHeader());
    } else if (authMode === "postgres") {
      headers.set("Authorization", await getPostgresAuthorizationHeader());
      headers.set("x-postgres-session", "1");
    }
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    return fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      cache: "no-store",
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  };

  let response = await execute();
  if (authMode === "postgres" && response.status === 401) {
    await postgresSession.refresh();
    response = await execute();
    if (response.status === 401) {
      postgresSession.clearSession();
    }
  }

  const rawText = await response.text();
  let payload: ApiSuccess<T> | ApiFailure | null = null;
  if (rawText && rawText.trim().length > 0) {
    try {
      payload = JSON.parse(rawText) as ApiSuccess<T> | ApiFailure;
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    throw new ApiError(
      `Backend API unreachable or returned invalid response (${response.status} ${response.statusText || "Service Unavailable"}). Please ensure backend API is running on port 3001 (npm run dev:local).`,
      "INVALID_API_RESPONSE",
      response.status,
    );
  }

  if (!response.ok || !payload.success) {
    const failure = payload as ApiFailure;
    if (response.status === 401 && authMode === "firebase") clearSessionDataCache();
    throw new ApiError(
      failure.message || "The request could not be completed",
      failure.code || "API_REQUEST_FAILED",
      response.status,
      failure.detail,
    );
  }

  return payload.data;
};
