import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import { postgresAuthorizationRepository } from "./postgresAuthorization.repository.js";
import { currentUserService } from "./currentUser.service.js";
import type { CurrentUserProfileUpdateInput } from "./currentUser.validator.js";

export const getPostgresCurrentUser = async (request: Request, response: Response) => {
  const auth = request.postgresAuth;
  const database = request.database;
  if (!auth || !database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  const access = await postgresAuthorizationRepository.getCurrentAccess(
    database,
    auth.userId,
    auth.tenantId,
  );
  response.json({ success: true, data: access });
};

export const updatePostgresCurrentUser = async (request: Request, response: Response) => {
  const auth = request.postgresAuth;
  const database = request.database;
  if (!auth || !database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  const access = await currentUserService.updateProfile(
    database,
    auth.userId,
    auth.tenantId,
    request.validated?.body as CurrentUserProfileUpdateInput,
  );
  response.json({ success: true, data: access });
};
