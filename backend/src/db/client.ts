import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

let applicationPool: Pool | undefined;
let roleValidation: Promise<void> | undefined;

// Per-instance pool size. Set DB_POOL_MAX in the Cloud Run service environment.
// Budget: DB_POOL_MAX × max-instances ≤ Cloud SQL max_connections − 5 (admin reserve).
// Default 5 is safe for up to 10 Cloud Run instances on a db-n1-standard-1 (400 max).
const resolvePoolMax = (): number => {
  const raw = process.env["DB_POOL_MAX"];
  if (!raw) return 5;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 5;
};

const normalizeConnectionString = (connectionString: string): string => {
  const match = connectionString.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@/]+(?::\d+)?(?:\/.*)?)$/i);
  if (match) {
    const [, proto, user, rawPassword, rest] = match;
    const encodedPassword = encodeURIComponent(decodeURIComponent(rawPassword ?? ""));
    return `${proto}${user}:${encodedPassword}@${rest}`;
  }
  return connectionString;
};

const createPool = (connectionString: string) => {
  const normalized = normalizeConnectionString(connectionString);
  const isRemote = !normalized.includes("localhost") && !normalized.includes("127.0.0.1");
  const options: PoolConfig = {
    connectionString: normalized,
    max: resolvePoolMax(),
    min: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
    application_name: "sensible-crm-api",
    options: "-c timezone=UTC",
    ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
  };

  const pool = new Pool(options);

  // Tenant and privilege GUCs are set transaction-locally by
  // withDatabaseContext, so PostgreSQL clears them on COMMIT/ROLLBACK before a
  // client returns to the pool. Do not issue an async query from the pool's
  // synchronous `connect` event: it can race the first borrower query.

  pool.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if ((error as NodeJS.ErrnoException).code === "57P01") {
      console.warn("PostgreSQL connection terminated by server; resetting cached pool state:", message);
    } else {
      console.error("PostgreSQL pool error, resetting cached pool state:", message);
    }
    if (applicationPool === pool) {
      applicationPool = undefined;
      roleValidation = undefined;
    }
  });

  return pool;
};

export const getApplicationPool = () => {
  if (applicationPool) return applicationPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL operations");
  applicationPool = createPool(connectionString);
  return applicationPool;
};

export const createDatabase = (client: PoolClient): Database => drizzle(client, { schema });

export const ensureApplicationRole = async () => {
  if (roleValidation) return roleValidation;
  roleValidation = (async () => {
    const result = await getApplicationPool().query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolinherit: boolean;
      has_application_role: boolean;
    }>(`
      SELECT role.rolsuper, role.rolbypassrls, role.rolinherit,
        pg_has_role(current_user, 'sensible_app_role', 'member') AS has_application_role
      FROM pg_roles role WHERE role.rolname = current_user
    `);
    const role = result.rows[0];
    if (!role || role.rolsuper || role.rolbypassrls || !role.rolinherit || !role.has_application_role) {
      throw new Error("DATABASE_URL must use a non-superuser, non-BYPASSRLS member of sensible_app_role");
    }
  })().catch((error) => {
    roleValidation = undefined;
    throw error;
  });
  return roleValidation;
};

export const closeApplicationPool = async () => {
  const pool = applicationPool;
  applicationPool = undefined;
  roleValidation = undefined;
  if (pool) await pool.end();
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin pool — uses DATABASE_ADMIN_URL (superuser / BYPASSRLS).
// Strictly limited use: webhook handlers that must resolve a tenant from a
// provider reference before entering withDatabaseContext. Never use for
// application-level queries that can run through the normal application pool.
// ─────────────────────────────────────────────────────────────────────────────

let adminPool: Pool | undefined;

export const getAdminPool = (): Pool => {
  if (adminPool) return adminPool;
  const connectionString = process.env.DATABASE_ADMIN_URL;
  if (!connectionString) throw new Error("DATABASE_ADMIN_URL is required for admin operations");
  adminPool = createPool(connectionString);
  return adminPool;
};

export const closeAdminPool = async () => {
  const pool = adminPool;
  adminPool = undefined;
  if (pool) await pool.end();
};
