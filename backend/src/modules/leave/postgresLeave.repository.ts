import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import type {
  HolidayCreateInput, HolidayItem, HolidayUpdateInput, LeaveBalanceHistoryItem,
  LeaveBalanceItem, LeaveBalanceQuery, LeaveBalanceUpdateInput, LeaveCursor,
  LeaveDocument, LeaveListQuery, LeaveRequestCreateInput, LeaveStatusInput,
  LeaveTypeCreateInput, LeaveTypeDocument,
} from "../../types/leave.types.js";
import { calculateLeaveBalanceAdjustment } from "./leaveHelpers.js";

const DEFAULT_LEAVE_TYPES = [
  { name: "PERSONAL LEAVE", shortCode: "PL" },
  { name: "MEDICAL LEAVE", shortCode: "ML" },
] as const;

const mapLeaveRow = (row: QueryResultRow & Record<string, unknown>): LeaveDocument => ({
  id: String(row.id),
  data: {
    actionTakenBy: row.action_taken_by ?? "",
    createdDate: Number(row.created_date),
    dayId: row.day_id,
    duration: row.duration,
    fromDate: Number(row.from_date),
    leaveNote: row.leave_note,
    leaveType: row.leave_type,
    managerId: row.manager_user_id ?? "",
    managerName: row.manager_name,
    monthId: row.month_id,
    noDays: Number(row.no_days),
    remark: row.remark,
    status: row.status,
    toDate: Number(row.to_date),
    updateddate: Number(row.updated_date),
    userName: row.user_name ?? "",
    userProfileId: row.user_id,
  },
  cursor: { id: String(row.id), createdDate: Number(row.created_date) },
});

export class PostgresLeaveRepository {
  async resolveOutletBusiness(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<{ business_id: string }>(
      "SELECT business_id FROM tenancy.outlets WHERE tenant_id = $1 AND id = $2 AND active",
      [tenantId, outletId],
    );
    return result.rows[0]?.business_id ?? null;
  }

  async ensureDefaultLeaveTypes(database: TransactionDatabase, tenantId: string, outletId: string, businessId: string) {
    for (const leaveType of DEFAULT_LEAVE_TYPES) {
      await database.client.query(
        `INSERT INTO crm.leave_types (tenant_id, business_id, outlet_id, name, short_code)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, outlet_id, short_code) DO NOTHING`,
        [tenantId, businessId, outletId, leaveType.name, leaveType.shortCode],
      );
    }
  }

  async listLeaveTypes(database: TransactionDatabase, tenantId: string, outletId: string): Promise<LeaveTypeDocument[]> {
    const result = await database.client.query<{ id: string; name: string; short_code: string }>(
      "SELECT id, name, short_code FROM crm.leave_types WHERE tenant_id = $1 AND outlet_id = $2 AND active ORDER BY name",
      [tenantId, outletId],
    );
    return result.rows.map((row) => ({ id: row.id, data: { id: row.id, name: row.name, shortCode: row.short_code } }));
  }

  async createLeaveType(database: TransactionDatabase, tenantId: string, businessId: string, input: LeaveTypeCreateInput): Promise<LeaveTypeDocument | null> {
    const result = await database.client.query<{ id: string; name: string; short_code: string }>(
      `INSERT INTO crm.leave_types (tenant_id, business_id, outlet_id, name, short_code)
       SELECT $1, $2, $3, $4::varchar(200), $5::varchar(20)
       WHERE NOT EXISTS (
         SELECT 1 FROM crm.leave_types
         WHERE tenant_id = $1 AND outlet_id = $3
           AND (upper(name) = upper($4::text) OR upper(short_code) = upper($5::text))
       )
       RETURNING id, name, short_code`,
      [tenantId, businessId, input.outletId, input.name, input.shortCode],
    );
    const row = result.rows[0];
    return row ? { id: row.id, data: { id: row.id, name: row.name, shortCode: row.short_code } } : null;
  }

  async listMonthBatch(
    database: TransactionDatabase,
    tenantId: string,
    query: LeaveListQuery,
    monthStart: number,
    monthEnd: number,
    cursor: LeaveCursor | undefined,
    limit: number,
  ): Promise<LeaveDocument[]> {
    const params: unknown[] = [tenantId, query.outletId, monthStart, monthEnd];
    let cursorClause = "";
    if (cursor) {
      params.push(cursor.createdDate, cursor.id);
      cursorClause = `AND (created_date, id) < ($${params.length - 1}, $${params.length}::uuid)`;
    }
    params.push(limit);
    const result = await database.client.query(
      `SELECT * FROM crm.leave_requests
       WHERE tenant_id = $1 AND outlet_id = $2 AND created_date >= $3 AND created_date <= $4
         ${cursorClause}
       ORDER BY created_date DESC, id DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map((row) => mapLeaveRow(row as QueryResultRow & Record<string, unknown>));
  }

  async listBalances(database: TransactionDatabase, tenantId: string, query: LeaveBalanceQuery): Promise<LeaveBalanceItem[]> {
    const result = await database.client.query(
      `SELECT DISTINCT ON (team.user_id)
         coalesce(balance.id, team.user_id) AS id, team.user_id, usr.display_name AS user_name, team.emp_code,
         team.department AS designation, manager.user_id AS manager_id,
         manager_user.display_name AS manager_name,
         coalesce(balance.total_leaves, 0)::text AS total_leaves,
         coalesce(balance.used_leaves, 0)::text AS used_leaves,
         coalesce(balance.remaining_leaves, 0)::text AS remaining_leaves,
         $3::int AS year, coalesce(balance.last_updated, 0)::text AS last_updated
       FROM crm.team_memberships team
       JOIN iam.users usr ON usr.id = team.user_id AND usr.active
       LEFT JOIN crm.user_profiles manager ON manager.id = team.manager_profile_id AND manager.tenant_id = team.tenant_id
       LEFT JOIN iam.users manager_user ON manager_user.id = manager.user_id
       LEFT JOIN crm.leave_balances balance
         ON balance.tenant_id = team.tenant_id AND balance.outlet_id = team.outlet_id
        AND balance.user_id = team.user_id AND balance.year = $3
       WHERE team.tenant_id = $1 AND team.outlet_id = $2 AND team.active
         AND ($4::uuid IS NULL OR team.user_id = $4)
       ORDER BY team.user_id, team.updated_at DESC`,
      [tenantId, query.outletId, query.year, query.userId ?? null],
    );
    return result.rows.map((row) => ({
      ...(row.id ? { id: String(row.id) } : {}),
      userId: String(row.user_id),
      userName: String(row.user_name ?? ""),
      empCode: String(row.emp_code ?? ""),
      designation: String(row.designation ?? ""),
      managerId: String(row.manager_id ?? ""),
      managerName: String(row.manager_name ?? ""),
      totalLeaves: Number(row.total_leaves),
      usedLeaves: Number(row.used_leaves),
      remainingLeaves: Number(row.remaining_leaves),
      year: Number(row.year),
      lastUpdated: Number(row.last_updated),
    }));
  }

  async updateBalance(
    database: TransactionDatabase, tenantId: string, actorId: string, userId: string, input: LeaveBalanceUpdateInput,
  ): Promise<LeaveBalanceItem | null> {
    const member = await database.client.query(
      `SELECT 1 FROM crm.team_memberships
       WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND active LIMIT 1`,
      [tenantId, input.outletId, userId],
    );
    if (!member.rows[0]) return null;
    const current = await database.client.query<{ total_leaves: string; used_leaves: string }>(
      `SELECT total_leaves::text, used_leaves::text FROM crm.leave_balances
       WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND year = $4 FOR UPDATE`,
      [tenantId, input.outletId, userId, input.year],
    );
    const previousTotal = Number(current.rows[0]?.total_leaves ?? 0);
    const usedLeaves = Number(current.rows[0]?.used_leaves ?? 0);
    if (input.totalLeaves < usedLeaves) {
      throw new AppError(409, "Total leave cannot be less than approved leave already used", "LEAVE_BALANCE_BELOW_USED");
    }
    const timestamp = Date.now();
    await database.client.query(
      `INSERT INTO crm.leave_balances
        (tenant_id, outlet_id, user_id, year, total_leaves, used_leaves, remaining_leaves, last_updated)
       VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $5::numeric - $6::numeric, $7)
       ON CONFLICT (tenant_id, outlet_id, user_id, year) DO UPDATE SET
         total_leaves = EXCLUDED.total_leaves,
         remaining_leaves = EXCLUDED.total_leaves - crm.leave_balances.used_leaves,
         last_updated = EXCLUDED.last_updated, updated_at = now()`,
      [tenantId, input.outletId, userId, input.year, input.totalLeaves, usedLeaves, timestamp],
    );
    await database.client.query(
      `INSERT INTO crm.leave_balance_entries
        (tenant_id, outlet_id, user_id, year, delta, entry_type, reason, actor_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, input.outletId, userId, input.year, input.totalLeaves - previousTotal,
        current.rows[0] ? "ADMIN_ADJUSTMENT" : "ALLOCATION", input.reason, actorId],
    );
    return (await this.listBalances(database, tenantId, { outletId: input.outletId, year: input.year, userId }))[0] ?? null;
  }

  async listBalanceHistory(
    database: TransactionDatabase, tenantId: string, outletId: string, userId: string, year: number, limit: number,
  ): Promise<LeaveBalanceHistoryItem[]> {
    const result = await database.client.query(
      `SELECT id, delta::text, entry_type, leave_request_id, reason, actor_user_id, created_at
       FROM crm.leave_balance_entries
       WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND year = $4
       ORDER BY created_at DESC, id DESC LIMIT $5`,
      [tenantId, outletId, userId, year, limit],
    );
    return result.rows.map((row) => ({
      id: String(row.id), delta: Number(row.delta),
      entryType: row.entry_type as LeaveBalanceHistoryItem["entryType"],
      ...(row.leave_request_id ? { leaveRequestId: String(row.leave_request_id) } : {}),
      reason: String(row.reason ?? ""), actorUserId: String(row.actor_user_id),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  async listHolidays(database: TransactionDatabase, tenantId: string, outletId: string, year: string): Promise<HolidayItem[]> {
    const result = await database.client.query(
      `SELECT id, name, title, holiday_date::text, year, holiday_type, is_paid, description,
              applicable_states, applicable_outlets, is_active
       FROM crm.holidays
       WHERE tenant_id = $1 AND outlet_id = $2 AND year = $3 AND is_active
       ORDER BY holiday_date, id`, [tenantId, outletId, year],
    );
    return result.rows.map((row) => this.mapHoliday(row));
  }

  private mapHoliday(row: QueryResultRow & Record<string, unknown>): HolidayItem {
    const date = String(row.holiday_date);
    const title = String(row.title ?? row.name ?? "");
    return {
      id: String(row.id), title, name: String(row.name ?? title), date, dateString: date,
      year: String(row.year), type: row.holiday_type as HolidayItem["type"],
      isPaid: row.is_paid !== false, description: String(row.description ?? ""),
      applicableStates: Array.isArray(row.applicable_states) ? row.applicable_states.map(String) : [],
      applicableOutlets: Array.isArray(row.applicable_outlets) ? row.applicable_outlets.map(String) : [],
      isActive: row.is_active !== false,
    };
  }

  async createHoliday(
    database: TransactionDatabase, tenantId: string, businessId: string, input: HolidayCreateInput,
  ): Promise<HolidayItem> {
    const result = await database.client.query(
      `INSERT INTO crm.holidays
        (tenant_id, business_id, outlet_id, name, title, holiday_date, date_string, year,
         is_active, is_paid, holiday_type, description, applicable_states, applicable_outlets)
       VALUES ($1,$2,$3,$4,$4,$5::date,$5::text,substring($5::text from 1 for 4),true,$6,$7,$8,$9,$10)
       RETURNING id, name, title, holiday_date::text, year, holiday_type, is_paid, description,
         applicable_states, applicable_outlets, is_active`,
      [tenantId, businessId, input.outletId, input.title, input.date, input.isPaid,
        input.type, input.description, input.applicableStates, input.applicableOutlets],
    );
    return this.mapHoliday(result.rows[0] as QueryResultRow & Record<string, unknown>);
  }

  async updateHoliday(
    database: TransactionDatabase, tenantId: string, holidayId: string, input: HolidayUpdateInput,
  ): Promise<HolidayItem | null> {
    const result = await database.client.query(
      `UPDATE crm.holidays SET
         name = coalesce($4, name), title = coalesce($4, title),
         holiday_date = coalesce($5::date, holiday_date),
         date_string = coalesce($5::text, date_string),
         year = coalesce(substring($5::text from 1 for 4), year),
         holiday_type = coalesce($6, holiday_type), is_paid = coalesce($7, is_paid),
         description = coalesce($8, description),
         applicable_states = coalesce($9::text[], applicable_states),
         applicable_outlets = coalesce($10::uuid[], applicable_outlets), updated_at = now()
       WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 AND is_active
       RETURNING id, name, title, holiday_date::text, year, holiday_type, is_paid, description,
         applicable_states, applicable_outlets, is_active`,
      [tenantId, input.outletId, holidayId, input.title ?? null, input.date ?? null,
        input.type ?? null, input.isPaid ?? null, input.description ?? null,
        input.applicableStates ?? null, input.applicableOutlets ?? null],
    );
    const row = result.rows[0];
    return row ? this.mapHoliday(row as QueryResultRow & Record<string, unknown>) : null;
  }

  async deleteHoliday(database: TransactionDatabase, tenantId: string, outletId: string, holidayId: string) {
    const result = await database.client.query(
      `UPDATE crm.holidays SET is_active = false, updated_at = now()
       WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 AND is_active`,
      [tenantId, outletId, holidayId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getRequestContext(
    database: TransactionDatabase, tenantId: string, outletId: string, userId: string, leaveTypeId: string,
  ) {
    const result = await database.client.query<{
      business_id: string; leave_type: string; manager_id: string | null; manager_name: string | null;
    }>(
      `SELECT team.business_id, leave_type.name AS leave_type,
              manager.user_id AS manager_id, manager_user.display_name AS manager_name
       FROM crm.team_memberships team
       JOIN crm.leave_types leave_type
         ON leave_type.tenant_id=team.tenant_id AND leave_type.outlet_id=team.outlet_id
        AND leave_type.id=$4 AND leave_type.active
       LEFT JOIN crm.user_profiles manager
         ON manager.id=team.manager_profile_id AND manager.tenant_id=team.tenant_id
       LEFT JOIN iam.users manager_user ON manager_user.id=manager.user_id
       WHERE team.tenant_id=$1 AND team.outlet_id=$2 AND team.user_id=$3 AND team.active
       ORDER BY team.updated_at DESC LIMIT 1`,
      [tenantId, outletId, userId, leaveTypeId],
    );
    const row = result.rows[0];
    return row ? {
      businessId: row.business_id, leaveType: row.leave_type,
      managerId: row.manager_id ?? "", managerName: row.manager_name ?? "",
    } : null;
  }

  async createRequest(
    database: TransactionDatabase, tenantId: string, userId: string, input: LeaveRequestCreateInput,
    details: { businessId: string; leaveType: string; managerId: string; managerName: string; noDays: number; dayId: string; monthId: string; year: number },
  ): Promise<LeaveDocument> {
    const balance = await database.client.query<{ remaining_leaves: string }>(
      `SELECT remaining_leaves::text FROM crm.leave_balances
       WHERE tenant_id=$1 AND outlet_id=$2 AND user_id=$3 AND year=$4 AND active FOR UPDATE`,
      [tenantId, input.outletId, userId, details.year],
    );
    const remaining = Number(balance.rows[0]?.remaining_leaves ?? 0);
    const pending = await database.client.query<{ days: string }>(
      `SELECT coalesce(sum(no_days),0)::text AS days FROM crm.leave_requests
       WHERE tenant_id=$1 AND outlet_id=$2 AND user_id=$3 AND status='REQUESTED'
         AND from_date >= $4 AND from_date <= $5`,
      [tenantId, input.outletId, userId,
        Date.parse(`${details.year}-01-01T00:00:00.000+05:30`),
        Date.parse(`${details.year + 1}-01-01T00:00:00.000+05:30`) - 1],
    );
    if (remaining - Number(pending.rows[0]?.days ?? 0) < details.noDays) {
      throw new AppError(409, "Insufficient leave balance", "INSUFFICIENT_LEAVE_BALANCE");
    }
    const overlap = await database.client.query(
      `SELECT 1 FROM crm.leave_requests
       WHERE tenant_id=$1 AND outlet_id=$2 AND user_id=$3 AND status <> 'REJECTED'
         AND from_date <= $5 AND to_date >= $4 LIMIT 1`,
      [tenantId, input.outletId, userId, input.fromDate, input.toDate],
    );
    if (overlap.rows[0]) throw new AppError(409, "Leave request overlaps an existing request", "LEAVE_REQUEST_OVERLAP");
    const timestamp = Date.now();
    const result = await database.client.query(
      `INSERT INTO crm.leave_requests
        (tenant_id,business_id,outlet_id,user_id,leave_type_id,leave_type,from_date,to_date,
         duration,leave_note,no_days,status,manager_user_id,manager_name,day_id,month_id,created_date,updated_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'REQUESTED',$12,$13,$14,$15,$16,$16)
       RETURNING *`,
      [tenantId, details.businessId, input.outletId, userId, input.leaveTypeId, details.leaveType,
        input.fromDate, input.toDate, input.duration, input.leaveNote, details.noDays,
        details.managerId || null, details.managerName, details.dayId, details.monthId, timestamp],
    );
    return mapLeaveRow(result.rows[0] as QueryResultRow & Record<string, unknown>);
  }

  async transitionStatus(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    leaveId: string,
    input: Omit<LeaveStatusInput, "outletId">,
    actorId: string,
    timestamp: number,
  ): Promise<LeaveDocument | null> {
    const leaveResult = await database.client.query(
      "SELECT * FROM crm.leave_requests WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 FOR UPDATE",
      [tenantId, outletId, leaveId],
    );
    const current = leaveResult.rows[0] as QueryResultRow & Record<string, unknown> | undefined;
    if (!current) return null;

    const currentStatus = String(current.status);
    const noDays = Number(current.no_days);
    const userId = String(current.user_id);
    const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date(Number(current.from_date))));

    await database.client.query(
      `UPDATE crm.leave_requests
       SET status = $4, action_taken_by = $5, remark = $6, updated_date = $7, updated_at = now()
       WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3`,
      [tenantId, outletId, leaveId, input.status, actorId, input.remark, timestamp],
    );

    const needsBalance = userId && noDays > 0 &&
      ((input.status === "APPROVED" && currentStatus !== "APPROVED") ||
        (input.status === "REJECTED" && currentStatus === "APPROVED"));

    if (needsBalance) {
      const balanceResult = await database.client.query(
        "SELECT * FROM crm.leave_balances WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND year = $4 FOR UPDATE",
        [tenantId, outletId, userId, year],
      );
      const balance = balanceResult.rows[0] as QueryResultRow & Record<string, unknown> | undefined;
      const adjustment = calculateLeaveBalanceAdjustment({
        currentStatus,
        nextStatus: input.status,
        noDays,
        totalLeaves: Number(balance?.total_leaves ?? 0),
        usedLeaves: Number(balance?.used_leaves ?? 0),
      });
      if (adjustment) {
        if (input.status === "APPROVED" && adjustment.remainingLeaves < 0) {
          throw new AppError(409, "Insufficient leave balance", "INSUFFICIENT_LEAVE_BALANCE");
        }
        if (balance) {
          await database.client.query(
            `UPDATE crm.leave_balances SET used_leaves = $5, remaining_leaves = $6, last_updated = $7, updated_at = now()
             WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND year = $4`,
            [tenantId, outletId, userId, year, adjustment.usedLeaves, adjustment.remainingLeaves, timestamp],
          );
        } else {
          await database.client.query(
            `INSERT INTO crm.leave_balances (tenant_id, outlet_id, user_id, year, total_leaves, used_leaves, remaining_leaves, last_updated)
             VALUES ($1, $2, $3, $4, 0, $5, $6, $7)`,
            [tenantId, outletId, userId, year, adjustment.usedLeaves, adjustment.remainingLeaves, timestamp],
          );
        }
        await database.client.query(
          `INSERT INTO crm.leave_balance_entries
            (tenant_id,outlet_id,user_id,year,delta,entry_type,leave_request_id,reason,actor_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (tenant_id,leave_request_id,entry_type) WHERE leave_request_id IS NOT NULL DO NOTHING`,
          [tenantId, outletId, userId, year, input.status === "APPROVED" ? -noDays : noDays,
            input.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REVERSED",
            leaveId, input.remark, actorId],
        );
      }
    }

    const updated = await database.client.query(
      "SELECT * FROM crm.leave_requests WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3",
      [tenantId, outletId, leaveId],
    );
    const row = updated.rows[0];
    return row ? mapLeaveRow(row as QueryResultRow & Record<string, unknown>) : null;
  }
}

export const postgresLeaveRepository = new PostgresLeaveRepository();
