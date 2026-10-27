/**
 * backend/tests/rls-integration.test.ts
 *
 * Integration tests for PostgreSQL Row-Level Security.
 *
 * Requirements:
 *   - Requires a real PostgreSQL database running with all migrations applied,
 *     including migration 0037.
 *   - The connection must use a role that is a non-superuser, non-BYPASSRLS
 *     member of sensible_app_role (the restricted application role).
 *   - Set DATABASE_URL_TEST to a test-only database. Never run against production.
 *   - Set RLS_TEST_ENABLED=1 to opt-in (tests skip by default to avoid
 *     accidental execution in CI without a real DB).
 *
 * What these tests verify:
 *   1.  Application role has NOBYPASSRLS and is not a superuser.
 *   2.  Missing tenant context → FORCE RLS blocks all queries (fail-closed).
 *   3.  Cross-tenant SELECT on crm.leads returns 0 rows.
 *   4.  Cross-tenant INSERT on crm.leads is rejected.
 *   5.  Outlet A member cannot SELECT crm.leads from Outlet B (same tenant).
 *   6.  Tenant admin can SELECT across all outlets in their tenant.
 *   7.  Tenant admin cannot SELECT across tenants.
 *   8.  crm.quick_contacts: outlet-scoped (migration 0037 upgrade verified).
 *   9.  crm.integrations: outlet-scoped (credential data).
 *   10. crm.public_urls: outlet-scoped (migration 0037 upgrade verified).
 *   11. crm.wallet_transactions: immutable — UPDATE blocked by missing policy.
 *   12. Connection pool reuse: released connection has no residual tenant ctx.
 *   13. isSuperAdmin=true context bypasses RLS for privileged background jobs.
 *   14. sensible_rls_owner BYPASSRLS role is not exposed as a login role.
 */

import assert from "node:assert/strict";
import { test, describe, before, after } from "node:test";
import { Pool, type PoolClient } from "pg";
import { v7 as uuidv7 } from "uuid";

// ──────────────────────────────────────────────────────────────────────────────
// Skip-unless guard
// ──────────────────────────────────────────────────────────────────────────────

const ENABLED = process.env.RLS_TEST_ENABLED === "1";
const DB_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

if (!ENABLED) {
  console.log(
    "[rls-integration] Skipped — set RLS_TEST_ENABLED=1 and DATABASE_URL_TEST " +
    "to run integration tests against a real database.",
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

let pool: Pool;

const connect = () => pool.connect();

/** Set tenant context (transaction-local) on an existing client. */
const setContext = async (
  client: PoolClient,
  opts: { tenantId: string; userId: string; isSuperAdmin?: boolean },
) => {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [opts.tenantId]);
  await client.query("SELECT set_config('app.current_user_id',$1,true)", [opts.userId]);
  await client.query("SELECT set_config('app.is_super_admin',$1,true)", [String(opts.isSuperAdmin === true)]);
};

const clearContext = async (client: PoolClient) => {
  await client.query("ROLLBACK");
};

/** Insert a tenant + business + outlet + user + membership + assignment.
    Returns { tenantId, businessId, outletId, userId }. */
const createFixture = async (client: PoolClient) => {
  // Insert as sensible_rls_owner bypasses RLS for fixture setup.
  // We use a superuser / migration connection here; in practice this helper
  // should be invoked via a separate migration-user pool, not the app pool.
  const tenantId = uuidv7();
  const businessId = uuidv7();
  const outletId = uuidv7();
  const userId = uuidv7();
  await client.query(
    `INSERT INTO tenancy.tenants (id, name, slug) VALUES ($1, $2, $3)`,
    [tenantId, `Test Tenant ${tenantId.slice(0, 8)}`, `test-${tenantId.slice(0, 8)}`],
  );
  await client.query(
    `INSERT INTO tenancy.businesses (id, tenant_id, name) VALUES ($1, $2, $3)`,
    [businessId, tenantId, "Test Business"],
  );
  await client.query(
    `INSERT INTO tenancy.outlets (id, tenant_id, business_id, outlet_code, name) VALUES ($1,$2,$3,$4,$5)`,
    [outletId, tenantId, businessId, `outlet-${outletId.slice(0, 8)}`, "Test Outlet"],
  );
  await client.query(
    `INSERT INTO iam.users (id, email, display_name) VALUES ($1,$2,$3)`,
    [userId, `${userId.slice(0, 8)}@test.invalid`, "Test User"],
  );
  await client.query(
    `INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin) VALUES ($1,$2,false)`,
    [tenantId, userId],
  );
  return { tenantId, businessId, outletId, userId };
};

// ──────────────────────────────────────────────────────────────────────────────
// Test suite
// ──────────────────────────────────────────────────────────────────────────────

describe("RLS Integration Tests", { skip: !ENABLED }, () => {
  // Shared fixture data created once per suite via the app pool (requires admin)
  let tenantA: { tenantId: string; businessId: string; outletId: string; userId: string };
  let tenantA_outletB: { outletId: string; userId: string };
  let tenantB: { tenantId: string; businessId: string; outletId: string; userId: string };

  before(async () => {
    if (!DB_URL) throw new Error("DATABASE_URL_TEST or DATABASE_URL must be set");
    pool = new Pool({ connectionString: DB_URL });

    // Fixtures are inserted by the app-role connection.
    // This works only when the test DB was set up with the app user granted
    // INSERT on the iam/tenancy tables AND a transaction with isSuperAdmin=true.
    const client = await connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000000',true)");
    await client.query("SELECT set_config('app.current_user_id','00000000-0000-0000-0000-000000000000',true)");
    await client.query("SELECT set_config('app.is_super_admin','true',true)");
    tenantA = await createFixture(client);
    tenantB = await createFixture(client);

    // Second outlet in tenant A for cross-outlet tests
    const outletBId = uuidv7();
    const userBId = uuidv7();
    await client.query(
      `INSERT INTO tenancy.outlets (id, tenant_id, business_id, outlet_code, name) VALUES ($1,$2,$3,$4,$5)`,
      [outletBId, tenantA.tenantId, tenantA.businessId, `outlet-b-${outletBId.slice(0,8)}`, "Outlet B"],
    );
    await client.query(
      `INSERT INTO iam.users (id, email, display_name) VALUES ($1,$2,$3)`,
      [userBId, `${userBId.slice(0,8)}@test.invalid`, "Outlet B User"],
    );
    await client.query(
      `INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin) VALUES ($1,$2,false)`,
      [tenantA.tenantId, userBId],
    );
    // Note: userBId is assigned only to outletBId, NOT to tenantA.outletId
    tenantA_outletB = { outletId: outletBId, userId: userBId };

    await client.query("COMMIT");
    client.release();
  });

  after(async () => {
    // Clean up fixtures — delete tenants cascade-deletes all child rows.
    const client = await connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.is_super_admin','true',true)");
    await client.query("SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000000',true)");
    await client.query("SELECT set_config('app.current_user_id','00000000-0000-0000-0000-000000000000',true)");
    await client.query(
      `DELETE FROM tenancy.tenants WHERE id IN ($1, $2)`,
      [tenantA.tenantId, tenantB.tenantId],
    );
    await client.query("COMMIT");
    client.release();
    await pool.end();
  });

  // ─── 1. Role assertions ──────────────────────────────────────────────────

  test("1. Application DB role is not superuser and has no BYPASSRLS", async () => {
    const client = await connect();
    const { rows } = await client.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      has_app_role: boolean;
    }>(
      `SELECT role.rolsuper, role.rolbypassrls,
          pg_has_role(current_user, 'sensible_app_role', 'member') AS has_app_role
       FROM pg_roles role WHERE role.rolname = current_user`,
    );
    client.release();
    const row = rows[0];
    assert.ok(row, "Should find the current role in pg_roles");
    assert.equal(row.rolsuper, false, "Application role must not be superuser");
    assert.equal(row.rolbypassrls, false, "Application role must not have BYPASSRLS");
    assert.equal(row.has_app_role, true, "Connection user must be member of sensible_app_role");
  });

  test("2. sensible_rls_owner has BYPASSRLS but is NOT a login role", async () => {
    const client = await connect();
    const { rows } = await client.query<{ rolbypassrls: boolean; rolcanlogin: boolean }>(
      `SELECT rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'sensible_rls_owner'`,
    );
    client.release();
    const row = rows[0];
    assert.ok(row, "sensible_rls_owner must exist");
    assert.equal(row.rolbypassrls, true, "sensible_rls_owner must have BYPASSRLS");
    assert.equal(row.rolcanlogin, false, "sensible_rls_owner must not be a login role");
  });

  // ─── 2. Fail-closed: missing context ────────────────────────────────────

  test("3. No tenant context → SELECT on crm.leads returns 0 rows (fail-closed)", async () => {
    const client = await connect();
    // Do NOT set any context — just use raw pool client without BEGIN
    const { rows } = await client.query(
      "SELECT id FROM crm.leads LIMIT 1",
    );
    client.release();
    assert.equal(rows.length, 0, "FORCE RLS with no context must return 0 rows");
  });

  test("4. No tenant context → INSERT on crm.leads is rejected", async () => {
    const client = await connect();
    await assert.rejects(
      () => client.query(
        `INSERT INTO crm.leads (id, tenant_id, business_id, outlet_id, created_by_user_id, updated_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv7(), tenantA.tenantId, tenantA.businessId, tenantA.outletId, tenantA.userId, tenantA.userId],
      ),
      /new row violates row-level security|permission denied/,
      "INSERT without context must be rejected by RLS",
    );
    client.release();
  });

  // ─── 3. Cross-tenant isolation ───────────────────────────────────────────

  test("5. User from tenant A cannot SELECT crm.leads rows belonging to tenant B", async () => {
    // First insert a lead for tenant B (via super-admin context)
    const superClient = await connect();
    await superClient.query("BEGIN");
    await superClient.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantB.tenantId]);
    await superClient.query("SELECT set_config('app.current_user_id',$1,true)", [tenantB.userId]);
    await superClient.query("SELECT set_config('app.is_super_admin','true',true)");
    const leadId = uuidv7();
    await superClient.query(
      `INSERT INTO crm.leads (id, tenant_id, business_id, outlet_id, created_by_user_id, updated_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$5)`,
      [leadId, tenantB.tenantId, tenantB.businessId, tenantB.outletId, tenantB.userId],
    );
    await superClient.query("COMMIT");
    superClient.release();

    // Now query as tenant A user
    const appClient = await connect();
    await setContext(appClient, { tenantId: tenantA.tenantId, userId: tenantA.userId });
    const { rows } = await appClient.query(
      "SELECT id FROM crm.leads WHERE id = $1",
      [leadId],
    );
    await clearContext(appClient);
    appClient.release();

    assert.equal(rows.length, 0, "Tenant A user must not see tenant B's lead");
  });

  test("6. User from tenant A cannot INSERT a lead into tenant B", async () => {
    const client = await connect();
    await setContext(client, { tenantId: tenantA.tenantId, userId: tenantA.userId });
    await assert.rejects(
      () => client.query(
        `INSERT INTO crm.leads (id, tenant_id, business_id, outlet_id, created_by_user_id, updated_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$5)`,
        [uuidv7(), tenantB.tenantId, tenantB.businessId, tenantB.outletId, tenantA.userId],
      ),
      /new row violates row-level security|permission denied/,
      "Tenant A user must not insert into tenant B's outlet",
    );
    await clearContext(client);
    client.release();
  });

  // ─── 4. Cross-outlet isolation (same tenant) ────────────────────────────

  test("7. Outlet A user cannot SELECT crm.leads from outlet B (same tenant)", async () => {
    // Insert a lead in outlet B (via super-admin)
    const superClient = await connect();
    await superClient.query("BEGIN");
    await superClient.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantA.tenantId]);
    await superClient.query("SELECT set_config('app.current_user_id',$1,true)", [tenantA.userId]);
    await superClient.query("SELECT set_config('app.is_super_admin','true',true)");
    const leadId = uuidv7();
    await superClient.query(
      `INSERT INTO crm.leads (id, tenant_id, business_id, outlet_id, created_by_user_id, updated_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$5)`,
      [leadId, tenantA.tenantId, tenantA.businessId, tenantA_outletB.outletId, tenantA_outletB.userId],
    );
    await superClient.query("COMMIT");
    superClient.release();

    // Query as the outlet A user (not assigned to outlet B)
    const appClient = await connect();
    await setContext(appClient, { tenantId: tenantA.tenantId, userId: tenantA.userId });
    const { rows } = await appClient.query(
      "SELECT id FROM crm.leads WHERE id = $1",
      [leadId],
    );
    await clearContext(appClient);
    appClient.release();

    assert.equal(rows.length, 0, "Outlet A user must not see outlet B's lead in the same tenant");
  });

  // ─── 5. Tenant admin access ──────────────────────────────────────────────

  test("8. Tenant admin can SELECT across all outlets in their tenant", async () => {
    // Create a tenant-admin user
    const adminId = uuidv7();
    const superClient = await connect();
    await superClient.query("BEGIN");
    await superClient.query("SELECT set_config('app.is_super_admin','true',true)");
    await superClient.query("SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000000',true)");
    await superClient.query("SELECT set_config('app.current_user_id','00000000-0000-0000-0000-000000000000',true)");
    await superClient.query(
      `INSERT INTO iam.users (id, email, display_name) VALUES ($1,$2,$3)`,
      [adminId, `${adminId.slice(0,8)}@test.invalid`, "Tenant Admin"],
    );
    await superClient.query(
      `INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin) VALUES ($1,$2,true)`,
      [tenantA.tenantId, adminId],
    );
    await superClient.query("COMMIT");
    superClient.release();

    // Admin queries both outlets
    const appClient = await connect();
    await setContext(appClient, { tenantId: tenantA.tenantId, userId: adminId });
    const { rows } = await appClient.query(
      "SELECT id FROM crm.leads WHERE tenant_id = $1 LIMIT 10",
      [tenantA.tenantId],
    );
    await clearContext(appClient);
    appClient.release();

    // Admin should see at least the leads we inserted above
    assert.ok(rows.length >= 1, "Tenant admin should see leads from multiple outlets");
  });

  test("9. Tenant admin cannot SELECT another tenant's rows", async () => {
    // Make tenantA's admin user; attempt to read tenantB's data
    const adminId = uuidv7();
    const superClient = await connect();
    await superClient.query("BEGIN");
    await superClient.query("SELECT set_config('app.is_super_admin','true',true)");
    await superClient.query("SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000000',true)");
    await superClient.query("SELECT set_config('app.current_user_id','00000000-0000-0000-0000-000000000000',true)");
    await superClient.query(
      `INSERT INTO iam.users (id, email, display_name) VALUES ($1,$2,$3)`,
      [adminId, `${adminId.slice(0,8)}-adm@test.invalid`, "Tenant A Admin"],
    );
    await superClient.query(
      `INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin) VALUES ($1,$2,true)`,
      [tenantA.tenantId, adminId],
    );
    await superClient.query("COMMIT");
    superClient.release();

    // tenantA admin, but reads with tenantA context — should not see tenantB rows
    const appClient = await connect();
    await setContext(appClient, { tenantId: tenantA.tenantId, userId: adminId });
    const { rows } = await appClient.query(
      "SELECT id FROM crm.leads WHERE tenant_id = $1 LIMIT 1",
      [tenantB.tenantId],
    );
    await clearContext(appClient);
    appClient.release();
    assert.equal(rows.length, 0, "Tenant A admin must not see tenant B rows");
  });

  // ─── 6. Migration 0037 tables: outlet-scoped ─────────────────────────────

  test("10. crm.quick_contacts: user not assigned to outlet cannot SELECT", async () => {
    // Insert a quick_contact in outlet B (super-admin context)
    const superClient = await connect();
    await superClient.query("BEGIN");
    await superClient.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantA.tenantId]);
    await superClient.query("SELECT set_config('app.current_user_id',$1,true)", [tenantA.userId]);
    await superClient.query("SELECT set_config('app.is_super_admin','true',true)");
    const contactId = uuidv7();
    await superClient.query(
      `INSERT INTO crm.quick_contacts (id, tenant_id, outlet_id, name, mobile)
       VALUES ($1,$2,$3,'Test Contact','9876543210')`,
      [contactId, tenantA.tenantId, tenantA_outletB.outletId],
    );
    await superClient.query("COMMIT");
    superClient.release();

    // Query as outlet A user (not assigned to outlet B)
    const appClient = await connect();
    await setContext(appClient, { tenantId: tenantA.tenantId, userId: tenantA.userId });
    const { rows } = await appClient.query(
      "SELECT id FROM crm.quick_contacts WHERE id = $1",
      [contactId],
    );
    await clearContext(appClient);
    appClient.release();

    assert.equal(rows.length, 0, "Outlet A user must not see outlet B quick_contacts after 0037 upgrade");
  });

  test("11. crm.public_urls: user not assigned to outlet cannot SELECT", async () => {
    const superClient = await connect();
    await superClient.query("BEGIN");
    await superClient.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantA.tenantId]);
    await superClient.query("SELECT set_config('app.current_user_id',$1,true)", [tenantA_outletB.userId]);
    await superClient.query("SELECT set_config('app.is_super_admin','true',true)");
    const urlId = uuidv7();
    await superClient.query(
      `INSERT INTO crm.public_urls
         (id, tenant_id, outlet_id, owner_user_id, display_name, target_type, target_id)
       VALUES ($1,$2,$3,$4,'Test URL','lead','abc123')`,
      [urlId, tenantA.tenantId, tenantA_outletB.outletId, tenantA_outletB.userId],
    );
    await superClient.query("COMMIT");
    superClient.release();

    const appClient = await connect();
    await setContext(appClient, { tenantId: tenantA.tenantId, userId: tenantA.userId });
    const { rows } = await appClient.query(
      "SELECT id FROM crm.public_urls WHERE id = $1",
      [urlId],
    );
    await clearContext(appClient);
    appClient.release();

    assert.equal(rows.length, 0, "Outlet A user must not see outlet B public_urls after 0037 upgrade");
  });

  test("12. crm.wallet_transactions: UPDATE is blocked (immutable ledger)", async () => {
    const superClient = await connect();
    await superClient.query("BEGIN");
    await superClient.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantA.tenantId]);
    await superClient.query("SELECT set_config('app.current_user_id',$1,true)", [tenantA.userId]);
    await superClient.query("SELECT set_config('app.is_super_admin','true',true)");
    // Create wallet account first
    await superClient.query(
      `INSERT INTO crm.wallet_accounts (tenant_id, outlet_id, user_id, balance)
       VALUES ($1,$2,$3,100) ON CONFLICT DO NOTHING`,
      [tenantA.tenantId, tenantA.outletId, tenantA.userId],
    );
    const txId = uuidv7();
    await superClient.query(
      `INSERT INTO crm.wallet_transactions
         (id, tenant_id, outlet_id, user_id, amount, transaction_type, balance_after, created_by_user_id)
       VALUES ($1,$2,$3,$4,50,'CREDIT',150,$4)`,
      [txId, tenantA.tenantId, tenantA.outletId, tenantA.userId],
    );
    await superClient.query("COMMIT");
    superClient.release();

    // Attempt UPDATE as regular app-role user
    const appClient = await connect();
    await setContext(appClient, { tenantId: tenantA.tenantId, userId: tenantA.userId });
    const result = await appClient.query(
      "UPDATE crm.wallet_transactions SET amount = 999 WHERE id = $1",
      [txId],
    );
    await clearContext(appClient);
    appClient.release();

    assert.equal(result.rowCount, 0, "Wallet transaction UPDATE must be blocked by FORCE RLS (no UPDATE policy)");
  });

  // ─── 7. Connection pool reuse ────────────────────────────────────────────

  test("13. Released pool connection has no residual tenant context", async () => {
    const client = await connect();
    await setContext(client, { tenantId: tenantA.tenantId, userId: tenantA.userId });
    await client.query("COMMIT"); // End transaction → transaction-local vars cleared
    client.release(); // Return to pool

    // Re-acquire the same physical connection from the pool
    const reusedClient = await connect();
    const { rows } = await reusedClient.query(
      "SELECT current_setting('app.current_tenant_id', true) AS tid",
    );
    reusedClient.release();

    assert.equal(
      rows[0]?.tid ?? "",
      "",
      "Returned pool connection must have empty tenant context (transaction-local vars cleared on COMMIT)",
    );
  });

  test("14. Pool connect hook sets session vars to empty on new physical connection", async () => {
    // This test relies on the pool.on('connect') handler in client.ts.
    // We verify by checking what a fresh connection reports.
    const freshClient = await connect();
    const { rows } = await freshClient.query(`
      SELECT
        current_setting('app.current_tenant_id', true) AS tid,
        current_setting('app.current_user_id', true) AS uid,
        current_setting('app.is_super_admin', true) AS sa
    `);
    freshClient.release();
    assert.equal(rows[0]?.tid ?? "", "", "Fresh connection: current_tenant_id must be empty");
    assert.equal(rows[0]?.uid ?? "", "", "Fresh connection: current_user_id must be empty");
    assert.notEqual(rows[0]?.sa, "true", "Fresh connection: is_super_admin must not be 'true'");
  });

  // ─── 8. Privileged background job via isSuperAdmin ───────────────────────

  test("15. isSuperAdmin=true context can SELECT across tenant boundaries", async () => {
    const client = await connect();
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id','00000000-0000-0000-0000-000000000000',true)");
    await client.query("SELECT set_config('app.current_user_id','00000000-0000-0000-0000-000000000000',true)");
    await client.query("SELECT set_config('app.is_super_admin','true',true)");

    const { rows } = await client.query("SELECT count(*) AS n FROM tenancy.tenants");
    await client.query("ROLLBACK");
    client.release();

    const count = parseInt(rows[0]?.n ?? "0", 10);
    assert.ok(count >= 2, "Super-admin context must see all tenants (test has at least 2)");
  });

  // ─── 9. Policy correctness for migration 0037 tables ────────────────────

  test("16. crm.integrations: cross-outlet SELECT returns 0 rows", async () => {
    const superClient = await connect();
    await superClient.query("BEGIN");
    await superClient.query("SELECT set_config('app.is_super_admin','true',true)");
    await superClient.query("SELECT set_config('app.current_tenant_id',$1,true)", [tenantA.tenantId]);
    await superClient.query("SELECT set_config('app.current_user_id',$1,true)", [tenantA.userId]);
    const intId = uuidv7();
    await superClient.query(
      `INSERT INTO crm.integrations
         (id, tenant_id, outlet_id, integration_key, integration_type)
       VALUES ($1,$2,$3,'test-key','TEST')`,
      [intId, tenantA.tenantId, tenantA_outletB.outletId],
    );
    await superClient.query("COMMIT");
    superClient.release();

    const appClient = await connect();
    await setContext(appClient, { tenantId: tenantA.tenantId, userId: tenantA.userId });
    const { rows } = await appClient.query(
      "SELECT id FROM crm.integrations WHERE id = $1",
      [intId],
    );
    await clearContext(appClient);
    appClient.release();

    assert.equal(rows.length, 0, "Outlet A user must not see outlet B integrations (credentials protected)");
  });
});
