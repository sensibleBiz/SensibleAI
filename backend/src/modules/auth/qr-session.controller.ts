import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError.js";
import { qrSessionService } from "./qr-session.service.js";
import { PostgresAuthRepository } from "./auth.repository.js";
import { authService } from "./auth.service.js";
import { publicSession } from "./auth.controller.js";

const users = new PostgresAuthRepository();

const sessionId = (request: Parameters<RequestHandler>[0]) =>
  (request.validated?.params as { sessionId: string }).sessionId;

export const createQrSession: RequestHandler = async (_request, response) => {
  response.status(201).json({ success: true, data: await qrSessionService.create() });
};

export const getQrSession: RequestHandler = async (request, response) => {
  response.json({ success: true, data: await qrSessionService.get(sessionId(request)) });
};

export const claimQrSession: RequestHandler = async (request, response) => {
  const phone = request.auth?.token.phone_number;
  if (typeof phone !== "string" || !phone.trim()) throw new AppError(403, "Phone OTP authentication is required", "PHONE_VERIFICATION_REQUIRED");
  const identity = await users.findByIdentifier(phone.trim());
  if (!identity?.userActive) throw new AppError(403, "PostgreSQL user account was not found", "POSTGRES_USER_NOT_FOUND");
  response.json({ success: true, data: await qrSessionService.claim(sessionId(request), identity.userId) });
};

export const exchangeQrSession: RequestHandler = async (request, response) => {
  const userId = await qrSessionService.consume(sessionId(request));
  const session = await authService.issueVerified(userId);
  response.json({ success: true, data: publicSession(response, session) });
};
