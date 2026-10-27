import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type {
  TaskCreateInput, TaskHistoryItem, TaskHistoryQuery, TaskItem, TaskListQuery,
  TaskPriority, TaskStatus, TaskUpdateInput,
} from "./task.types.js";

interface TaskRow extends QueryResultRow {
  id: string; outlet_id: string; task_number: string; title: string; description: string;
  task_type: string; priority: TaskPriority; priority_rank: number; status: TaskStatus;
  assigned_to_user_id: string | null; assigned_to_name: string; assigned_by_user_id: string | null;
  assigned_by_name: string; assigned_to_department: string; assigned_at: Date | null;
  task_date: string; due_at: Date; outlet_time_zone: string; progress_percent: number; version: number;
  created_by_user_id: string; created_by_name: string; updated_by_user_id: string;
  deleted_at: Date | null; created_at: Date; updated_at: Date;
}
interface HistoryRow extends QueryResultRow {
  id: string; task_id: string; action: TaskHistoryItem["action"]; from_status: TaskStatus | null;
  to_status: TaskStatus; reason: string; changed_by_user_id: string; changed_by_name: string;
  old_value: Record<string, unknown> | null; new_value: Record<string, unknown>; changed_at: Date;
}

const taskColumns = `task.id, task.outlet_id, task.task_number, task.title, task.description,
  task.task_type, task.priority, task.priority_rank, task.status, task.assigned_to_user_id,
  coalesce(assignee.display_name, '') AS assigned_to_name, task.assigned_by_user_id,
  coalesce(assigner.display_name, '') AS assigned_by_name, task.assigned_to_department,
  task.assigned_at, task.task_date::text, task.due_at, task.outlet_time_zone,
  task.progress_percent, task.version, task.created_by_user_id,
  coalesce(creator.display_name, '') AS created_by_name, task.updated_by_user_id,
  task.deleted_at, task.created_at, task.updated_at`;
const joins = `LEFT JOIN iam.users assignee ON assignee.id = task.assigned_to_user_id
  LEFT JOIN iam.users assigner ON assigner.id = task.assigned_by_user_id
  JOIN iam.users creator ON creator.id = task.created_by_user_id`;

const mapTask = (row: TaskRow): TaskItem => ({
  id: row.id, outletId: row.outlet_id, taskNumber: row.task_number, title: row.title,
  description: row.description, taskType: row.task_type, priority: row.priority,
  priorityRank: row.priority_rank, status: row.status,
  isOpen: !["COMPLETED", "CANCELLED"].includes(row.status),
  assignedToUserId: row.assigned_to_user_id, assignedToName: row.assigned_to_name,
  assignedByUserId: row.assigned_by_user_id, assignedByName: row.assigned_by_name,
  assignedToDepartment: row.assigned_to_department, assignedAt: row.assigned_at?.getTime() ?? null,
  taskDate: row.task_date, dueAt: row.due_at.getTime(), outletTimeZone: row.outlet_time_zone,
  progressPercent: row.progress_percent, version: row.version,
  createdByUserId: row.created_by_user_id, createdByName: row.created_by_name,
  updatedByUserId: row.updated_by_user_id, deletedAt: row.deleted_at?.getTime() ?? null,
  createdAt: row.created_at.getTime(), updatedAt: row.updated_at.getTime(),
});
const mapHistory = (row: HistoryRow): TaskHistoryItem => ({
  id: row.id, taskId: row.task_id, action: row.action, fromStatus: row.from_status,
  toStatus: row.to_status, reason: row.reason, changedByUserId: row.changed_by_user_id,
  changedByName: row.changed_by_name, oldValue: row.old_value, newValue: row.new_value,
  changedAt: row.changed_at.getTime(),
});

export class PostgresTaskRepository {
  async findAssignee(database: TransactionDatabase, tenantId: string, outletId: string, userId: string) {
    const result = await database.client.query<{ display_name: string; department: string }>(`
      SELECT usr.display_name, coalesce(max(team.department), '') AS department
      FROM tenancy.tenant_memberships membership
      JOIN iam.users usr ON usr.id = membership.user_id AND usr.active
      JOIN tenancy.outlet_assignments assignment
        ON assignment.tenant_id = membership.tenant_id AND assignment.user_id = membership.user_id
        AND assignment.outlet_id = $2 AND assignment.active
      LEFT JOIN crm.team_memberships team
        ON team.tenant_id = membership.tenant_id AND team.user_id = membership.user_id
        AND team.outlet_id = $2 AND team.active
      WHERE membership.tenant_id = $1 AND membership.user_id = $3 AND membership.active
      GROUP BY usr.display_name
    `, [tenantId, outletId, userId]);
    return result.rows[0] ?? null;
  }

  async get(database: TransactionDatabase, tenantId: string, outletId: string, taskId: string) {
    const result = await database.client.query<TaskRow>(`
      SELECT ${taskColumns} FROM crm.tasks task ${joins}
      WHERE task.tenant_id = $1 AND task.outlet_id = $2 AND task.id = $3
    `, [tenantId, outletId, taskId]);
    return result.rows[0] ? mapTask(result.rows[0]) : null;
  }

  async list(
    database: TransactionDatabase,
    tenantId: string,
    query: TaskListQuery,
    cursor: { updatedAt: number; id: string } | undefined,
  ) {
    const result = await database.client.query<TaskRow>(`
      SELECT ${taskColumns} FROM crm.tasks task ${joins}
      WHERE task.tenant_id = $1 AND task.outlet_id = $2
        AND ($3::varchar IS NULL OR task.status = $3)
        AND ($4::varchar IS NULL OR task.priority = $4)
        AND ($5::uuid IS NULL OR task.assigned_to_user_id = $5)
        AND ($6::text = '' OR task.title ILIKE '%' || $6 || '%'
          OR task.description ILIKE '%' || $6 || '%' OR task.task_number ILIKE '%' || $6 || '%')
        AND ($7::boolean OR task.deleted_at IS NULL)
        AND ($8::date IS NULL OR task.due_at >= $8::date)
        AND ($9::date IS NULL OR task.due_at < ($9::date + interval '1 day'))
        AND ($10::timestamptz IS NULL OR (task.updated_at, task.id) < ($10::timestamptz, $11::uuid))
      ORDER BY task.updated_at DESC, task.id DESC
      LIMIT $12
    `, [tenantId, query.outletId, query.status ?? null, query.priority ?? null,
      query.assignedTo ?? null, query.q, query.includeDeleted, query.dueFrom ?? null,
      query.dueTo ?? null, cursor ? new Date(cursor.updatedAt) : null, cursor?.id ?? null, query.limit + 1]);
    return result.rows.map(mapTask);
  }

  async create(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: TaskCreateInput,
    department: string,
  ) {
    const status: TaskStatus = input.assignedToUserId ? "ASSIGNED" : "OPEN";
    const result = await database.client.query<{ id: string }>(`
      WITH seed AS (SELECT public.uuid_generate_v7() AS id)
      INSERT INTO crm.tasks (
        id, tenant_id, outlet_id, task_number, title, description, task_type, priority,
        priority_rank, status, assigned_to_user_id, assigned_by_user_id, assigned_at,
        assigned_to_department, task_date, due_at, outlet_time_zone,
        created_by_user_id, updated_by_user_id
      )
      SELECT id, $1, $2, 'TASK-' || to_char(now(), 'YYYYMMDD') || '-' ||
        upper(substr(replace(id::text, '-', ''), 1, 8)), $3, $4, $5, $6, $7, $8,
        $9, CASE WHEN $9::uuid IS NULL THEN NULL ELSE $10::uuid END,
        CASE WHEN $9::uuid IS NULL THEN NULL ELSE now() END, $11, $12, $13, $14, $10, $10
      FROM seed RETURNING id
    `, [tenantId, input.outletId, input.title, input.description, input.taskType,
      input.priority, priorityRank(input.priority), status, input.assignedToUserId ?? null,
      userId, department, input.taskDate, new Date(input.dueAt), input.outletTimeZone]);
    return this.get(database, tenantId, input.outletId, result.rows[0]!.id);
  }

  async update(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    taskId: string,
    input: TaskUpdateInput,
    assignment: { department: string } | null | undefined,
  ) {
    const values: unknown[] = [tenantId, outletId, taskId, input.version, userId];
    const sets = ["updated_by_user_id = $5", "version = version + 1"];
    const add = (column: string, value: unknown, cast = "") => {
      values.push(value); sets.push(`${column} = $${values.length}${cast}`);
    };
    if (input.title !== undefined) add("title", input.title);
    if (input.description !== undefined) add("description", input.description);
    if (input.taskType !== undefined) add("task_type", input.taskType);
    if (input.priority !== undefined) {
      add("priority", input.priority); add("priority_rank", priorityRank(input.priority));
    }
    if (input.taskDate !== undefined) add("task_date", input.taskDate, "::date");
    if (input.dueAt !== undefined) add("due_at", new Date(input.dueAt));
    if (input.outletTimeZone !== undefined) add("outlet_time_zone", input.outletTimeZone);
    if (assignment !== undefined) {
      add("assigned_to_user_id", input.assignedToUserId ?? null, "::uuid");
      add("assigned_by_user_id", input.assignedToUserId ? userId : null, "::uuid");
      sets.push(`assigned_at = ${input.assignedToUserId ? "now()" : "NULL"}`);
      add("assigned_to_department", assignment?.department ?? "");
      if (input.assignedToUserId) sets.push("status = CASE WHEN status = 'OPEN' THEN 'ASSIGNED' ELSE status END");
      else sets.push("status = CASE WHEN status = 'ASSIGNED' THEN 'OPEN' ELSE status END");
    }
    const result = await database.client.query<{ id: string }>(`
      UPDATE crm.tasks SET ${sets.join(", ")}
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 AND version = $4 AND deleted_at IS NULL
      RETURNING id
    `, values);
    if (!result.rows[0]) return null;
    return this.get(database, tenantId, outletId, taskId);
  }

  async updateStatus(
    database: TransactionDatabase, tenantId: string, userId: string, outletId: string,
    taskId: string, version: number, status: TaskStatus, progressPercent: number,
  ) {
    const result = await database.client.query<{ id: string }>(`
      UPDATE crm.tasks SET status = $6, progress_percent = $7, updated_by_user_id = $5,
        version = version + 1
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 AND version = $4 AND deleted_at IS NULL
      RETURNING id
    `, [tenantId, outletId, taskId, version, userId, status, progressPercent]);
    return result.rows[0] ? this.get(database, tenantId, outletId, taskId) : null;
  }

  async archive(
    database: TransactionDatabase, tenantId: string, userId: string,
    outletId: string, taskId: string, version: number,
  ) {
    const result = await database.client.query<{ id: string }>(`
      UPDATE crm.tasks SET deleted_at = now(), status = 'CANCELLED',
        updated_by_user_id = $5, version = version + 1
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 AND version = $4 AND deleted_at IS NULL
      RETURNING id
    `, [tenantId, outletId, taskId, version, userId]);
    return result.rows[0] ? this.get(database, tenantId, outletId, taskId) : null;
  }

  async recordHistory(
    database: TransactionDatabase, tenantId: string, outletId: string, taskId: string,
    userId: string, action: TaskHistoryItem["action"], fromStatus: TaskStatus | null,
    toStatus: TaskStatus, reason: string, oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown>,
  ) {
    await database.client.query(`
      INSERT INTO crm.task_status_history (
        tenant_id, outlet_id, task_id, action, from_status, to_status, reason,
        changed_by_user_id, changed_by_name, old_value, new_value
      ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,usr.display_name,$9::jsonb,$10::jsonb
      FROM iam.users usr WHERE usr.id = $8
    `, [tenantId, outletId, taskId, action, fromStatus, toStatus, reason, userId,
      oldValue ? JSON.stringify(oldValue) : null, JSON.stringify(newValue)]);
  }

  async listHistory(
    database: TransactionDatabase, tenantId: string, taskId: string, query: TaskHistoryQuery,
    cursor: { changedAt: number; id: string } | undefined,
  ) {
    const result = await database.client.query<HistoryRow>(`
      SELECT id, task_id, action, from_status, to_status, reason, changed_by_user_id,
        changed_by_name, old_value, new_value, changed_at
      FROM crm.task_status_history
      WHERE tenant_id = $1 AND outlet_id = $2 AND task_id = $3
        AND ($4::timestamptz IS NULL OR (changed_at, id) < ($4::timestamptz, $5::uuid))
      ORDER BY changed_at DESC, id DESC LIMIT $6
    `, [tenantId, query.outletId, taskId, cursor ? new Date(cursor.changedAt) : null,
      cursor?.id ?? null, query.limit + 1]);
    return result.rows.map(mapHistory);
  }
}

const priorityRank = (priority: TaskPriority) => ({ LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 })[priority];
export const postgresTaskRepository = new PostgresTaskRepository();
