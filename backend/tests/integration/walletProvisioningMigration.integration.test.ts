import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { Pool } from "pg";

const adminConnectionString = process.env["DATABASE_ADMIN_URL"];
if (!adminConnectionString) {
  throw new Error("DATABASE_ADMIN_URL is required to run wallet provisioning migration tests");
}

const migrationsFolder = path.resolve(process.cwd(), "migrations");
const buildConnectionUrl = (base: string, database: string) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

test("wallet provisioning backfill works under FORCE RLS as a non-bypass migration login", async () => {
  const suffix = randomBytes(6).toString("hex");
  const dbName = `sensible_wallet_backfill_${suffix}`;
  const migratorRole = `sensible_wallet_migrator_${suffix}`;
  const password = randomBytes(18).toString("hex");
  const tenantId = "01994abc-0047-7000-8000-000000000201";
  const businessId = "01994abc-0047-7000-8000-000000000202";
  const outletId = "01994abc-0047-7000-8000-000000000203";
  const rootPool = new Pool({
    connectionString: buildConnectionUrl(adminConnectionString!, "postgres"),
    max: 1,
  });

  let roleCreated = false;
  let databaseCreated = false;
  let migrationPool: Pool | undefined;
  let setupPool: Pool | undefined;

  try {
    await rootPool.query(
      `CREATE ROLE ${migratorRole} LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`,
    );
    roleCreated = true;
    await rootPool.query(`GRANT sensible_rls_owner TO ${migratorRole} WITH ADMIN OPTION`);
    await rootPool.query(`CREATE DATABASE ${dbName} OWNER ${migratorRole}`);
    databaseCreated = true;
    await rootPool.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${migratorRole}`);

    const migrationUrl = new URL(buildConnectionUrl(adminConnectionString!, dbName));
    migrationUrl.username = migratorRole;
    migrationUrl.password = password;
    migrationPool = new Pool({ connectionString: migrationUrl.toString(), max: 1 });

    setupPool = new Pool({
      connectionString: buildConnectionUrl(adminConnectionString!, dbName),
      max: 1,
    });
    await setupPool.query(`
      CREATE SCHEMA tenancy;
      CREATE TABLE tenancy.outlets (
        tenant_id uuid NOT NULL,
        id uuid NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE SCHEMA billing;
      CREATE TABLE billing.wallets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id uuid NOT NULL,
        outlet_id uuid NOT NULL,
        currency varchar(10) NOT NULL DEFAULT 'INR',
        balance_credits numeric(16, 4) NOT NULL DEFAULT 0,
        UNIQUE (tenant_id, outlet_id)
      );
      ALTER TABLE billing.wallets OWNER TO sensible_rls_owner;
      ALTER TABLE billing.wallets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE billing.wallets FORCE ROW LEVEL SECURITY;
      CREATE POLICY wallets_insert ON billing.wallets FOR INSERT WITH CHECK (false);
      GRANT USAGE ON SCHEMA billing TO ${migratorRole} WITH GRANT OPTION;
      GRANT USAGE ON SCHEMA tenancy TO ${migratorRole};
      GRANT USAGE ON SCHEMA tenancy TO sensible_rls_owner;
      GRANT SELECT ON billing.wallets TO ${migratorRole};
      GRANT SELECT ON tenancy.outlets TO ${migratorRole};
      GRANT SELECT ON tenancy.outlets TO sensible_rls_owner;
      INSERT INTO tenancy.outlets (tenant_id, id)
        VALUES ('${tenantId}', '${outletId}');
    `);

    const migrationSql = await readFile(
      path.join(migrationsFolder, "0047_wallet_provisioning_backfill.sql"),
      "utf8",
    );
    const applyBackfill = async () => {
      await migrationPool!.query("BEGIN");
      try {
        await migrationPool!.query(migrationSql);
        await migrationPool!.query("COMMIT");
      } catch (error) {
        await migrationPool!.query("ROLLBACK");
        throw error;
      }
    };
    await applyBackfill();

    const currentRole = await migrationPool.query<{ current_user: string }>(
      "SELECT current_user",
    );
    assert.equal(currentRole.rows[0]!.current_user, migratorRole, "migration role must be restored");

    const firstRun = await setupPool.query<{
      count: string;
      balance: string;
      currency: string;
    }>(`
      SELECT COUNT(*)::text AS count,
             MIN(balance_credits)::text AS balance,
             MIN(currency) AS currency
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
    `, [tenantId, outletId]);
    assert.deepEqual(firstRun.rows[0], {
      count: "1",
      balance: "0.0000",
      currency: "INR",
    });

    await applyBackfill();
    const retryCount = await setupPool.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM billing.wallets
      WHERE tenant_id = $1 AND outlet_id = $2
    `, [tenantId, outletId]);
    assert.equal(retryCount.rows[0]!.count, "1", "reapplying the backfill must be idempotent");
  } finally {
    await migrationPool?.end();
    await setupPool?.end();
    if (databaseCreated) {
      await rootPool.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [dbName],
      );
      await rootPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    }
    if (roleCreated) await rootPool.query(`DROP ROLE IF EXISTS ${migratorRole}`);
    await rootPool.end();
  }
});
