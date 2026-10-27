import type { RequestHandler } from "express";
import { AppError } from "../../errors/appError.js";
import { env } from "../../config/env.js";

/**
 * Pre-shared key guard for event gateway endpoints.
 *
 * These routes are intentionally unauthenticated (no user session) because
 * they are called by PhonePe payment callbacks and event registration kiosks.
 * This middleware protects them with a pre-shared API key so that only known
 * callers can reach them.
 *
 * Callers must include:  X-Event-Gateway-Key: <value of EVENT_GATEWAY_API_KEY>
 *
 * Fail-closed behavior:
 *   - If EVENT_GATEWAY_API_KEY is not configured → 503 (prevents silent open access)
 *   - If the header is missing or wrong → 401
 *
 * Set EVENT_GATEWAY_API_KEY to any random 32+ character string in all
 * environments (development, staging, production). There is no bypass mode.
 */
export const requireEventGatewayKey: RequestHandler = (request, _response, next) => {
  const configuredKey = env.events.gatewayApiKey;

  if (!configuredKey) {
    next(new AppError(
      503,
      "Event gateway is not configured: EVENT_GATEWAY_API_KEY must be set",
      "EVENT_GATEWAY_NOT_CONFIGURED",
    ));
    return;
  }

  const provided = request.header("X-Event-Gateway-Key");
  if (!provided || provided !== configuredKey) {
    next(new AppError(401, "Invalid or missing X-Event-Gateway-Key header", "EVENT_GATEWAY_UNAUTHORIZED"));
    return;
  }

  next();
};
