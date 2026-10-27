import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { CALL_REPORT_MAX_DOCS } from "../../utils/callQuery.js";
import { AppError } from "../../errors/appError.js";
import type { PostgresCallDirection, PostgresCallRecord } from "./call.types.js";

interface CallRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  business_id: string;
  outlet_id: string;
  lead_id: string | null;
  customer_id: string | null;
  logged_by_user_id: string | null;
  direction: PostgresCallDirection;
  duration_seconds: number;
  number: string;
  receiver_mobile_no: string;
  receiver_name: string;
  employee_label: string;
  department: string;
  logged_at: Date;
  phone_account_id: string | null;
  sim_label: string | null;
  sim_phone_number: string | null;
  subscription_id: string | null;
  device_id: string | null;
  external_call_source: string | null;
  external_call_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

const mapRow = (row: CallRow): PostgresCallRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  businessId: row.business_id,
  outletId: row.outlet_id,
  leadId: row.lead_id,
  customerId: row.customer_id,
  loggedByUserId: row.logged_by_user_id,
  direction: row.direction,
  durationSeconds: row.duration_seconds,
  number: row.number,
  receiverMobileNo: row.receiver_mobile_no,
  receiverName: row.receiver_name,
  employeeLabel: row.employee_label,
  department: row.department,
  loggedAt: new Date(row.logged_at),
  phoneAccountId: row.phone_account_id,
  simLabel: row.sim_label,
  simPhoneNumber: row.sim_phone_number,
  subscriptionId: row.subscription_id,
  deviceId: row.device_id,
  externalCallSource: row.external_call_source,
  externalCallId: row.external_call_id,
  createdByUserId: row.created_by_user_id,
  updatedByUserId: row.updated_by_user_id,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const SELECT_FIELDS = `id, tenant_id, business_id, outlet_id, lead_id, customer_id, logged_by_user_id,
  direction, duration_seconds, number, receiver_mobile_no, receiver_name, employee_label, department,
  logged_at, phone_account_id, sim_label, sim_phone_number, subscription_id, device_id,
  external_call_source, external_call_id, created_by_user_id, updated_by_user_id, created_at, updated_at`;

const columnName = (key: string) => key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);

const decodeCursor = (cursor?: string): { loggedAt: Date; id: string } | null => {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      timestamp?: unknown;
      id?: unknown;
    };
    if (
      typeof value.timestamp !== "number" ||
      !Number.isSafeInteger(value.timestamp) ||
      typeof value.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
    ) {
      return null;
    }
    return { loggedAt: new Date(value.timestamp), id: value.id };
  } catch {
    return null;
  }
};

export class PostgresCallRepository {
  async resolveOutletBusiness(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<string | null> {
    const result = await database.client.query<{ business_id: string }>(
      `SELECT business_id FROM tenancy.outlets WHERE tenant_id = $1 AND id = $2 AND active`,
      [tenantId, outletId],
    );
    return result.rows[0]?.business_id ?? null;
  }

  async create(database: TransactionDatabase, values: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(values);
    await database.client.query(
      `INSERT INTO crm.calls (${keys.map(columnName).join(", ")}) VALUES (${keys.map((_, index) => `$${index + 1}`).join(", ")})`,
      keys.map((key) => values[key]),
    );
  }

  async getById(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    callId: string,
  ): Promise<PostgresCallRecord | null> {
    const result = await database.client.query<CallRow>(
      `SELECT ${SELECT_FIELDS} FROM crm.calls WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3`,
      [tenantId, outletId, callId],
    );
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async listByNumbers(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    numbers: string[],
    leadId: string | null,
    limit: number,
    cursor?: string,
  ): Promise<PostgresCallRecord[]> {
    const decoded = decodeCursor(cursor);
    if (cursor && !decoded) throw new Error("INVALID_CURSOR");
    const params: unknown[] = [tenantId, outletId, numbers, leadId];
    let cursorClause = "";
    if (decoded) {
      params.push(decoded.loggedAt, decoded.id);
      cursorClause = `AND (logged_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit);
    const result = await database.client.query<CallRow>(
      `SELECT ${SELECT_FIELDS} FROM crm.calls
       WHERE tenant_id = $1 AND outlet_id = $2
         AND (number = ANY($3::text[]) OR ($4::uuid IS NOT NULL AND lead_id = $4))
         ${cursorClause}
       ORDER BY logged_at DESC, id DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(mapRow);
  }

  async listByEmployee(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    receiverName: string,
    startDate: number,
    endDate: number,
    direction: PostgresCallDirection | undefined,
    limit: number,
    cursor?: string,
  ): Promise<PostgresCallRecord[]> {
    const decoded = decodeCursor(cursor);
    if (cursor && !decoded) throw new Error("INVALID_CURSOR");
    const params: unknown[] = [
      tenantId,
      outletId,
      receiverName,
      new Date(startDate),
      new Date(endDate),
    ];
    let directionClause = "";
    if (direction) {
      params.push(direction);
      directionClause = `AND direction = $${params.length}::crm.call_direction`;
    }
    let cursorClause = "";
    if (decoded) {
      params.push(decoded.loggedAt, decoded.id);
      cursorClause = `AND (logged_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
    }
    params.push(limit);
    const result = await database.client.query<CallRow>(
      `SELECT ${SELECT_FIELDS} FROM crm.calls
       WHERE tenant_id = $1 AND outlet_id = $2
         AND receiver_name = $3
         AND logged_at >= $4 AND logged_at <= $5
         ${directionClause}
         ${cursorClause}
       ORDER BY logged_at DESC, id DESC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows.map(mapRow);
  }

  async streamForReport(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    startDate: number,
    endDate: number,
  ): Promise<PostgresCallRecord[]> {
    const count = await database.client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM crm.calls
       WHERE tenant_id = $1 AND outlet_id = $2 AND logged_at >= $3 AND logged_at <= $4`,
      [tenantId, outletId, new Date(startDate), new Date(endDate)],
    );
    const total = Number(count.rows[0]?.count ?? 0);
    if (total > CALL_REPORT_MAX_DOCS) {
      throw new AppError(
        400,
        "Call report exceeds the maximum supported size for a single day",
        "CALL_REPORT_TOO_LARGE",
      );
    }
    const result = await database.client.query<CallRow>(
      `SELECT ${SELECT_FIELDS} FROM crm.calls
       WHERE tenant_id = $1 AND outlet_id = $2 AND logged_at >= $3 AND logged_at <= $4
       ORDER BY logged_at ASC, id ASC`,
      [tenantId, outletId, new Date(startDate), new Date(endDate)],
    );
    return result.rows.map(mapRow);
  }
}

export const postgresCallRepository = new PostgresCallRepository();
