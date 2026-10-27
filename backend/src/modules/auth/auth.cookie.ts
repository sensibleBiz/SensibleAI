import type { Request, Response } from "express";
import { env } from "../../config/env.js";

export const POSTGRES_REFRESH_COOKIE = "sensible_crm_refresh";
export const POSTGRES_SESSION_HEADER = "x-postgres-session";

// Critical security cookie configuration: do not modify httpOnly/secure/sameSite flags without a security review.
const cookieOptions = (maxAge?: number) => ({
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: env.nodeEnv === "production" ? "none" as const : "lax" as const,
  path: "/api/v1",
  ...(maxAge === undefined ? {} : { maxAge }),
});

export const readRefreshCookie = (request: Request) => {
  const cookies = request.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName === POSTGRES_REFRESH_COOKIE) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
};

export const setRefreshCookie = (
  response: Response,
  refreshToken: string,
  expiresInSeconds: number,
) => {
  response.cookie(
    POSTGRES_REFRESH_COOKIE,
    refreshToken,
    cookieOptions(expiresInSeconds * 1_000),
  );
};

export const clearRefreshCookie = (response: Response) => {
  response.clearCookie(POSTGRES_REFRESH_COOKIE, cookieOptions());
};
