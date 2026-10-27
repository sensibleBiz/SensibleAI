import type { PoolClient } from "pg";
import { createDatabase, ensureApplicationRole, getApplicationPool, type Database } from "./client.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Transactions that hold a DB connection longer than this threshold are logged at WARN
// so operators can identify slow routes without needing Cloud SQL Insights access.
// Override with SLOW_TX_THRESHOLD_MS env var (default 2000ms). Read per-call so
// the value can be adjusted in tests or via dynamic config without a restart.
const getSlowTxThresholdMs = (): number => {
  const raw = process.env["SLOW_TX_THRESHOLD_MS"];
  if (!raw) return 2000;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
};

export interface DatabaseContext {
  tenantId: string;
  userId: string;
  isSuperAdmin?: boolean;
  /** Set to true only when the request comes from the configured platform administrator
   *  tenant. Wired to app.is_platform_admin session variable for rate_cards RLS. */
  isPlatformAdmin?: boolean;
}

export interface TransactionDatabase {
  client: PoolClient;
  db: Database;
}

const assertUuid = (name: string, value: string) => {
  if (!UUID_PATTERN.test(value)) throw new TypeError(`${name} must be a valid UUID`);
};

export const runWithClientDatabaseContext = async <T>(
  client: PoolClient,
  context: DatabaseContext,
  operation: (database: TransactionDatabase) => Promise<T>,
): Promise<T> => {
  assertUuid("tenantId", context.tenantId);
  assertUuid("userId", context.userId);
  const t0 = Date.now();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [context.tenantId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [context.userId]);
    await client.query("SELECT set_config('app.is_super_admin', $1, true)", [String(context.isSuperAdmin === true)]);
    await client.query("SELECT set_config('app.is_platform_admin', $1, true)", [String(context.isPlatformAdmin === true)]);
    const result = await operation({ client, db: createDatabase(client) });
    await client.query("COMMIT");
    const durationMs = Date.now() - t0;
    const thresholdMs = getSlowTxThresholdMs();
    if (durationMs >= thresholdMs) {
      console.warn(JSON.stringify({
        severity: "WARN",
        event: "SLOW_DB_TRANSACTION",
        durationMs,
        thresholdMs,
        tenantId: context.tenantId,
      }));
    }
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

export const withDatabaseContext = async <T>(
  context: DatabaseContext,
  operation: (database: TransactionDatabase) => Promise<T>,
): Promise<T> => {
  await ensureApplicationRole();
  const client = await getApplicationPool().connect();
  try {
    return await runWithClientDatabaseContext(client, context, operation);
  } finally {
    client.release();
  }
};
