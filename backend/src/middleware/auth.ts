import type { NextFunction, Request, Response } from "express";
import { firebaseAuth } from "../config/firebase.js";
import { AppError } from "../errors/appError.js";

const getBearerToken = (authorizationHeader?: string) => {
  if (!authorizationHeader) return undefined;

  const [scheme, token, ...extraParts] = authorizationHeader.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extraParts.length > 0) {
    return undefined;
  }

  return token;
};

export const requireAuth = async (
  request: Request,
  _response: Response,
  next: NextFunction,
) => {
  const token = getBearerToken(request.header("authorization"));

  if (!token) {
    next(new AppError(401, "Authentication is required", "AUTHENTICATION_REQUIRED"));
    return;
  }

  try {
    const decodedToken = await firebaseAuth.verifyIdToken(token);
    request.auth = { token: decodedToken, uid: decodedToken.uid };
    next();
  } catch {
    next(new AppError(401, "Invalid or expired authentication token", "INVALID_AUTH_TOKEN"));
  }
};

