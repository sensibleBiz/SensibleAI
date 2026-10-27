import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  createPostgresTask, deletePostgresTask, getPostgresTask, listPostgresTaskHistory,
  listPostgresTasks, updatePostgresTask, updatePostgresTaskStatus,
} from "./postgresTask.controller.js";
import {
  postgresTaskCreateSchema, postgresTaskDeleteQuerySchema, postgresTaskDetailQuerySchema,
  postgresTaskHistoryQuerySchema, postgresTaskIdParamsSchema, postgresTaskListQuerySchema,
  postgresTaskStatusSchema, postgresTaskUpdateSchema,
} from "./postgresTask.validator.js";

export const postgresTaskRouter = Router();
postgresTaskRouter.use(requirePostgresAuth);
postgresTaskRouter.get("/", validateRequest({ query: postgresTaskListQuerySchema }), withRequestDatabaseContext(listPostgresTasks));
postgresTaskRouter.post("/", validateRequest({ body: postgresTaskCreateSchema }), withRequestDatabaseContext(createPostgresTask));
postgresTaskRouter.get("/:taskId/history", validateRequest({ params: postgresTaskIdParamsSchema, query: postgresTaskHistoryQuerySchema }), withRequestDatabaseContext(listPostgresTaskHistory));
postgresTaskRouter.get("/:taskId", validateRequest({ params: postgresTaskIdParamsSchema, query: postgresTaskDetailQuerySchema }), withRequestDatabaseContext(getPostgresTask));
postgresTaskRouter.patch("/:taskId", validateRequest({ params: postgresTaskIdParamsSchema, body: postgresTaskUpdateSchema }), withRequestDatabaseContext(updatePostgresTask));
postgresTaskRouter.patch("/:taskId/status", validateRequest({ params: postgresTaskIdParamsSchema, body: postgresTaskStatusSchema }), withRequestDatabaseContext(updatePostgresTaskStatus));
postgresTaskRouter.delete("/:taskId", validateRequest({ params: postgresTaskIdParamsSchema, query: postgresTaskDeleteQuerySchema }), withRequestDatabaseContext(deletePostgresTask));
