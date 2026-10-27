import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  apiRateLimiter,
  authRateLimiter,
  requestLogger,
  securityHeaders,
} from "./middleware/security.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");

// 1. Security headers & correlation ID
app.use(securityHeaders);

// 2. Structured JSON request logger (Cloud Run / Stackdriver)
app.use(requestLogger);

// 3. CORS & parsing
app.use(
  cors({
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
    credentials: true,
    exposedHeaders: ["X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  }),
);
app.use(express.json({ limit: "1mb" }));

// 4. Root ping / process liveness
app.get("/", (_request, response) => {
  response.json({
    success: true,
    message: "Sensible CRM API is running",
    health: "/api/v1/health",
  });
});

// 5. Rate limiting policies
app.use("/api/v1/auth", authRateLimiter);
app.use("/api/v1", apiRateLimiter);

// 6. Primary API routes & error handling
app.use("/api/v1", apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
