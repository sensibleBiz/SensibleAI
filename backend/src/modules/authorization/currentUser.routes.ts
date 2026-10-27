import { Router } from "express";
import {
  requirePostgresAuth,
  withRequestDatabaseContext,
} from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  getPostgresCurrentUser,
  updatePostgresCurrentUser,
} from "./currentUser.controller.js";
import { currentUserProfileUpdateSchema } from "./currentUser.validator.js";

export const postgresCurrentUserRouter = Router();

postgresCurrentUserRouter.get(
  "/me",
  requirePostgresAuth,
  withRequestDatabaseContext(getPostgresCurrentUser),
);

postgresCurrentUserRouter.patch(
  "/me",
  requirePostgresAuth,
  validateRequest({ body: currentUserProfileUpdateSchema }),
  withRequestDatabaseContext(updatePostgresCurrentUser),
);
