import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type {
  OutletFeatureParams,
  OutletFeatureUpdateInput,
  OutletQuery,
  PermissionUpdateInput,
  PermissionWriteInput,
  ResourceParams,
  UserAccessUpdateInput,
} from "../../types/accessControl.types.js";
import { postgresAccessControlService } from "./postgresAccessControl.service.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth: request.postgresAuth, database: request.database };
};

const resourceId = (request: Request) => (request.validated?.params as ResourceParams).resourceId;

export const listPostgresPermissions = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const { outletId } = request.validated?.query as OutletQuery;
  const data = await postgresAccessControlService.listPermissions(database, auth.tenantId, auth.userId, outletId);
  response.setHeader("Cache-Control", "private, max-age=30");
  response.json({ success: true, data });
};

export const createPostgresPermission = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const data = await postgresAccessControlService.createPermission(
    database, auth.tenantId, auth.userId, request.validated?.body as PermissionWriteInput,
  );
  response.status(201).json({ success: true, data });
};

export const updatePostgresPermission = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const data = await postgresAccessControlService.updatePermission(
    database, auth.tenantId, auth.userId, resourceId(request), request.validated?.body as PermissionUpdateInput,
  );
  response.json({ success: true, data });
};

export const deletePostgresPermission = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const { outletId } = request.validated?.query as OutletQuery;
  const data = await postgresAccessControlService.deletePermission(
    database, auth.tenantId, auth.userId, outletId, resourceId(request),
  );
  response.json({ success: true, data });
};

export const listPostgresPermissionUsers = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const { outletId } = request.validated?.query as OutletQuery;
  const data = await postgresAccessControlService.listUsers(database, auth.tenantId, auth.userId, outletId);
  response.json({ success: true, data });
};

export const getPostgresPermissionUser = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const { outletId } = request.validated?.query as OutletQuery;
  const data = await postgresAccessControlService.getUserDetail(
    database, auth.tenantId, auth.userId, outletId, resourceId(request),
  );
  response.json({ success: true, data });
};

export const updatePostgresPermissionUser = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const data = await postgresAccessControlService.updateUserAccess(
    database, auth.tenantId, auth.userId, resourceId(request), request.validated?.body as UserAccessUpdateInput,
  );
  response.json({ success: true, data });
};

export const listPostgresFeatureOutlets = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const { outletId } = request.validated?.query as OutletQuery;
  const data = await postgresAccessControlService.listOutlets(database, auth.tenantId, auth.userId, outletId);
  response.json({ success: true, data });
};

export const getPostgresOutletFeatures = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const query = request.validated?.query as OutletQuery & { includeUserCount?: "true" | "false" };
  const { targetOutletId } = request.validated?.params as OutletFeatureParams;
  const data = await postgresAccessControlService.getOutletFeatures(
    database, auth.tenantId, auth.userId, query.outletId, targetOutletId, query.includeUserCount === "true",
  );
  response.json({ success: true, data });
};

export const updatePostgresOutletFeatures = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const input = request.validated?.body as OutletFeatureUpdateInput;
  const { targetOutletId } = request.validated?.params as OutletFeatureParams;
  const data = await postgresAccessControlService.saveOutletFeatures(
    database, auth.tenantId, auth.userId, input.outletId, targetOutletId, input,
  );
  response.json({ success: true, data });
};
