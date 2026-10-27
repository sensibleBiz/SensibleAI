/**
 * Security & Observability middleware:
 * - Security HTTP headers (helmet-equivalent, zero external dependencies)
 * - Structured JSON request logging with X-Request-Id correlation
 * - In-process token-bucket rate limiting per IP
 */

import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

// ---------------------------------------------------------------------------
// 1. Security Headers Middleware (Zero external deps)
// ---------------------------------------------------------------------------

export const securityHeaders: RequestHandler = (request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.setHeader("Content-Security-Policy", "default-src 'none'");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");

  // Generate or forward unique request ID for distributed tracing
  const incomingId = request.header("X-Request-Id");
  const requestId = incomingId && incomingId.trim().length > 0 ? incomingId.trim() : crypto.randomUUID();
  response.setHeader("X-Request-Id", requestId);
  (request as Request & { requestId: string }).requestId = requestId;

  next();
};

// ---------------------------------------------------------------------------
// 2. Structured JSON Request Logger (Cloud Run / Stackdriver compatible)
// ---------------------------------------------------------------------------

export const requestLogger: RequestHandler = (request, response, next) => {
  const startTime = Date.now();
  const requestId = (request as Request & { requestId?: string }).requestId || "none";
  const method = request.method;
  const url = request.originalUrl || request.url;
  const ip =
    (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    request.socket.remoteAddress ||
    "unknown";

  response.on("finish", () => {
    // Avoid spamming logs for frequent health checks
    if (url === "/api/v1/health" || url === "/api/v1/health/live" || url === "/") {
      return;
    }

    const durationMs = Date.now() - startTime;
    const statusCode = response.statusCode;
    const logLevel = statusCode >= 500 ? "ERROR" : statusCode >= 400 ? "WARN" : "INFO";

    const logEntry = {
      timestamp: new Date().toISOString(),
      severity: logLevel,
      requestId,
      method,
      url,
      statusCode,
      durationMs,
      ip,
      userAgent: request.headers["user-agent"] || "",
    };

    if (logLevel === "ERROR") {
      console.error(JSON.stringify(logEntry));
    } else if (logLevel === "WARN") {
      console.warn(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  });

  next();
};

// ---------------------------------------------------------------------------
// 3. In-process Token-Bucket Rate Limiter
// ---------------------------------------------------------------------------

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  message?: string;
}

export const createRateLimiter = (options: RateLimiterOptions): RequestHandler => {
  const { maxRequests, windowMs, message = "Too many requests, please try again later." } = options;
  const buckets = new Map<string, BucketEntry>();

  const pruneInterval = setInterval(() => {
    const cutoff = Date.now() - windowMs * 2;
    for (const [ip, entry] of buckets) {
      if (entry.lastRefill < cutoff) buckets.delete(ip);
    }
  }, 5 * 60 * 1_000);
  pruneInterval.unref();

  return (request: Request, response: Response, next: NextFunction) => {
    const ip =
      (request.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      request.socket.remoteAddress ||
      "unknown";

    const now = Date.now();
    let entry = buckets.get(ip);

    if (!entry || now - entry.lastRefill >= windowMs) {
      entry = { tokens: maxRequests, lastRefill: now };
      buckets.set(ip, entry);
    }

    if (entry.tokens <= 0) {
      const retryAfterSeconds = Math.ceil(windowMs / 1_000);
      response.setHeader("Retry-After", String(retryAfterSeconds));
      response.setHeader("X-RateLimit-Limit", String(maxRequests));
      response.setHeader("X-RateLimit-Remaining", "0");
      response.setHeader("X-RateLimit-Reset", String(Math.ceil((entry.lastRefill + windowMs) / 1_000)));
      response.status(429).json({ success: false, message, code: "RATE_LIMIT_EXCEEDED" });
      return;
    }

    entry.tokens -= 1;
    response.setHeader("X-RateLimit-Limit", String(maxRequests));
    response.setHeader("X-RateLimit-Remaining", String(entry.tokens));
    response.setHeader("X-RateLimit-Reset", String(Math.ceil((entry.lastRefill + windowMs) / 1_000)));
    next();
  };
};

export const apiRateLimiter = createRateLimiter({ maxRequests: 300, windowMs: 60_000 });
export const authRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60_000,
  message: "Too many authentication attempts. Please wait before trying again.",
});
export const eventGatewayRateLimiter = createRateLimiter({ maxRequests: 60, windowMs: 60_000 });
