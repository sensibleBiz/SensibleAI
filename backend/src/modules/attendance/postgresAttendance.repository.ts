import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import type { AttendanceHoliday, AttendanceRecordDocument, LeaveApplicationRecord } from "../../types/attendance.types.js";

interface DailyRow extends QueryResultRow {
  id: string;
  user_id: string;
  day_id: string;
  check_in_time: string | null;
  check_out_time: string | null;
  is_present: boolean;
  emp_code: string;
  user_name: string;
  details: Record<string, unknown>;
}

const mapDailyDocument = (row: DailyRow): AttendanceRecordDocument => ({
  id: row.id,
  data: {
    ...row.details,
    userId: row.user_id,
    dayId: row.day_id,
    checkInTime: row.check_in_time ? Number(row.check_in_time) : undefined,
    checkOutTime: row.check_out_time ? Number(row.check_out_time) : undefined,
    isPresent: row.is_present,
    empCode: row.emp_code,
    userName: row.user_name,
  },
});

export class PostgresAttendanceRepository {
  async resolveOutletBusiness(database: TransactionDatabase, tenantId: string, outletId: string) {
    const result = await database.client.query<{ business_id: string }>(
      "SELECT business_id FROM tenancy.outlets WHERE tenant_id = $1 AND id = $2 AND active",
      [tenantId, outletId],
    );
    return result.rows[0]?.business_id ?? null;
  }

  async listForDay(database: TransactionDatabase, tenantId: string, outletId: string, dayId: string) {
    const result = await database.client.query<DailyRow>(
      `SELECT id, user_id, day_id, check_in_time::text, check_out_time::text, is_present, emp_code, user_name, details
       FROM crm.attendance_daily WHERE tenant_id = $1 AND outlet_id = $2 AND day_id = $3`,
      [tenantId, outletId, dayId],
    );
    return result.rows.map(mapDailyDocument);
  }

  async listForDayIds(database: TransactionDatabase, tenantId: string, outletId: string, dayIds: string[]) {
    if (dayIds.length === 0) return [];
    const result = await database.client.query<DailyRow>(
      `SELECT id, user_id, day_id, check_in_time::text, check_out_time::text, is_present, emp_code, user_name, details
       FROM crm.attendance_daily WHERE tenant_id = $1 AND outlet_id = $2 AND day_id = ANY($3::text[])`,
      [tenantId, outletId, dayIds],
    );
    return result.rows.map(mapDailyDocument);
  }

  async listApprovedLeavesForRange(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    start: number,
    end: number,
  ): Promise<LeaveApplicationRecord[]> {
    const result = await database.client.query<QueryResultRow & {
      id: string; user_id: string; leave_type: string; from_date: string; to_date: string; duration: string;
    }>(
      `SELECT id, user_id, leave_type, from_date::text, to_date::text, duration
       FROM crm.leave_requests
       WHERE tenant_id = $1 AND outlet_id = $2 AND status = 'APPROVED'
         AND from_date <= $4 AND to_date >= $3`,
      [tenantId, outletId, start, end],
    );
    return result.rows.map((row) => ({
      id: row.id,
      userProfileId: row.user_id,
      leaveType: row.leave_type,
      fromDate: Number(row.from_date),
      toDate: Number(row.to_date),
      duration: row.duration,
    }));
  }

  async listHolidaysForYear(database: TransactionDatabase, tenantId: string, outletId: string, year: string): Promise<AttendanceHoliday[]> {
    const result = await database.client.query<QueryResultRow & {
      id: string; name: string; title: string | null; holiday_date: Date; date_string: string | null;
      year: string; is_active: boolean; is_paid: boolean | null;
    }>(
      `SELECT id, name, title, holiday_date, date_string, year, is_active, is_paid
       FROM crm.holidays WHERE tenant_id = $1 AND outlet_id = $2 AND year = $3 AND is_active`,
      [tenantId, outletId, year],
    );
    return result.rows.map((row) => ({
      id: row.id,
      date: row.holiday_date.getTime(),
      ...(row.date_string ? { dateString: row.date_string } : {}),
      isActive: row.is_active,
      ...(row.is_paid === null ? {} : { isPaid: row.is_paid }),
      name: row.name,
      ...(row.title ? { title: row.title } : {}),
      year: row.year,
    }));
  }

  async deleteDaily(database: TransactionDatabase, tenantId: string, outletId: string, attendanceId: string) {
    const result = await database.client.query(
      "DELETE FROM crm.attendance_daily WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3",
      [tenantId, outletId, attendanceId],
    );
    if ((result.rowCount ?? 0) === 0) throw new AppError(404, "Attendance record not found", "ATTENDANCE_NOT_FOUND");
  }

  async insertEvent(database: TransactionDatabase, values: Record<string, unknown>) {
    const keys = Object.keys(values);
    const columnName = (key: string) => key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
    const result = await database.client.query(
      `INSERT INTO crm.attendance_events (${keys.map(columnName).join(", ")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(", ")})
       ON CONFLICT (tenant_id, device_id, external_event_id) WHERE external_event_id IS NOT NULL DO NOTHING`,
      keys.map((key) => values[key]),
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getDailyForUserDay(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    userId: string,
    dayId: string,
  ) {
    const result = await database.client.query<{ id: string; check_in_time: string | null; check_out_time: string | null }>(
      `SELECT id, check_in_time::text, check_out_time::text
       FROM crm.attendance_daily
       WHERE tenant_id = $1 AND outlet_id = $2 AND user_id = $3 AND day_id = $4
       LIMIT 1`,
      [tenantId, outletId, userId, dayId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      checkInTime: row.check_in_time ? Number(row.check_in_time) : null,
      checkOutTime: row.check_out_time ? Number(row.check_out_time) : null,
    };
  }

  async findActiveUsersByEmpCode(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    empCode: string,
  ) {
    const uniqueCodes = new Set([empCode]);
    if (/^\d+$/.test(empCode)) uniqueCodes.add(String(Number(empCode)));
    const result = await database.client.query<{
      user_id: string;
      emp_code: string;
      user_name: string;
    }>(
      `SELECT DISTINCT ON (team.user_id) team.user_id, team.emp_code, usr.display_name AS user_name
       FROM crm.team_memberships team
       JOIN iam.users usr ON usr.id = team.user_id
       WHERE team.tenant_id = $1 AND team.outlet_id = $2 AND team.active AND team.is_on_payroll
         AND team.emp_code = ANY($3::text[])
       ORDER BY team.user_id, team.updated_at DESC`,
      [tenantId, outletId, [...uniqueCodes]],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      empCode: row.emp_code,
      userName: row.user_name ?? "",
    }));
  }

  async upsertDailyFromPunch(database: TransactionDatabase, values: Record<string, unknown>) {
    await database.client.query(
      `INSERT INTO crm.attendance_daily (
        id, tenant_id, business_id, outlet_id, user_id, day_id, month_id, year_id,
        check_in_time, check_out_time, is_present, emp_code, user_name, details
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12, $13::jsonb
      )
      ON CONFLICT (tenant_id, outlet_id, user_id, day_id) DO UPDATE SET
        check_in_time = CASE WHEN $14 = 'IN' THEN LEAST(coalesce(crm.attendance_daily.check_in_time, $9), $9) ELSE crm.attendance_daily.check_in_time END,
        check_out_time = CASE WHEN $14 = 'OUT' THEN GREATEST(coalesce(crm.attendance_daily.check_out_time, $10), $10) ELSE crm.attendance_daily.check_out_time END,
        details = crm.attendance_daily.details || $13::jsonb,
        updated_at = now()`,
      [
        values.id, values.tenantId, values.businessId, values.outletId, values.userId,
        values.dayId, values.monthId, values.yearId, values.checkInTime, values.checkOutTime,
        values.empCode, values.userName, JSON.stringify(values.details ?? {}), values.eventType,
      ],
    );
  }
}

export const postgresAttendanceRepository = new PostgresAttendanceRepository();
