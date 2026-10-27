import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../errors/appError.js";

const bearerToken = (header: string | undefined) => {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
};

export const requireBiometricIngestAuth = (request: Request, _response: Response, next: NextFunction) => {
  const configured = env.biometric.ingestToken;
  if (!configured) {
    next(new AppError(503, "Biometric ingest is not configured", "BIOMETRIC_INGEST_DISABLED"));
    return;
  }
  const token = bearerToken(request.header("authorization"));
  if (!token || token !== configured) {
    next(new AppError(401, "Invalid biometric ingest credentials", "BIOMETRIC_INGEST_UNAUTHORIZED"));
    return;
  }
  next();
};
