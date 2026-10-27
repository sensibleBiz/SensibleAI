import { Router } from "express";
import { getApplicationPool } from "../db/client.js";

export const healthRouter = Router();

/**
 * Liveness probe — just confirms the process is alive.
 * Cloud Run uses this for basic health-checks.
 */
healthRouter.get("/live", (_request, response) => {
  response.json({ success: true, status: "live" });
});

/**
 * Readiness probe — confirms the process AND Postgres are ready.
 * Cloud Run can use this before routing traffic to a new instance.
 * Returns 503 if the database is unreachable.
 */
healthRouter.get("/ready", async (_request, response) => {
  try {
    const pool = getApplicationPool();
    const client = await pool.connect();
    let dbVersion = "unknown";
    let dbStartedAt: string | null = null;
    let migrationCount: number | null = null;
    try {
      const meta = await client.query<{ pg_version: string; db_started_at: string }>(
        "SELECT split_part(version(), ' ', 2) AS pg_version, pg_postmaster_start_time()::text AS db_started_at",
      );
      dbVersion = meta.rows[0]?.pg_version ?? "unknown";
      dbStartedAt = meta.rows[0]?.db_started_at ?? null;
      // Best-effort: app role may not have SELECT on drizzle.__drizzle_migrations
      try {
        const mig = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
        );
        migrationCount = mig.rows[0]?.count ?? null;
      } catch {
        // silently omit — operator must grant SELECT on drizzle.__drizzle_migrations to app role
      }
    } finally {
      client.release();
    }
    response.json({
      success: true,
      status: "ready",
      checks: { database: "ok" },
      db: { version: dbVersion, startedAt: dbStartedAt, migrationCount },
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    response.status(503).json({
      success: false,
      status: "not_ready",
      checks: { database: "unavailable" },
      // Only include the raw message in non-production to avoid leaking connection strings
      ...(process.env["NODE_ENV"] !== "production" ? { detail: message } : {}),
    });
  }
});

/**
 * Default health check — kept for backward compatibility with existing Cloud Run
 * configuration that calls /api/v1/health without a suffix.
 */
healthRouter.get("/", (_request, response) => {
  response.json({ success: true, message: "API is running" });
});
