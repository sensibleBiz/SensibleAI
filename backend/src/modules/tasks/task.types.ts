export const TASK_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] as const;
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskItem {
  id: string;
  outletId: string;
  taskNumber: string;
  title: string;
  description: string;
  taskType: string;
  priority: TaskPriority;
  priorityRank: number;
  status: TaskStatus;
  isOpen: boolean;
  assignedToUserId: string | null;
  assignedToName: string;
  assignedByUserId: string | null;
  assignedByName: string;
  assignedToDepartment: string;
  assignedAt: number | null;
  taskDate: string;
  dueAt: number;
  outletTimeZone: string;
  progressPercent: number;
  version: number;
  createdByUserId: string;
  createdByName: string;
  updatedByUserId: string;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface TaskCreateInput {
  outletId: string;
  title: string;
  description: string;
  taskType: string;
  priority: TaskPriority;
  assignedToUserId?: string;
  taskDate: string;
  dueAt: string;
  outletTimeZone: string;
}

export interface TaskUpdateInput {
  version: number;
  title?: string;
  description?: string;
  taskType?: string;
  priority?: TaskPriority;
  assignedToUserId?: string | null;
  taskDate?: string;
  dueAt?: string;
  outletTimeZone?: string;
}

export interface TaskStatusUpdateInput {
  outletId: string;
  version: number;
  status: TaskStatus;
  progressPercent?: number;
  reason: string;
}

export interface TaskListQuery {
  outletId: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignedTo?: string;
  q: string;
  dueFrom?: string;
  dueTo?: string;
  includeDeleted: boolean;
  cursor?: string;
  limit: number;
}

export interface TaskHistoryQuery {
  outletId: string;
  cursor?: string;
  limit: number;
}

export interface TaskHistoryItem {
  id: string;
  taskId: string;
  action: "CREATED" | "UPDATED" | "ASSIGNED" | "STATUS_CHANGED" | "DELETED";
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  reason: string;
  changedByUserId: string;
  changedByName: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown>;
  changedAt: number;
}

export interface TaskPage<T> {
  items: T[];
  nextCursor: string | null;
}
