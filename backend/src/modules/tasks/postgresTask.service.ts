import { z } from "zod";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { postgresTaskRepository } from "./postgresTask.repository.js";
import type {
  TaskCreateInput, TaskHistoryItem, TaskHistoryQuery, TaskItem, TaskListQuery,
  TaskPage, TaskStatus, TaskStatusUpdateInput, TaskUpdateInput,
} from "./task.types.js";

const cursorSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.number().int().nonnegative(),
});
const terminal = new Set<TaskStatus>(["COMPLETED", "CANCELLED"]);
const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  OPEN: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["OPEN", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["ASSIGNED", "BLOCKED", "COMPLETED", "CANCELLED"],
  BLOCKED: ["ASSIGNED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["ASSIGNED"],
  CANCELLED: ["ASSIGNED"],
};

const decodeCursor = (value?: string) => {
  if (!value) return undefined;
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return { id: parsed.id, timestamp: parsed.timestamp };
  } catch {
    throw new AppError(400, "Invalid pagination cursor", "INVALID_CURSOR");
  }
};
const encodeCursor = (id: string, timestamp: number) =>
  Buffer.from(JSON.stringify({ id, timestamp }), "utf8").toString("base64url");
const snapshot = (task: TaskItem): Record<string, unknown> => ({
  taskNumber: task.taskNumber, title: task.title, description: task.description,
  taskType: task.taskType, priority: task.priority, status: task.status,
  assignedTo: task.assignedToUserId, assignedToName: task.assignedToName,
  progressPercent: task.progressPercent, taskDate: task.taskDate, dueAt: task.dueAt,
  version: task.version, deletedAt: task.deletedAt,
});

export class PostgresTaskService {
  private async hasPermission(
    database: TransactionDatabase, tenantId: string, userId: string, outletId: string, permission: string,
  ) {
    return postgresAuthorizationRepository.hasOutletPermission(database, userId, tenantId, outletId, permission);
  }

  private async requirePermission(
    database: TransactionDatabase, tenantId: string, userId: string, outletId: string, permission: string,
  ) {
    if (!await this.hasPermission(database, tenantId, userId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  private async requireTask(
    database: TransactionDatabase, tenantId: string, outletId: string, taskId: string,
  ) {
    const task = await postgresTaskRepository.get(database, tenantId, outletId, taskId);
    if (!task) throw new AppError(404, "Task not found", "TASK_NOT_FOUND");
    return task;
  }

  async list(
    database: TransactionDatabase, tenantId: string, userId: string, query: TaskListQuery,
  ): Promise<TaskPage<TaskItem>> {
    const assignedTo = query.assignedTo === "me" ? userId : query.assignedTo;
    if (assignedTo !== userId) {
      await this.requirePermission(database, tenantId, userId, query.outletId, "tasks.read");
    }
    const cursor = decodeCursor(query.cursor);
    const records = await postgresTaskRepository.list(
      database, tenantId, { ...query, ...(assignedTo ? { assignedTo } : {}) },
      cursor ? { id: cursor.id, updatedAt: cursor.timestamp } : undefined,
    );
    const hasMore = records.length > query.limit;
    const items = records.slice(0, query.limit);
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last ? encodeCursor(last.id, last.updatedAt) : null };
  }

  async get(
    database: TransactionDatabase, tenantId: string, userId: string, outletId: string, taskId: string,
  ) {
    const task = await this.requireTask(database, tenantId, outletId, taskId);
    if (task.assignedToUserId !== userId && task.createdByUserId !== userId) {
      await this.requirePermission(database, tenantId, userId, outletId, "tasks.read");
    }
    return task;
  }

  async create(
    database: TransactionDatabase, tenantId: string, userId: string, input: TaskCreateInput,
  ) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "tasks.create");
    let department = "";
    if (input.assignedToUserId) {
      await this.requirePermission(database, tenantId, userId, input.outletId, "tasks.assign");
      const assignee = await postgresTaskRepository.findAssignee(
        database, tenantId, input.outletId, input.assignedToUserId,
      );
      if (!assignee) throw new AppError(400, "Assignee is inactive or does not belong to this outlet", "INVALID_TASK_ASSIGNEE");
      department = assignee.department;
    }
    const task = await postgresTaskRepository.create(database, tenantId, userId, input, department);
    if (!task) throw new AppError(500, "Task could not be created", "TASK_CREATE_FAILED");
    await postgresTaskRepository.recordHistory(
      database, tenantId, input.outletId, task.id, userId, "CREATED", null,
      task.status, "", null, snapshot(task),
    );
    return task;
  }

  async update(
    database: TransactionDatabase, tenantId: string, userId: string,
    outletId: string, taskId: string, input: TaskUpdateInput,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "tasks.update");
    const current = await this.requireTask(database, tenantId, outletId, taskId);
    let assignment: { department: string } | null | undefined;
    if (input.assignedToUserId !== undefined) {
      await this.requirePermission(database, tenantId, userId, outletId, "tasks.assign");
      if (input.assignedToUserId) {
        const assignee = await postgresTaskRepository.findAssignee(
          database, tenantId, outletId, input.assignedToUserId,
        );
        if (!assignee) throw new AppError(400, "Assignee is inactive or does not belong to this outlet", "INVALID_TASK_ASSIGNEE");
        assignment = { department: assignee.department };
      } else {
        assignment = null;
      }
    }
    const updated = await postgresTaskRepository.update(
      database, tenantId, userId, outletId, taskId, input, assignment,
    );
    if (!updated) throw new AppError(409, "Task was modified by another request", "TASK_VERSION_CONFLICT");
    await postgresTaskRepository.recordHistory(
      database, tenantId, outletId, taskId, userId,
      input.assignedToUserId !== undefined ? "ASSIGNED" : "UPDATED",
      current.status, updated.status, "", snapshot(current), snapshot(updated),
    );
    return updated;
  }

  async updateStatus(
    database: TransactionDatabase, tenantId: string, userId: string,
    taskId: string, input: TaskStatusUpdateInput,
  ) {
    const current = await this.requireTask(database, tenantId, input.outletId, taskId);
    if (current.assignedToUserId !== userId) {
      await this.requirePermission(database, tenantId, userId, input.outletId, "tasks.update");
    }
    if (input.status !== current.status && !transitions[current.status].includes(input.status)) {
      throw new AppError(409, `Task cannot move from ${current.status} to ${input.status}`, "INVALID_TASK_STATUS_TRANSITION");
    }
    const progress = input.status === "COMPLETED"
      ? 100
      : input.progressPercent ?? current.progressPercent;
    if (!terminal.has(input.status) && progress === 100) {
      throw new AppError(400, "Only completed tasks can have 100 percent progress", "INVALID_TASK_PROGRESS");
    }
    const updated = await postgresTaskRepository.updateStatus(
      database, tenantId, userId, input.outletId, taskId, input.version, input.status, progress,
    );
    if (!updated) throw new AppError(409, "Task was modified by another request", "TASK_VERSION_CONFLICT");
    await postgresTaskRepository.recordHistory(
      database, tenantId, input.outletId, taskId, userId, "STATUS_CHANGED",
      current.status, updated.status, input.reason, snapshot(current), snapshot(updated),
    );
    return updated;
  }

  async archive(
    database: TransactionDatabase, tenantId: string, userId: string,
    outletId: string, taskId: string, version: number,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "tasks.delete");
    const current = await this.requireTask(database, tenantId, outletId, taskId);
    const updated = await postgresTaskRepository.archive(
      database, tenantId, userId, outletId, taskId, version,
    );
    if (!updated) throw new AppError(409, "Task was modified by another request", "TASK_VERSION_CONFLICT");
    await postgresTaskRepository.recordHistory(
      database, tenantId, outletId, taskId, userId, "DELETED",
      current.status, updated.status, "Task archived", snapshot(current), snapshot(updated),
    );
    return { id: taskId, deleted: true as const, version: updated.version };
  }

  async history(
    database: TransactionDatabase, tenantId: string, userId: string,
    taskId: string, query: TaskHistoryQuery,
  ): Promise<TaskPage<TaskHistoryItem>> {
    await this.get(database, tenantId, userId, query.outletId, taskId);
    const cursor = decodeCursor(query.cursor);
    const records = await postgresTaskRepository.listHistory(
      database, tenantId, taskId, query,
      cursor ? { id: cursor.id, changedAt: cursor.timestamp } : undefined,
    );
    const hasMore = records.length > query.limit;
    const items = records.slice(0, query.limit);
    const last = items.at(-1);
    return { items, nextCursor: hasMore && last ? encodeCursor(last.id, last.changedAt) : null };
  }
}

export const postgresTaskService = new PostgresTaskService();
