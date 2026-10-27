import { apiRequest } from "@/shared/api";

export type TaskStatus = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TaskItem {
  id: string; outletId: string; taskNumber: string; title: string; description: string;
  taskType: string; priority: TaskPriority; priorityRank: number; status: TaskStatus;
  isOpen: boolean; assignedToUserId: string | null; assignedToName: string;
  assignedByUserId: string | null; assignedByName: string; assignedToDepartment: string;
  assignedAt: number | null; taskDate: string; dueAt: number; outletTimeZone: string;
  progressPercent: number; version: number; createdByUserId: string; createdByName: string;
  updatedByUserId: string; deletedAt: number | null; createdAt: number; updatedAt: number;
}
export interface TaskHistoryItem {
  id: string; taskId: string; action: "CREATED" | "UPDATED" | "ASSIGNED" | "STATUS_CHANGED" | "DELETED";
  fromStatus: TaskStatus | null; toStatus: TaskStatus; reason: string;
  changedByUserId: string; changedByName: string; oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown>; changedAt: number;
}
export interface TaskPage<T> { items: T[]; nextCursor: string | null }
export interface TaskCreateInput {
  outletId: string; title: string; description?: string; taskType?: string; priority?: TaskPriority;
  assignedToUserId?: string; taskDate: string; dueAt: string; outletTimeZone?: string;
}
export interface TaskUpdateInput {
  outletId: string; version: number; title?: string; description?: string; taskType?: string;
  priority?: TaskPriority; assignedToUserId?: string | null; taskDate?: string;
  dueAt?: string; outletTimeZone?: string;
}

const auth = { authMode: "postgres" as const };
const queryString = (values: Record<string, string | number | boolean | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "") query.set(key, String(value));
  });
  return query.toString();
};

export const taskApi = {
  list(input: {
    outletId: string; status?: TaskStatus; priority?: TaskPriority; assignedTo?: string;
    q?: string; dueFrom?: string; dueTo?: string; includeDeleted?: boolean; cursor?: string; limit?: number;
  }, signal?: AbortSignal) {
    return apiRequest<TaskPage<TaskItem>>(`/api/v1/tasks?${queryString(input)}`, { ...auth, signal });
  },
  get(outletId: string, taskId: string, signal?: AbortSignal) {
    return apiRequest<TaskItem>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}?outletId=${encodeURIComponent(outletId)}`,
      { ...auth, signal },
    );
  },
  create(input: TaskCreateInput) {
    return apiRequest<TaskItem>("/api/v1/tasks", { ...auth, method: "POST", body: input });
  },
  update(taskId: string, input: TaskUpdateInput) {
    return apiRequest<TaskItem>(`/api/v1/tasks/${encodeURIComponent(taskId)}`, {
      ...auth, method: "PATCH", body: input,
    });
  },
  updateStatus(taskId: string, input: {
    outletId: string; version: number; status: TaskStatus; progressPercent?: number; reason?: string;
  }) {
    return apiRequest<TaskItem>(`/api/v1/tasks/${encodeURIComponent(taskId)}/status`, {
      ...auth, method: "PATCH", body: input,
    });
  },
  history(outletId: string, taskId: string, cursor?: string, limit = 30, signal?: AbortSignal) {
    const query = queryString({ outletId, cursor, limit });
    return apiRequest<TaskPage<TaskHistoryItem>>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/history?${query}`, { ...auth, signal },
    );
  },
  archive(outletId: string, taskId: string, version: number) {
    const query = queryString({ outletId, version });
    return apiRequest<{ id: string; deleted: true; version: number }>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}?${query}`, { ...auth, method: "DELETE" },
    );
  },
};
