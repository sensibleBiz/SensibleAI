import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError.js";
import { authService } from "./auth.service.js";
import {
  clearRefreshCookie,
  POSTGRES_SESSION_HEADER,
  readRefreshCookie,
  setRefreshCookie,
} from "./auth.cookie.js";

export const publicSession = <T extends {
  refreshToken: string;
  refreshTokenExpiresIn: number;
}>(response: Parameters<RequestHandler>[1], result: T) => {
  setRefreshCookie(response, result.refreshToken, result.refreshTokenExpiresIn);
  const { refreshToken: _refreshToken, refreshTokenExpiresIn: _refreshExpires, ...data } = result;
  void _refreshToken;
  void _refreshExpires;
  return data;
};

const requireSessionHeader = (header: string | undefined) => {
  if (header !== "1") {
    throw new AppError(403, "PostgreSQL session header is required", "SESSION_HEADER_REQUIRED");
  }
};

export const login: RequestHandler = async (request, response) => {
  const body = request.validated?.body as { identifier: string; password: string };
  const result = await authService.login(body.identifier, body.password);
  response.json({ success: true, data: publicSession(response, result) });
};

export const refresh: RequestHandler = async (request, response) => {
  requireSessionHeader(request.header(POSTGRES_SESSION_HEADER));
  const refreshToken = readRefreshCookie(request);
  if (!refreshToken) {
    throw new AppError(401, "Refresh session is missing or expired", "INVALID_CREDENTIALS");
  }
  const result = await authService.refresh(refreshToken);
  response.json({ success: true, data: publicSession(response, result) });
};

export const logout: RequestHandler = async (request, response) => {
  requireSessionHeader(request.header(POSTGRES_SESSION_HEADER));
  const refreshToken = readRefreshCookie(request);
  if (refreshToken) await authService.logout(refreshToken);
  clearRefreshCookie(response);
  response.json({ success: true, data: { loggedOut: true } });
};
