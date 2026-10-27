import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { UserTrackingCursor } from "../../types/userTracking.types.js";
import type { PostgresUserTrackingCreateInput, PostgresUserTrackingRecord } from "./userTracking.types.js";

interface TrackingRow extends QueryResultRow {
  id: string;
  user_id: string;
  latitude: string;
  longitude: string;
  address: string;
  user_name: string;
  recorded_at: Date;
}

const mapRow = (row: TrackingRow): PostgresUserTrackingRecord => ({
  id: row.id,
  userId: row.user_id,
  latitude: Number(row.latitude),
  longitude: Number(row.longitude),
  address: row.address,
  name: row.user_name,
  recordedAt: row.recorded_at,
});

export class PostgresUserTrackingRepository {
  async listHistory(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    userId: string,
    startDate: number,
    endDateExclusive: number,
    cursor: UserTrackingCursor | undefined,
    limit: number,
  ) {
    const values: unknown[] = [tenantId, outletId, userId, new Date(startDate), new Date(endDateExclusive)];
    let cursorClause = "";
    if (cursor) {
      values.push(new Date(cursor.timestamp), cursor.id);
      cursorClause = "AND (tracking.recorded_at, tracking.id) < ($6::timestamptz, $7::uuid)";
    }
    values.push(limit + 1);
    const result = await database.client.query<TrackingRow>(`
      SELECT tracking.id, tracking.user_id, tracking.latitude::text, tracking.longitude::text,
        tracking.address, coalesce(nullif(tracking.user_name, ''), usr.display_name) AS user_name,
        tracking.recorded_at
      FROM crm.user_tracking_history tracking
      JOIN iam.users usr ON usr.id = tracking.user_id
      WHERE tracking.tenant_id = $1 AND tracking.outlet_id = $2 AND tracking.user_id = $3
        AND tracking.recorded_at >= $4 AND tracking.recorded_at < $5
        ${cursorClause}
      ORDER BY tracking.recorded_at DESC, tracking.id DESC
      LIMIT $${values.length}
    `, values);
    return result.rows.map(mapRow);
  }

  async userHasOutletAccess(database: TransactionDatabase, tenantId: string, outletId: string, userId: string) {
    const result = await database.client.query<{ allowed: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM tenancy.outlet_assignments assignment
        JOIN tenancy.tenant_memberships membership
          ON membership.tenant_id = assignment.tenant_id AND membership.user_id = assignment.user_id
        WHERE assignment.tenant_id = $1 AND assignment.outlet_id = $2 AND assignment.user_id = $3
          AND assignment.active AND membership.active
      ) AS allowed
    `, [tenantId, outletId, userId]);
    return result.rows[0]?.allowed === true;
  }

  async create(
    database: TransactionDatabase,
    tenantId: string,
    actorUserId: string,
    input: PostgresUserTrackingCreateInput & { userId: string },
  ) {
    const result = await database.client.query<TrackingRow>(`
      WITH inserted AS (
        INSERT INTO crm.user_tracking_history
        (tenant_id, outlet_id, user_id, latitude, longitude, address, user_name, recorded_at,
         accuracy_meters, device_id, external_source, external_id, created_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (tenant_id, outlet_id, external_source, external_id) WHERE external_id IS NOT NULL
        DO NOTHING
        RETURNING id, user_id, latitude, longitude, address, user_name, recorded_at
      )
      SELECT id, user_id, latitude::text, longitude::text, address, user_name, recorded_at FROM inserted
      UNION ALL
      SELECT id, user_id, latitude::text, longitude::text, address, user_name, recorded_at
      FROM crm.user_tracking_history
      WHERE tenant_id=$1 AND outlet_id=$2 AND external_source=$11 AND external_id=$12
        AND $12::varchar IS NOT NULL AND NOT EXISTS (SELECT 1 FROM inserted)
      LIMIT 1
    `, [tenantId, input.outletId, input.userId, input.latitude, input.longitude,
      input.address ?? "", input.name ?? "", new Date(input.timestamp), input.accuracyMeters ?? null,
      input.deviceId ?? null, input.externalSource ?? "mobile", input.externalId ?? null, actorUserId]);
    return mapRow(result.rows[0]!);
  }
}

export const postgresUserTrackingRepository = new PostgresUserTrackingRepository();
