import { z } from "zod";
import { TASK_PRIORITIES, TASK_STATUSES } from "./task.types.js";

const uuid = z.string().uuid();
const dateOnly = z.string().date();
const timestamp = z.string().datetime({ offset: true });
const timeZone = z.string().trim().min(1).max(80).default("Asia/Kolkata");
const version = z.coerce.number().int().min(1);
const cursor = z.string().trim().min(1).max(1000).optional();
const limit = z.coerce.number().int().min(1).max(100).optional().default(30);

export const postgresTaskIdParamsSchema = z.object({ taskId: uuid }).strict();
export const postgresTaskDetailQuerySchema = z.object({ outletId: uuid }).strict();
export const postgresTaskHistoryQuerySchema = z.object({ outletId: uuid, cursor, limit }).strict();
export const postgresTaskDeleteQuerySchema = z.object({ outletId: uuid, version }).strict();

export const postgresTaskListQuerySchema = z.object({
  outletId: uuid,
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignedTo: z.union([uuid, z.literal("me")]).optional(),
  q: z.string().trim().max(120).optional().default(""),
  dueFrom: dateOnly.optional(),
  dueTo: dateOnly.optional(),
  includeDeleted: z.enum(["true", "false"]).optional().default("false").transform((value) => value === "true"),
  cursor,
  limit,
}).strict().refine((value) => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo, {
  message: "dueFrom must not be after dueTo",
  path: ["dueTo"],
});

export const postgresTaskCreateSchema = z.object({
  outletId: uuid,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional().default(""),
  taskType: z.string().trim().min(1).max(80).optional().default("GENERAL"),
  priority: z.enum(TASK_PRIORITIES).optional().default("MEDIUM"),
  assignedToUserId: uuid.optional(),
  taskDate: dateOnly,
  dueAt: timestamp,
  outletTimeZone: timeZone,
}).strict();

export const postgresTaskUpdateSchema = z.object({
  outletId: uuid,
  version,
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  taskType: z.string().trim().min(1).max(80).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignedToUserId: uuid.nullable().optional(),
  taskDate: dateOnly.optional(),
  dueAt: timestamp.optional(),
  outletTimeZone: timeZone.optional(),
}).strict().refine((value) => Object.keys(value).some((key) => !["outletId", "version"].includes(key)), {
  message: "At least one task field is required",
});

export const postgresTaskStatusSchema = z.object({
  outletId: uuid,
  version,
  status: z.enum(TASK_STATUSES),
  progressPercent: z.coerce.number().int().min(0).max(100).optional(),
  reason: z.string().trim().max(1000).optional().default(""),
}).strict();
