interface ApiSuccess<T> { success: true; data: T }
interface ApiFailure { success: false; message: string; code: string }

export class PostgresSessionError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PostgresSessionError";
  }
}

export interface PostgresSessionUser {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
}

export interface PostgresSessionResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  user: PostgresSessionUser;
  context: {
    tenantId: string;
    isTenantAdmin: boolean;
    outletIds: string[];
  };
}

export interface PostgresCurrentAccess {
  user: PostgresSessionUser;
  tenant: { id: string; isTenantAdmin: boolean };
  outlets: Array<{
    id: string;
    name: string;
    businessId: string;
    businessName: string;
    roleId: string;
    roleName: string;
    permissions: string[];
    profileRole: string | null;
    departments: string[];
    zones: string[];
  }>;
}

const explicitPostgresApiUrl = (
  import.meta.env.VITE_POSTGRES_API_BASE_URL as string | undefined
)?.trim().replace(/\/$/, "");
const configuredApiUrl = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.trim().replace(/\/$/, "");

const DEFAULT_PRODUCTION_POSTGRES_API_URL =
  "https://sensible-crm-api-700529442570.asia-south1.run.app";

const postgresApiBaseUrl = () => {
  // Keep development auth same-origin so the Vite /api proxy owns the cookie
  // boundary. A direct HTTP backend URL breaks refresh cookies when Vite uses
  // its local HTTPS certificate.
  if (import.meta.env.DEV) return explicitPostgresApiUrl || "";
  const productionUrl =
    explicitPostgresApiUrl || configuredApiUrl || DEFAULT_PRODUCTION_POSTGRES_API_URL;
  if (!productionUrl || !/^https:\/\//i.test(productionUrl)) {
    throw new Error("VITE_POSTGRES_API_BASE_URL must be an explicit HTTPS URL");
  }
  return productionUrl;
};

export const getPostgresApiBaseUrl = postgresApiBaseUrl;

let accessToken: string | null = null;
let accessTokenRefreshAt = 0;
let refreshPromise: Promise<PostgresSessionResponse> | null = null;
const clearListeners = new Set<() => void>();
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 30_000;

const unwrap = async <T>(response: Response): Promise<T> => {
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
    if (!response.ok) {
      throw new PostgresSessionError(
        `Backend API is unreachable (${response.status} ${response.statusText || "Proxy Error"}). Please ensure backend API is running on port 3001 (npm run dev:local).`,
        response.status,
        "BACKEND_UNAVAILABLE",
      );
    }
    throw new PostgresSessionError(
      "Received an empty or invalid response from backend server.",
      response.status,
      "INVALID_API_RESPONSE",
    );
  }

  if (!response.ok || !payload.success) {
    const failure = payload as ApiFailure;
    const detailMsg = (payload as { detail?: string }).detail;
    throw new PostgresSessionError(
      detailMsg ? `${failure.message}: ${detailMsg}` : (failure.message || "PostgreSQL session request failed"),
      response.status,
      failure.code || "POSTGRES_SESSION_REQUEST_FAILED",
    );
  }
  return payload.data;
};

const sessionRequest = async <T>(path: string, options: RequestInit = {}) =>
  unwrap<T>(await fetch(`${postgresApiBaseUrl()}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      "x-postgres-session": "1",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  }));

const acceptSession = (session: PostgresSessionResponse) => {
  accessToken = session.accessToken;
  const ttlMs = Math.max(0, Number(session.accessTokenExpiresIn) * 1000);
  const refreshBufferMs = Math.min(ACCESS_TOKEN_REFRESH_BUFFER_MS, ttlMs / 2);
  accessTokenRefreshAt = Date.now() + Math.max(0, ttlMs - refreshBufferMs);
  return session;
};

export const postgresSession = {
  async login(identifier: string, password: string) {
    accessToken = null;
    const session = await sessionRequest<PostgresSessionResponse>(
      "/api/v1/auth/login",
      { method: "POST", body: JSON.stringify({ identifier, password }) },
    );
    return acceptSession(session);
  },

  getAccessToken() {
    if (!accessToken || Date.now() >= accessTokenRefreshAt) return null;
    return accessToken;
  },

  acceptSession(session: PostgresSessionResponse) {
    return acceptSession(session);
  },

  refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = sessionRequest<PostgresSessionResponse>(
      "/api/v1/auth/refresh",
      { method: "POST" },
    ).then(acceptSession).catch((error) => {
      if (error instanceof PostgresSessionError && error.status === 401) {
        this.clearSession();
      }
      throw error;
    }).finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  },

  restoreSession() {
    return this.refresh();
  },

  async logout() {
    try {
      await sessionRequest<{ loggedOut: boolean }>(
        "/api/v1/auth/logout",
        { method: "POST" },
      );
    } finally {
      this.clearSession();
    }
  },

  clearSession(notify = true) {
    accessToken = null;
    accessTokenRefreshAt = 0;
    if (notify) {
      clearListeners.forEach((listener) => listener());
    }
  },

  subscribeToClear(listener: () => void) {
    clearListeners.add(listener);
    return () => clearListeners.delete(listener);
  },
};
