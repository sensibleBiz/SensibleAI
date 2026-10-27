import type { QueryResultRow } from "pg";
import { ensureApplicationRole, getApplicationPool } from "../../db/client.js";

interface QrSessionRow extends QueryResultRow {
  id: string;
  legacy_profile_id: string | null;
  status: "PENDING" | "CLAIMED" | "EXPIRED";
  created_at: Date;
  expires_at: Date;
}

const mapSession = (row: QrSessionRow) => ({
  id: row.id,
  isLoggedIn: row.status === "CLAIMED",
  userId: row.legacy_profile_id,
  status: row.status,
  createdAt: row.created_at.getTime(),
  expiryAt: row.expires_at.getTime(),
});

export class QrSessionRepository {
  async create(ttlSeconds: number) {
    await ensureApplicationRole();
    const result = await getApplicationPool().query<QrSessionRow>(
      `SELECT id, NULL::varchar AS legacy_profile_id, 'PENDING'::text AS status,
        created_at, expires_at FROM iam.create_qr_session($1)`,
      [ttlSeconds],
    );
    const row = result.rows[0];
    if (!row) throw new Error("PostgreSQL did not create a QR session");
    return mapSession(row);
  }

  async find(sessionId: string) {
    await ensureApplicationRole();
    const result = await getApplicationPool().query<QrSessionRow>(
      "SELECT * FROM iam.get_qr_session($1)",
      [sessionId],
    );
    const row = result.rows[0];
    return row ? mapSession(row) : null;
  }

  async claim(sessionId: string, profileId: string) {
    await ensureApplicationRole();
    const result = await getApplicationPool().query<{ claimed: boolean }>(
      "SELECT iam.claim_qr_session($1, $2) AS claimed",
      [sessionId, profileId],
    );
    return result.rows[0]?.claimed === true;
  }

  async consume(sessionId: string) {
    await ensureApplicationRole();
    const result = await getApplicationPool().query<{ user_id: string | null }>(
      "SELECT iam.consume_qr_session($1) AS user_id",
      [sessionId],
    );
    return result.rows[0]?.user_id ?? null;
  }
}

export const qrSessionRepository = new QrSessionRepository();
