import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { getPostgresCurrentUser } from "./currentUser.controller.js";
import {
  createPostgresPermission,
  deletePostgresPermission,
  getPostgresOutletFeatures,
  getPostgresPermissionUser,
  listPostgresFeatureOutlets,
  listPostgresPermissions,
  listPostgresPermissionUsers,
  updatePostgresOutletFeatures,
  updatePostgresPermission,
  updatePostgresPermissionUser,
} from "./postgresAccessControl.controller.js";
import {
  postgresOutletFeatureParamsSchema,
  postgresOutletFeatureQuerySchema,
  postgresOutletFeatureUpdateSchema,
  postgresOutletQuerySchema,
  postgresPermissionCreateSchema,
  postgresPermissionParamsSchema,
  postgresPermissionUpdateSchema,
  postgresUserAccessUpdateSchema,
  postgresUserParamsSchema,
} from "./postgresAccessControl.validator.js";

export const postgresAccessControlRouter = Router();
postgresAccessControlRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresAccessControlRouter.use(requirePostgresAuth);

postgresAccessControlRouter.get("/me", withRequestDatabaseContext(getPostgresCurrentUser));

postgresAccessControlRouter.get(
  "/permissions",
  validateRequest({ query: postgresOutletQuerySchema }),
  withRequestDatabaseContext(listPostgresPermissions),
);
postgresAccessControlRouter.post(
  "/permissions",
  validateRequest({ body: postgresPermissionCreateSchema }),
  withRequestDatabaseContext(createPostgresPermission),
);
postgresAccessControlRouter.patch(
  "/permissions/:resourceId",
  validateRequest({ params: postgresPermissionParamsSchema, body: postgresPermissionUpdateSchema }),
  withRequestDatabaseContext(updatePostgresPermission),
);
postgresAccessControlRouter.delete(
  "/permissions/:resourceId",
  validateRequest({ params: postgresPermissionParamsSchema, query: postgresOutletQuerySchema }),
  withRequestDatabaseContext(deletePostgresPermission),
);

postgresAccessControlRouter.get(
  "/users",
  validateRequest({ query: postgresOutletQuerySchema }),
  withRequestDatabaseContext(listPostgresPermissionUsers),
);
postgresAccessControlRouter.get(
  "/users/:resourceId",
  validateRequest({ params: postgresUserParamsSchema, query: postgresOutletQuerySchema }),
  withRequestDatabaseContext(getPostgresPermissionUser),
);
postgresAccessControlRouter.patch(
  "/users/:resourceId",
  validateRequest({ params: postgresUserParamsSchema, body: postgresUserAccessUpdateSchema }),
  withRequestDatabaseContext(updatePostgresPermissionUser),
);

postgresAccessControlRouter.get(
  "/outlets",
  validateRequest({ query: postgresOutletQuerySchema }),
  withRequestDatabaseContext(listPostgresFeatureOutlets),
);
postgresAccessControlRouter.get(
  "/outlets/:targetOutletId/features",
  validateRequest({
    params: postgresOutletFeatureParamsSchema,
    query: postgresOutletFeatureQuerySchema,
  }),
  withRequestDatabaseContext(getPostgresOutletFeatures),
);
postgresAccessControlRouter.patch(
  "/outlets/:targetOutletId/features",
  validateRequest({
    params: postgresOutletFeatureParamsSchema,
    body: postgresOutletFeatureUpdateSchema,
  }),
  withRequestDatabaseContext(updatePostgresOutletFeatures),
);
