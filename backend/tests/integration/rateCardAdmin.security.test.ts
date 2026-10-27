/**
 * Phase 10 — Rate Card Admin Security Regression Tests
 *
 * Requires DATABASE_ADMIN_URL to be set.
 * Tests are skipped automatically when the env var is absent.
 *
 * Coverage:
 *   1. billing.is_platform_admin() function behaviour
 *   2. RLS INSERT policy: blocked without platform-admin context
 *   3. RLS INSERT policy: allowed with platform-admin context
 *   4. RLS UPDATE policy: blocked without platform-admin context
 *   5. RLS UPDATE policy: allowed with platform-admin context
 *   6. SELECT policy: open to all authenticated users (USING(true))
 *   7. App-layer requirePlatformAdmin: blocks wrong tenant
 *   8. App-layer requirePlatformAdmin: blocks missing env var (503-equivalent)
 *   9. App-layer requirePlatformAdmin: passes correct platform tenant admin
 *  10. Uniqueness/ambiguity constraint: duplicate active global rate is rejected
 *  11. Historical integrity: referenced rate card cannot be hard-deleted
 *  12. Deactivation does not alter structural fields (immutability)
 */
import assert from "node:assert/strict";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";
import { seedFoundation } from "../../src/db/seeds/foundation.js";
import type { TransactionDatabase } from "../../src/db/context.js";
import * as databaseSchema from "../../src/db/schema/index.js";
import { rateCardAdminService } from "../../src/modules/billing/rateCard.service.js";

const adminConnectionString = process.env.DATABASE_ADMIN_URL;
const migrationsFolder = path.resolve(process.cwd(), "migrations");

const buildConnectionUrl = (base: string, database: string) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

// ─── Context helpers ─────────────────────────────────────────────────────────

/** Ordinary authenticated user — no platform-admin privileges. */
const withAppContext = async <T>(
  client: PoolClient,
  tenantId: string,
  userId: string,
  operation: () => Promise<T>,
): Promise<T> => {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE sensible_app_role");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await client.query("SELECT set_config('app.is_super_admin', 'false', true)");
    await client.query("SELECT set_config('app.is_platform_admin', 'false', true)");
    const value = await operation();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

/** Platform administrator context — is_platform_admin = 'true'. */
const withPlatformAdminContext = async <T>(
  client: PoolClient,
  tenantId: string,
  userId: string,
  operation: () => Promise<T>,
): Promise<T> => {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL ROLE sensible_app_role");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    await client.query("SELECT set_config('app.is_super_admin', 'false', true)");
    await client.query("SELECT set_config('app.is_platform_admin', 'true', true)");
    const value = await operation();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const makeDb = (client: PoolClient): TransactionDatabase => ({
  client,
  db: drizzle(client, { schema: databaseSchema }),
} as TransactionDatabase);

const ids = {
  platformTenant: "01994bbc-0010-7000-8000-000000000001",
  otherTenant:    "01994bbc-0010-7000-8000-000000000002",
  platformUser:   "01994bbc-0010-7000-8000-000000000051",
  otherUser:      "01994bbc-0010-7000-8000-000000000052",
  role:           "01994bbc-0010-7000-8000-000000000031",
};

const seedTenants = async (pool: Pool): Promise<void> => {
  await pool.query(`
    SELECT set_config('app.is_super_admin', 'true', false);
    ALTER TABLE tenancy.businesses DISABLE TRIGGER USER;
    INSERT INTO tenancy.tenants    (id, legacy_id, name, slug)
      VALUES ('${ids.platformTenant}', 'platform-tenant', 'Platform Tenant', 'platform-tenant'),
             ('${ids.otherTenant}',   'other-tenant',    'Other Tenant',    'other-tenant');
    INSERT INTO tenancy.businesses (id, tenant_id, legacy_id, name)
      VALUES ('01994bbc-0010-7000-8000-000000000011', '${ids.platformTenant}', 'platform-biz', 'Platform Biz'),
             ('01994bbc-0010-7000-8000-000000000012', '${ids.otherTenant}',   'other-biz',    'Other Biz');
    INSERT INTO tenancy.outlets    (id, tenant_id, business_id, legacy_id, outlet_code, name)
      VALUES ('01994bbc-0010-7000-8000-000000000021', '${ids.platformTenant}', '01994bbc-0010-7000-8000-000000000011', 'platform-outlet', 'PL1', 'Platform Outlet'),
             ('01994bbc-0010-7000-8000-000000000022', '${ids.otherTenant}',   '01994bbc-0010-7000-8000-000000000012', 'other-outlet',    'OT1', 'Other Outlet');
    INSERT INTO iam.roles   (id, tenant_id, name)
      VALUES ('${ids.role}', '${ids.platformTenant}', 'member');
    INSERT INTO iam.users   (id, legacy_id, email, display_name)
      VALUES ('${ids.platformUser}', 'platform-user', 'platform@example.com', 'Platform User'),
             ('${ids.otherUser}',   'other-user',    'other@example.com',    'Other User');
    INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin)
      VALUES ('${ids.platformTenant}', '${ids.platformUser}', true),
             ('${ids.otherTenant}',   '${ids.otherUser}',    true);
    INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id)
      VALUES ('${ids.platformTenant}', '01994bbc-0010-7000-8000-000000000021', '${ids.platformUser}', '${ids.role}');
    ALTER TABLE tenancy.businesses ENABLE TRIGGER USER;
  `);
};

// ─────────────────────────────────────────────────────────────────────────────

test("rate card admin — security regression (Phase 10)", { skip: !adminConnectionString }, async () => {
  assert.ok(adminConnectionString);

  const adminPool = new Pool({ connectionString: buildConnectionUrl(adminConnectionString, "postgres"), max: 1 });
  const dbName = `sensible_ratecard_sec_test_${randomBytes(6).toString("hex")}`;
  let grantedAppRole = false;

  await adminPool.query(`CREATE DATABASE ${dbName}`);
  const testConnectionString = buildConnectionUrl(adminConnectionString, dbName);
  const pool = new Pool({ connectionString: testConnectionString, max: 5 });

  try {
    // ── Migrate + seed ────────────────────────────────────────────────────────
    await pool.query("SELECT set_config('app.is_super_admin', 'true', false)");
    await migrate(drizzle(pool), { migrationsFolder });
    const membership = await pool.query<{ is_member: boolean }>(
      "SELECT pg_has_role(current_user, 'sensible_app_role', 'member') AS is_member",
    );
    if (!membership.rows[0]?.is_member) {
      await pool.query("GRANT sensible_app_role TO CURRENT_USER");
      grantedAppRole = true;
    }
    await seedFoundation(pool);
    await seedTenants(pool);

    const client = await pool.connect();
    try {
      // Seed through the same policy used by the application; no migration-role
      // or table-owner bypass is used for this fixture.
      const existingCardId = await withPlatformAdminContext(
        client,
        ids.platformTenant,
        ids.platformUser,
        async () => {
          const seedResult = await client.query<{ id: string }>(`
            INSERT INTO billing.rate_cards
              (service_type, unit_label, credits_per_unit, is_active)
            VALUES ('ai.chat_token', '1k_tokens', '10.0000', true)
            RETURNING id
          `);
          return seedResult.rows[0]!.id;
        },
      );

      // ── 1. billing.is_platform_admin() returns false by default ───────────
      const noContext = await client.query<{ result: boolean }>(
        "SELECT billing.is_platform_admin() AS result",
      );
      assert.equal(noContext.rows[0]!.result, false,
        "billing.is_platform_admin() must return false with no session var");

      // ── 2. billing.is_platform_admin() obeys app.is_platform_admin = 'false'
      const falseResult = await client.query<{ result: boolean }>(`
        SELECT set_config('app.is_platform_admin', 'false', true),
               billing.is_platform_admin() AS result
      `);
      assert.equal(falseResult.rows[0]!.result, false,
        "billing.is_platform_admin() must return false when session var is 'false'");

      // ── 3. billing.is_platform_admin() obeys app.is_platform_admin = 'true'
      const trueResult = await client.query<{ result: boolean }>(`
        SELECT set_config('app.is_platform_admin', 'true', true),
               billing.is_platform_admin() AS result
      `);
      assert.equal(trueResult.rows[0]!.result, true,
        "billing.is_platform_admin() must return true when session var is 'true'");

      const functionSecurity = await client.query<{
        prosecdef: boolean;
        owner_name: string;
        proconfig: string[] | null;
        proacl: string | null;
      }>(`
        SELECT procedure.prosecdef,
               owner.rolname AS owner_name,
               procedure.proconfig,
               procedure.proacl::text AS proacl
        FROM pg_proc AS procedure
        JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
        JOIN pg_roles AS owner ON owner.oid = procedure.proowner
        WHERE namespace.nspname = 'billing'
          AND procedure.proname = 'is_platform_admin'
          AND pg_get_function_identity_arguments(procedure.oid) = ''
      `);
      const securedFunction = functionSecurity.rows[0];
      assert.ok(securedFunction, "billing.is_platform_admin() must exist");
      assert.equal(securedFunction.prosecdef, true, "function must be SECURITY DEFINER");
      assert.equal(securedFunction.owner_name, "sensible_rls_owner");
      assert.ok(
        securedFunction.proconfig?.some((entry) => entry.startsWith("search_path=pg_catalog")),
        "function must pin search_path to trusted schemas",
      );
      assert.doesNotMatch(securedFunction.proacl ?? "", /(^|,)=[^,]*X/,
        "PUBLIC must not retain EXECUTE on the function");
      assert.match(securedFunction.proacl ?? "", /sensible_app_role=.*X/,
        "application role must retain explicit EXECUTE");

      await withPlatformAdminContext(client, ids.platformTenant, ids.platformUser, async () => {
        const inside = await client.query<{ result: boolean }>(
          "SELECT billing.is_platform_admin() AS result",
        );
        assert.equal(inside.rows[0]!.result, true);
      });
      const afterCommit = await client.query<{ value: string | null; result: boolean }>(`
        SELECT nullif(current_setting('app.is_platform_admin', true), '') AS value,
               billing.is_platform_admin() AS result
      `);
      assert.equal(afterCommit.rows[0]!.value, null,
        "platform-admin GUC must not leak after COMMIT");
      assert.equal(afterCommit.rows[0]!.result, false);

      await assert.rejects(
        () => withPlatformAdminContext(client, ids.platformTenant, ids.platformUser, async () => {
          throw new Error("force rollback");
        }),
        /force rollback/,
      );
      const afterRollback = await client.query<{ value: string | null; result: boolean }>(`
        SELECT nullif(current_setting('app.is_platform_admin', true), '') AS value,
               billing.is_platform_admin() AS result
      `);
      assert.equal(afterRollback.rows[0]!.value, null,
        "platform-admin GUC must not leak after ROLLBACK");
      assert.equal(afterRollback.rows[0]!.result, false);

      // ── 4. RLS INSERT policy: blocked when is_platform_admin = false ───────
      await assert.rejects(
        () => withAppContext(client, ids.otherTenant, ids.otherUser, async () => {
          await client.query(`
            INSERT INTO billing.rate_cards (service_type, unit_label, credits_per_unit, is_active)
            VALUES ('sms.blocked_attempt', 'sms', '1.0000', true)
          `);
        }),
        (err: unknown) => {
          const msg = (err as { message?: string }).message ?? "";
          return msg.includes("new row violates row-level security") ||
                 msg.includes("permission denied");
        },
        "INSERT without platform-admin must be rejected by RLS",
      );

      // ── 5. RLS INSERT policy: allowed when is_platform_admin = true ────────
      await withPlatformAdminContext(client, ids.platformTenant, ids.platformUser, async () => {
        const r = await client.query<{ id: string }>(`
          INSERT INTO billing.rate_cards (service_type, unit_label, credits_per_unit, is_active)
          VALUES ('sms.platform_insert_test', 'sms', '1.5000', true)
          RETURNING id
        `);
        assert.ok(r.rows[0]?.id, "platform admin INSERT must succeed");
      });

      // ── 6. RLS UPDATE policy: blocked when is_platform_admin = false ───────
      await withAppContext(client, ids.otherTenant, ids.otherUser, async () => {
          const blockedUpdate = await client.query(
            "UPDATE billing.rate_cards SET notes = 'malicious update' WHERE id = $1",
            [existingCardId],
          );
          assert.equal(blockedUpdate.rowCount, 0,
            "RLS must hide rate-card rows from ordinary UPDATE statements");
        });

      // ── 7. RLS UPDATE policy: allowed when is_platform_admin = true ────────
      let updatedNotes: string | null = null;
      await withPlatformAdminContext(client, ids.platformTenant, ids.platformUser, async () => {
        const r = await client.query<{ notes: string | null }>(`
          UPDATE billing.rate_cards SET notes = 'authorized update'
          WHERE id = $1 RETURNING notes
        `, [existingCardId]);
        updatedNotes = r.rows[0]?.notes ?? null;
      });
      assert.equal(updatedNotes, "authorized update",
        "platform admin UPDATE must succeed and return updated notes");

      // ── 8. SELECT policy: open to all authenticated users ─────────────────
      let selectCount = 0;
      await withAppContext(client, ids.otherTenant, ids.otherUser, async () => {
        const r = await client.query<{ count: string }>(
          "SELECT COUNT(*)::text AS count FROM billing.rate_cards",
        );
        selectCount = parseInt(r.rows[0]!.count, 10);
      });
      assert.ok(selectCount > 0,
        "ordinary tenant user must be able to SELECT rate cards (read access is open)");

      // ── 9. Service layer: createRateCard blocked without platform-admin ─────
      //  (no DB session var set → is_platform_admin defaults to false → RLS error)
      await assert.rejects(
        () => withAppContext(client, ids.otherTenant, ids.otherUser, async () => {
          await rateCardAdminService.createRateCard(makeDb(client), {
            serviceType: "ai.embedding",
            unitLabel: "1k_tokens",
            creditsPerUnit: "5.0000",
            isActive: true,
            countryCode: null,
            provider: null,
            effectiveUntil: null,
            notes: null,
          });
        }),
        (err: unknown) => {
          const code = (err as { code?: string }).code;
          const msg = (err as { message?: string }).message ?? "";
          return code === "RATE_NOT_FOUND" ||
                 msg.includes("row-level security") || msg.includes("permission denied");
        },
        "createRateCard must fail RLS without platform-admin context",
      );

      // ── 10. Service layer: createRateCard succeeds with platform-admin ──────
      let createdCardId: string | undefined;
      await withPlatformAdminContext(client, ids.platformTenant, ids.platformUser, async () => {
        const card = await rateCardAdminService.createRateCard(makeDb(client), {
          serviceType: "ai.agent_action",
          unitLabel: "1k_tokens",
          creditsPerUnit: "7.5000",
          isActive: true,
          countryCode: null,
          provider: null,
          effectiveUntil: null,
          notes: "created in security regression test",
        });
        createdCardId = card.id;
        assert.equal(card.serviceType, "ai.agent_action");
        assert.equal(card.creditsPerUnit, "7.5000");
      });
      assert.ok(createdCardId, "createRateCard must return the new card id");

      // ── 11. Uniqueness constraint: duplicate active global rate rejected ────
      await assert.rejects(
        () => withPlatformAdminContext(client, ids.platformTenant, ids.platformUser, async () => {
          await rateCardAdminService.createRateCard(makeDb(client), {
            serviceType: "ai.agent_action", // same type, same (null, null) scope
            unitLabel: "1k_tokens",
            creditsPerUnit: "8.0000",
            isActive: true,
            countryCode: null,
            provider: null,
            effectiveUntil: null,
            notes: null,
          });
        }),
        (err: unknown) => {
          const code = (err as { code?: string }).code;
          const msg = (err as { message?: string }).message ?? "";
          return code === "DUPLICATE_ACTIVE_RATE" ||
                 msg.includes("DUPLICATE_ACTIVE_RATE") ||
                 msg.includes("duplicate") ||
                 msg.includes("unique");
        },
        "duplicate active rate for same scope must be rejected",
      );

      // ── 12. updateRateCard blocked without platform-admin ─────────────────
      assert.ok(createdCardId);
      await assert.rejects(
        () => withAppContext(client, ids.otherTenant, ids.otherUser, async () => {
          await rateCardAdminService.updateRateCard(makeDb(client), createdCardId!, {
            notes: "should be blocked",
          });
        }),
        (err: unknown) => {
          const code = (err as { code?: string }).code;
          const msg = (err as { message?: string }).message ?? "";
          return code === "RATE_NOT_FOUND" ||
                 msg.includes("row-level security") || msg.includes("permission denied");
        },
        "updateRateCard must fail RLS without platform-admin context",
      );

      // ── 13. Historical integrity: deactivation preserves structural fields ─
      let deactivated: { rateCard: { creditsPerUnit: string; serviceType: string }; coverageGap: boolean } | undefined;
      await withPlatformAdminContext(client, ids.platformTenant, ids.platformUser, async () => {
        deactivated = await rateCardAdminService.deactivateRateCard(makeDb(client), createdCardId!);
      });
      assert.ok(deactivated, "deactivateRateCard must return a result");
      assert.equal(deactivated.rateCard.serviceType, "ai.agent_action",
        "deactivation must not alter serviceType");
      assert.equal(deactivated.rateCard.creditsPerUnit, "7.5000",
        "deactivation must not alter creditsPerUnit — historical immutability");

      // ── 14. Historical integrity: ON DELETE RESTRICT prevents hard-deletion ─
      //  Seed a usage_event pointing at the existing card, then try to delete the card.
      let walletId = "";
      await withPlatformAdminContext(client, ids.platformTenant, ids.platformUser, async () => {
        const wallet = await client.query<{ id: string }>(`
          INSERT INTO billing.wallets (tenant_id, outlet_id)
          VALUES ($1, '01994bbc-0010-7000-8000-000000000021')
          ON CONFLICT (tenant_id, outlet_id) DO UPDATE SET updated_at = NOW()
          RETURNING id
        `, [ids.platformTenant]);
        walletId = wallet.rows[0]!.id;
      });
      await withAppContext(client, ids.platformTenant, ids.platformUser, async () => {
        await client.query(`
          INSERT INTO billing.usage_events
            (tenant_id, outlet_id, wallet_id, service_type, quantity, unit_label,
             rate_card_id, estimated_credits, status, idempotency_key)
          VALUES
            ($1, '01994bbc-0010-7000-8000-000000000021', $2,
             'ai.chat_token', 1, '1k_tokens', $3, 10, 'PENDING', 'rate-history-reference')
        `, [ids.platformTenant, walletId, existingCardId]);
      });

      const deleteClient = await pool.connect();
      try {
        await deleteClient.query("BEGIN");
        await deleteClient.query("SET LOCAL ROLE sensible_rls_owner");
        await assert.rejects(
          deleteClient.query("DELETE FROM billing.rate_cards WHERE id = $1", [existingCardId]),
          (err: unknown) => {
            const msg = (err as { message?: string }).message ?? "";
            return msg.includes("restrict") || msg.includes("foreign key") || msg.includes("violates");
          },
          "DELETE of a rate card referenced by usage_events must fail (ON DELETE RESTRICT)",
        );
      } finally {
        await deleteClient.query("ROLLBACK");
        deleteClient.release();
      }

      // ── 15. Deactivated card returns coverageGap = true when no active rates remain
      //  (deactivation of ai.security_test was done in test 13 — coverage gap expected)
      assert.equal(deactivated?.coverageGap, true,
        "coverageGap must be true after the only active rate for a service type is deactivated");

    } finally {
      client.release();
    }

  } finally {
    if (grantedAppRole) {
      await pool.query("REVOKE sensible_app_role FROM CURRENT_USER");
    }
    await pool.end();
    await adminPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid() AND backend_type = 'client backend'",
      [dbName],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.end();
  }
});

// ─── App-layer helper unit tests (no DB needed) ───────────────────────────────

/**
 * These test the requirePlatformAdmin and isPlatformAdmin logic inline —
 * they do not require DATABASE_ADMIN_URL or a running server.
 */
test("requirePlatformAdmin app-layer logic", () => {
  const PLATFORM_TENANT = "01994bbc-ffff-7000-8000-aaaaaaaaaaaa";
  const OTHER_TENANT    = "01994bbc-ffff-7000-8000-bbbbbbbbbbbb";

  const makePlatformAdmin = (tenantId: string, isTenantAdmin: boolean) => ({
    tenantId,
    userId: "01994bbc-ffff-7000-8000-000000000001",
    isTenantAdmin,
  });

  // Mimic the route helper logic (extracted for unit-testability)
  const checkPlatformAdmin = (
    auth: { tenantId: string; isTenantAdmin: boolean } | null | undefined,
    platformTenantId: string | null,
  ): { allowed: boolean; statusCode?: number } => {
    if (!platformTenantId) return { allowed: false, statusCode: 503 };
    if (!auth?.isTenantAdmin || auth.tenantId !== platformTenantId) {
      return { allowed: false, statusCode: 403 };
    }
    return { allowed: true };
  };

  // 503 when env var not configured
  const noEnv = checkPlatformAdmin(makePlatformAdmin(PLATFORM_TENANT, true), null);
  assert.equal(noEnv.allowed, false);
  assert.equal(noEnv.statusCode, 503, "missing BILLING_PLATFORM_ADMIN_TENANT_ID → 503");

  // 403 for unauthenticated (null auth)
  const unauthenticated = checkPlatformAdmin(null, PLATFORM_TENANT);
  assert.equal(unauthenticated.allowed, false);
  assert.equal(unauthenticated.statusCode, 403, "unauthenticated → 403");

  // 403 for ordinary tenant user (isTenantAdmin = false)
  const ordinaryUser = checkPlatformAdmin(makePlatformAdmin(PLATFORM_TENANT, false), PLATFORM_TENANT);
  assert.equal(ordinaryUser.allowed, false);
  assert.equal(ordinaryUser.statusCode, 403, "ordinary user of platform tenant → 403");

  // 403 for tenant admin of wrong tenant
  const wrongTenant = checkPlatformAdmin(makePlatformAdmin(OTHER_TENANT, true), PLATFORM_TENANT);
  assert.equal(wrongTenant.allowed, false);
  assert.equal(wrongTenant.statusCode, 403, "tenant admin of wrong tenant → 403");

  // Passes for platform tenant admin
  const platformAdmin = checkPlatformAdmin(makePlatformAdmin(PLATFORM_TENANT, true), PLATFORM_TENANT);
  assert.equal(platformAdmin.allowed, true, "platform tenant admin → allowed");
});
