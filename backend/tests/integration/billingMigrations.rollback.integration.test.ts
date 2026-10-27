import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type QueryResultRow } from "pg";

const adminConnectionString = process.env["DATABASE_ADMIN_URL"];
if (!adminConnectionString) {
  throw new Error("DATABASE_ADMIN_URL is required to run billing migration rollback tests");
}

const migrationsFolder = path.resolve(process.cwd(), "migrations");
const buildConnectionUrl = (base: string, database: string) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};
const migrationSql = (name: string) => readFile(path.join(migrationsFolder, name), "utf8");
const applyMigrationSql = async (pool: Pool, sql: string): Promise<void> => {
  await pool.query("BEGIN");
  try {
    await pool.query(sql);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
};
const queryAsRlsOwner = async <T extends QueryResultRow>(
  pool: Pool,
  sql: string,
  parameters: unknown[] = [],
) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE sensible_rls_owner");
    const result = await client.query<T>(sql, parameters);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

test("billing migrations roll back fail-closed and reapply cleanly", async () => {
  assert.ok(adminConnectionString);
  const rootPool = new Pool({
    connectionString: buildConnectionUrl(adminConnectionString, "postgres"),
    max: 1,
  });
  const dbName = `sensible_billing_rollback_${randomBytes(6).toString("hex")}`;
  await rootPool.query(`CREATE DATABASE ${dbName}`);
  const pool = new Pool({ connectionString: buildConnectionUrl(adminConnectionString, dbName), max: 1 });

  try {
    await pool.query("SELECT set_config('app.is_super_admin', 'true', false)");
    await migrate(drizzle(pool), { migrationsFolder });

    const tenantId = "01994abc-0047-7000-8000-000000000101";
    const businessId = "01994abc-0047-7000-8000-000000000102";
    const outletId = "01994abc-0047-7000-8000-000000000103";
    await pool.query(`
      ALTER TABLE tenancy.businesses DISABLE TRIGGER USER;
      INSERT INTO tenancy.tenants (id, name, slug)
        VALUES ('${tenantId}', 'Backfill tenant', 'backfill-tenant');
      INSERT INTO tenancy.businesses (id, tenant_id, name)
        VALUES ('${businessId}', '${tenantId}', 'Backfill business');
      INSERT INTO tenancy.outlets (id, tenant_id, business_id, outlet_code, name)
        VALUES ('${outletId}', '${tenantId}', '${businessId}', 'BACKFILL', 'Backfill outlet');
      ALTER TABLE tenancy.businesses ENABLE TRIGGER USER;
    `);
    await applyMigrationSql(pool, await migrationSql("0047_wallet_provisioning_backfill.sql"));
    const backfilledWallet = await queryAsRlsOwner<{
      count: string;
      balance: string | null;
      currency: string | null;
    }>(pool, `
      SELECT COUNT(*)::text AS count,
             MIN(balance_credits)::text AS balance,
             MIN(currency) AS currency
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
    `, [tenantId, outletId]);
    assert.deepEqual(backfilledWallet.rows[0], {
      count: "1",
      balance: "0.0000",
      currency: "INR",
    }, "backfill must provision a zero-balance wallet for an existing outlet under FORCE RLS");

    await pool.query(await migrationSql("0046_platform_admin_rls_rollback.sql"));
    const failClosed = await pool.query<{
      function_exists: boolean;
      write_policy_count: string;
      can_insert: boolean;
      can_update: boolean;
    }>(`
      SELECT to_regprocedure('billing.is_platform_admin()') IS NOT NULL AS function_exists,
             (SELECT COUNT(*)::text FROM pg_policies
              WHERE schemaname = 'billing' AND tablename = 'rate_cards'
                AND cmd IN ('INSERT', 'UPDATE')) AS write_policy_count,
             has_table_privilege('sensible_app_role', 'billing.rate_cards', 'INSERT') AS can_insert,
             has_table_privilege('sensible_app_role', 'billing.rate_cards', 'UPDATE') AS can_update
    `);
    assert.equal(failClosed.rows[0]!.function_exists, false);
    assert.equal(failClosed.rows[0]!.write_policy_count, "0");
    assert.equal(failClosed.rows[0]!.can_insert, false);
    assert.equal(failClosed.rows[0]!.can_update, false);

    await pool.query(await migrationSql("0045_rate_card_admin_rollback.sql"));
    await pool.query(await migrationSql("0044_billing_rollback.sql"));
    const removed = await pool.query<{ schema_exists: boolean }>(
      "SELECT to_regnamespace('billing') IS NOT NULL AS schema_exists",
    );
    assert.equal(removed.rows[0]!.schema_exists, false);

    await pool.query(await migrationSql("0044_billing_schema.sql"));
    await pool.query(await migrationSql("0045_rate_card_admin.sql"));
    await pool.query(await migrationSql("0046_platform_admin_rls.sql"));
    await applyMigrationSql(pool, await migrationSql("0047_wallet_provisioning_backfill.sql"));

    const reapplied = await pool.query<{
      table_count: string;
      prosecdef: boolean;
      policy_count: string;
      public_execute: boolean;
    }>(`
      SELECT (SELECT COUNT(*)::text FROM information_schema.tables
              WHERE table_schema = 'billing') AS table_count,
             (SELECT procedure.prosecdef FROM pg_proc AS procedure
              JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
              WHERE namespace.nspname = 'billing'
                AND procedure.proname = 'is_platform_admin') AS prosecdef,
             (SELECT COUNT(*)::text FROM pg_policies
              WHERE schemaname = 'billing' AND tablename = 'rate_cards'
                AND cmd IN ('INSERT', 'UPDATE')) AS policy_count,
             EXISTS (
               SELECT 1
               FROM pg_proc AS procedure
               JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
               CROSS JOIN LATERAL aclexplode(
                 COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
               ) AS privilege
               WHERE namespace.nspname = 'billing'
                 AND procedure.proname = 'is_platform_admin'
                 AND privilege.grantee = 0
                 AND privilege.privilege_type = 'EXECUTE'
             ) AS public_execute
    `);
    assert.equal(reapplied.rows[0]!.table_count, "5");
    assert.equal(reapplied.rows[0]!.prosecdef, true);
    assert.equal(reapplied.rows[0]!.policy_count, "2");
    assert.equal(reapplied.rows[0]!.public_execute, false);
  } finally {
    await pool.end();
    await rootPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid() AND backend_type = 'client backend'",
      [dbName],
    );
    await rootPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await rootPool.end();
  }
});
