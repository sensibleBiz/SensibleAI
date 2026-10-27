import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { env } from "../src/config/env.js";

const connectionString = env.database.adminUrl ?? env.database.url;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

const pool = new Pool({ connectionString, max: 1, application_name: "sensible-crm-migration-state-check" });

try {
  const journal = JSON.parse(
    await readFile(new URL("../migrations/meta/_journal.json", import.meta.url), "utf8"),
  ) as { entries: unknown[] };
  const state = await pool.query<{
    database_name: string;
    migration_table: string | null;
    migration_count: string;
    crm_table_count: string;
    iam_table_count: string;
    tenancy_table_count: string;
    reference_table_count: string;
  }>(`
    SELECT
      current_database() AS database_name,
      to_regclass('drizzle.__drizzle_migrations')::text AS migration_table,
      CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN '0'
        ELSE (SELECT count(*)::text FROM drizzle.__drizzle_migrations) END AS migration_count,
      (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'crm' AND table_type = 'BASE TABLE') AS crm_table_count,
      (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'iam' AND table_type = 'BASE TABLE') AS iam_table_count,
      (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'tenancy' AND table_type = 'BASE TABLE') AS tenancy_table_count,
      (SELECT count(*)::text FROM information_schema.tables WHERE table_schema = 'reference_data' AND table_type = 'BASE TABLE') AS reference_table_count
  `);
  const report = state.rows.map((row) => ({
    ...row,
    expected_migration_count: String(journal.entries.length),
    pending_migration_count: String(Math.max(journal.entries.length - Number(row.migration_count), 0)),
  }));
  console.table(report);
  if (state.rows.some((row) => Number(row.migration_count) !== journal.entries.length)) {
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
