import type { Outlet } from "@/features/outlets";
import type { QrSession } from "../types/types";
import { apiRequest } from "@/shared/api/apiClient";
import { postgresSession, type PostgresCurrentAccess, type PostgresSessionResponse } from "../../../shared/api/postgresSession";

export interface BusinessOnboardingInput {
  ownerName: string;
  email: string;
  businessName: string;
  branch: string;
  address: string;
  city: string;
  state: string;
}

export interface PostgresOnboardingAccount extends PostgresSessionResponse {
  mode: "postgres";
  access: PostgresCurrentAccess;
  outlet: Outlet;
}

export type AnyOnboardingAccount = PostgresOnboardingAccount;

interface OnboardingStatusResponse {
  exists: boolean;
  account?: AnyOnboardingAccount;
}

interface OnboardingPhoneCheckResponse {
  exists: boolean;
  loginMethod?: "otp" | "password";
}

export const authApi = {
  async createQrSession() {
    try {
      return await apiRequest<QrSession>("/api/v1/auth/qr-sessions", {
        method: "POST",
        authenticated: false,
      });
    } catch (error) {
      // In local development, if backend server on port 3001 is not running yet,
      // generate a resilient development QR session so the QR UI renders immediately.
      if (import.meta.env.DEV) {
        console.warn("[authApi] Backend API is offline on port 3001 — serving development QR session:", error);
        const now = Date.now();
        return {
          id: `dev-session-${Math.random().toString(36).slice(2, 10)}`,
          status: "PENDING" as const,
          isLoggedIn: false,
          createdAt: now,
          expiryAt: now + 30_000,
        };
      }
      throw error;
    }
  },
  async getQrSession(sessionId: string, signal?: AbortSignal) {
    if (import.meta.env.DEV && sessionId.startsWith("dev-session-")) {
      return {
        id: sessionId,
        status: "PENDING" as const,
        isLoggedIn: false,
        createdAt: Date.now() - 5000,
        expiryAt: Date.now() + 25000,
      };
    }
    return apiRequest<QrSession>(
      `/api/v1/auth/qr-sessions/${encodeURIComponent(sessionId)}`,
      { authenticated: false, signal },
    );
  },
  claimQrSession(sessionId: string) {
    return apiRequest<QrSession>(
      `/api/v1/auth/qr-sessions/${encodeURIComponent(sessionId)}/claim`,
      { method: "POST", authMode: "firebase" },
    );
  },
  exchangeQrSession(sessionId: string) {
    return apiRequest<PostgresSessionResponse>(
      `/api/v1/auth/qr-sessions/${encodeURIComponent(sessionId)}/exchange`,
      { method: "POST", authenticated: false },
    );
  },
  loginPostgres(identifier: string, password: string) {
    return postgresSession.login(identifier, password);
  },
  getPostgresCurrentAccess() {
    return apiRequest<PostgresCurrentAccess>("/api/v1/me", {
      authMode: "postgres",
    });
  },
  checkOnboardingPhone(phoneNumber: string) {
    return apiRequest<OnboardingPhoneCheckResponse>(
      "/api/v1/auth/onboarding/check-phone",
      {
        method: "POST",
        authenticated: false,
        body: { phoneNumber },
      },
    );
  },
  getOnboardingStatus() {
    return apiRequest<OnboardingStatusResponse>(
      "/api/v1/auth/onboarding/status",
      { method: "GET", authMode: "firebase" },
    );
  },
  createBusiness(input: BusinessOnboardingInput) {
    return apiRequest<AnyOnboardingAccount>(
      "/api/v1/auth/onboarding/business",
      { method: "POST", body: input, authMode: "firebase" },
    );
  },
};
