import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../errors/appError.js";
import { withDatabaseContext } from "../db/context.js";
import { PostgresAuthRepository } from "../modules/auth/auth.repository.js";
import { TokenService } from "../modules/auth/token.service.js";
import type { TransactionDatabase } from "../db/context.js";

const tokens = new TokenService();
const users = new PostgresAuthRepository();

const bearerToken = (header: string | undefined) => {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1];
};

export const requirePostgresAuth: RequestHandler = async (request, _response, next) => {
  const token = bearerToken(request.header("authorization"));
  if (!token) {
    next(new AppError(401, "Invalid or expired authentication token", "INVALID_AUTH_TOKEN"));
    return;
  }
  try {
    const claims = await tokens.verify(token, "access");
    const identity = await users.findByUserId(claims.sub);
    const membership = identity?.memberships.find((item) => item.tenantId === claims.tid && item.active);
    if (!identity?.userActive || !membership || identity.refreshTokenVersion !== claims.ver) throw new Error("inactive identity");
    request.postgresAuth = {
      userId: identity.userId,
      tenantId: membership.tenantId,
      isTenantAdmin: membership.isTenantAdmin,
    };
    next();
  } catch {
    next(new AppError(401, "Invalid or expired authentication token", "INVALID_AUTH_TOKEN"));
  }
};

export type RequestWithDatabaseContext = Request & {
  database: TransactionDatabase;
  tenantId: string;
  userId: string;
};

type TransactionalRequestHandler = (
  request: RequestWithDatabaseContext,
  response: Response,
) => Promise<void>;

export const withRequestDatabaseContext = (handler: TransactionalRequestHandler): RequestHandler =>
  async (request: Request, response: Response, next: NextFunction) => {
    const context = request.postgresAuth;
    if (!context) {
      next(new AppError(401, "Authentication is required", "AUTHENTICATION_REQUIRED"));
      return;
    }
    try {
      await withDatabaseContext(context, async (database) => {
        request.database = database;
        request.tenantId = context.tenantId;
        request.userId = context.userId;
        await handler(request as RequestWithDatabaseContext, response);
      });
    } catch (error) {
      next(error);
    } finally {
      delete request.database;
      delete request.tenantId;
      delete request.userId;
    }
  };
