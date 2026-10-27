import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import { postgresTaskService } from "./postgresTask.service.js";
import type {
  TaskCreateInput, TaskHistoryQuery, TaskListQuery, TaskStatusUpdateInput, TaskUpdateInput,
} from "./task.types.js";

const context = (request: Request) => {
  if (!request.database || !request.postgresAuth) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { database: request.database, auth: request.postgresAuth };
};

export const listPostgresTasks = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const data = await postgresTaskService.list(
    database, auth.tenantId, auth.userId, request.validated?.query as TaskListQuery,
  );
  response.json({ success: true, data });
};
export const getPostgresTask = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const { taskId } = request.validated?.params as { taskId: string };
  const { outletId } = request.validated?.query as { outletId: string };
  const data = await postgresTaskService.get(database, auth.tenantId, auth.userId, outletId, taskId);
  response.json({ success: true, data });
};
export const createPostgresTask = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const data = await postgresTaskService.create(
    database, auth.tenantId, auth.userId, request.validated?.body as TaskCreateInput,
  );
  response.status(201).json({ success: true, data });
};
export const updatePostgresTask = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const { taskId } = request.validated?.params as { taskId: string };
  const { outletId, ...input } = request.validated?.body as TaskUpdateInput & { outletId: string };
  const data = await postgresTaskService.update(database, auth.tenantId, auth.userId, outletId, taskId, input);
  response.json({ success: true, data });
};
export const updatePostgresTaskStatus = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const { taskId } = request.validated?.params as { taskId: string };
  const data = await postgresTaskService.updateStatus(
    database, auth.tenantId, auth.userId, taskId, request.validated?.body as TaskStatusUpdateInput,
  );
  response.json({ success: true, data });
};
export const deletePostgresTask = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const { taskId } = request.validated?.params as { taskId: string };
  const { outletId, version } = request.validated?.query as { outletId: string; version: number };
  const data = await postgresTaskService.archive(database, auth.tenantId, auth.userId, outletId, taskId, version);
  response.json({ success: true, data });
};
export const listPostgresTaskHistory = async (request: Request, response: Response) => {
  const { database, auth } = context(request);
  const { taskId } = request.validated?.params as { taskId: string };
  const data = await postgresTaskService.history(
    database, auth.tenantId, auth.userId, taskId, request.validated?.query as TaskHistoryQuery,
  );
  response.json({ success: true, data });
};
