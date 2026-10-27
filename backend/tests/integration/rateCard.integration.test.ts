/**
 * Rate card service integration tests
 *
 * Requires DATABASE_ADMIN_URL to be set.
 * Creates an isolated temp database, runs all migrations, seeds foundation +
 * rate card fixtures, then exercises rateCard.service against real PostgreSQL.
 *
 * Rate cards have no INSERT/UPDATE/DELETE policy for sensible_app_role — all
 * seed inserts use the admin pool directly (bypassing RLS).
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
import { rateCardService } from "../../src/modules/billing/rateCard.service.js";

const adminConnectionString = process.env.DATABASE_ADMIN_URL;
const migrationsFolder = path.resolve(process.cwd(), "migrations");

const buildConnectionUrl = (base: string, database: string) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

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
    const value = await operation();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const ids = {
  tenant: "01994bbc-0001-7000-8000-000000000001",
  business: "01994bbc-0001-7000-8000-000000000011",
  outlet: "01994bbc-0001-7000-8000-000000000021",
  user: "01994bbc-0001-7000-8000-000000000051",
  role: "01994bbc-0001-7000-8000-000000000031",
};

// ─────────────────────────────────────────────────────────────────────────────
// Rate card fixtures
// All inserts go through the admin pool — sensible_app_role has SELECT only.
// ─────────────────────────────────────────────────────────────────────────────
const seedRateCards = async (pool: Pool): Promise<void> => {
  await pool.query(`
    SELECT set_config('app.is_platform_admin', 'true', false);
    INSERT INTO billing.rate_cards
      (service_type, country_code, provider, unit_label, credits_per_unit, is_active, effective_from, effective_until)
    VALUES
      -- WhatsApp: India-specific rates (no provider restriction)
      ('whatsapp.template',       'IN', NULL, 'message', 2.5000, true,  NOW() - INTERVAL '30 days', NULL),
      ('whatsapp.utility',        'IN', NULL, 'message', 1.5000, true,  NOW() - INTERVAL '30 days', NULL),
      ('whatsapp.authentication', 'IN', NULL, 'message', 3.0000, true,  NOW() - INTERVAL '30 days', NULL),
      ('whatsapp.service',        'IN', NULL, 'message', 1.0000, true,  NOW() - INTERVAL '30 days', NULL),
      -- Email: provider-specific (aws) then global fallback
      ('email.ses', NULL, 'aws',  'email',  0.2500, true,  NOW() - INTERVAL '30 days', NULL),
      ('email.ses', NULL,  NULL,  'email',  0.5000, true,  NOW() - INTERVAL '30 days', NULL),
      -- AI services: global defaults
      ('ai.chat_token',   NULL, NULL, '1k_tokens', 10.0000, true,  NOW() - INTERVAL '30 days', NULL),
      ('ai.embedding',    NULL, NULL, '1k_tokens',  2.0000, true,  NOW() - INTERVAL '30 days', NULL),
      ('ai.agent_action', NULL, NULL, 'action',     5.0000, true,  NOW() - INTERVAL '30 days', NULL),
      -- An inactive rate for the inactive-rate test
      ('sms.transactional', NULL, NULL, 'sms', 1.0000, false, NOW() - INTERVAL '60 days', NULL),
      -- An expired rate (effective_until in the past)
      ('sms.transactional', NULL, NULL, 'sms', 0.5000, true,  NOW() - INTERVAL '60 days', NOW() - INTERVAL '1 day')
  `);
};

test("rate card service — integration", { skip: !adminConnectionString }, async () => {
  assert.ok(adminConnectionString);

  const adminPool = new Pool({ connectionString: buildConnectionUrl(adminConnectionString, "postgres"), max: 1 });
  const dbName = `sensible_ratecard_test_${randomBytes(6).toString("hex")}`;
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
    await seedRateCards(pool);

    // Seed minimal tenant hierarchy for RLS session vars
    await pool.query(`
      SELECT set_config('app.is_super_admin', 'true', false);
      ALTER TABLE tenancy.businesses DISABLE TRIGGER USER;
      INSERT INTO tenancy.tenants   (id, legacy_id, name, slug) VALUES ('${ids.tenant}',   'rc-tenant',   'RC Tenant',   'rc-tenant');
      INSERT INTO tenancy.businesses(id, tenant_id, legacy_id, name) VALUES ('${ids.business}', '${ids.tenant}', 'rc-biz', 'RC Biz');
      INSERT INTO tenancy.outlets   (id, tenant_id, business_id, legacy_id, outlet_code, name)
        VALUES ('${ids.outlet}', '${ids.tenant}', '${ids.business}', 'rc-outlet', 'RC1', 'RC Outlet');
      INSERT INTO iam.roles  (id, tenant_id, name) VALUES ('${ids.role}',  '${ids.tenant}', 'member');
      INSERT INTO iam.users  (id, legacy_id, email, display_name) VALUES ('${ids.user}', 'rc-user', 'rc-user@example.com', 'RC User');
      INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin)
        VALUES ('${ids.tenant}', '${ids.user}', true);
      INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id)
        VALUES ('${ids.tenant}', '${ids.outlet}', '${ids.user}', '${ids.role}');
      ALTER TABLE tenancy.businesses ENABLE TRIGGER USER;
    `);

    const client = await pool.connect();
    try {
      const db = (): TransactionDatabase => ({
        client,
        db: drizzle(client, { schema: databaseSchema }),
      } as TransactionDatabase);

      // ── 1. Rate not found — unknown service type ──────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          rateCardService.resolveRate(db(), "unknown.service"),
          (err: unknown) => (err as { code?: string }).code === "RATE_NOT_FOUND",
          "unknown service type should throw RATE_NOT_FOUND",
        );
      });

      // ── 2. Inactive rate is not resolved ─────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          rateCardService.resolveRate(db(), "sms.transactional"),
          (err: unknown) => (err as { code?: string }).code === "RATE_NOT_FOUND",
          "inactive rate should not be resolved",
        );
      });

      // ── 3. Exact global rate — ai.chat_token ─────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const rate = await rateCardService.resolveRate(db(), "ai.chat_token");
        assert.equal(rate.serviceType, "ai.chat_token");
        assert.equal(rate.creditsPerUnit, "10.0000");
        assert.equal(rate.unitLabel, "1k_tokens");
        assert.equal(rate.countryCode, null);
        assert.equal(rate.provider, null);
        assert.equal(rate.isActive, true);
      });

      // ── 4. Country-specific rate — whatsapp.template for IN ──────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const rate = await rateCardService.resolveRate(db(), "whatsapp.template", { countryCode: "IN" });
        assert.equal(rate.countryCode, "IN");
        assert.equal(rate.creditsPerUnit, "2.5000");
      });

      // ── 5. Provider-specific rate — email.ses with aws ────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const rate = await rateCardService.resolveRate(db(), "email.ses", { provider: "aws" });
        assert.equal(rate.provider, "aws");
        assert.equal(rate.creditsPerUnit, "0.2500", "aws-specific email rate should be cheaper");
      });

      // ── 6. Global fallback — email.ses with unknown provider ──────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const rate = await rateCardService.resolveRate(db(), "email.ses", { provider: "sendgrid" });
        assert.equal(rate.provider, null, "should fall back to global email rate");
        assert.equal(rate.creditsPerUnit, "0.5000");
      });

      // ── 7. Country + provider exact match — whatsapp.template IN/meta ────
      //   (no IN+meta specific rate, should fall back to IN+null then global)
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const rate = await rateCardService.resolveRate(db(), "whatsapp.template", {
          countryCode: "IN",
          provider: "meta",
        });
        // Falls back from exact (IN,meta) → country-level (IN,null)
        assert.equal(rate.countryCode, "IN");
        assert.equal(rate.provider, null);
        assert.equal(rate.creditsPerUnit, "2.5000");
      });

      // ── 8. calculateBillingAmount — basic credit arithmetic ───────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await rateCardService.calculateBillingAmount(db(), {
          serviceType: "ai.chat_token",
          quantity: "5.0000",
        });
        assert.equal(result.quantity, "5.0000");
        assert.equal(result.unitLabel, "1k_tokens");
        assert.equal(result.creditsPerUnit, "10.0000");
        // 5 × 10 = 50.0000
        assert.equal(result.calculatedCredits, "50.0000");
      });

      // ── 9. Credit calculation precision — fractional units ────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await rateCardService.calculateBillingAmount(db(), {
          serviceType: "email.ses",
          quantity: "1.0000",
          provider: "aws",
        });
        // 1 × 0.25 = 0.2500
        assert.equal(result.calculatedCredits, "0.2500");
      });

      // ── 10. Fractional quantity × rate precision ──────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await rateCardService.calculateBillingAmount(db(), {
          serviceType: "ai.embedding",
          quantity: "3.0000",
        });
        // 3 × 2.0000 = 6.0000
        assert.equal(result.calculatedCredits, "6.0000");
      });

      // ── 11. Invalid quantity → INVALID_BILLABLE_QUANTITY ─────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          rateCardService.calculateBillingAmount(db(), {
            serviceType: "ai.chat_token",
            quantity: "0",
          }),
          (err: unknown) => (err as { code?: string }).code === "INVALID_BILLABLE_QUANTITY",
          "zero quantity should be invalid",
        );
        await assert.rejects(
          rateCardService.calculateBillingAmount(db(), {
            serviceType: "ai.chat_token",
            quantity: "-1.0000",
          }),
          (err: unknown) => (err as { code?: string }).code === "INVALID_BILLABLE_QUANTITY",
          "negative quantity should be invalid",
        );
        await assert.rejects(
          rateCardService.calculateBillingAmount(db(), {
            serviceType: "ai.chat_token",
            quantity: "not-a-number",
          }),
          (err: unknown) => (err as { code?: string }).code === "INVALID_BILLABLE_QUANTITY",
          "non-numeric quantity should be invalid",
        );
      });

      // ── 12. Invalid service type validation ───────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          rateCardService.resolveRate(db(), ""),
          (err: unknown) => (err as { code?: string }).code === "INVALID_SERVICE_TYPE",
          "empty service type should throw INVALID_SERVICE_TYPE",
        );
      });

      // ── 13. listRates — all active rates ─────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const rates = await rateCardService.listRates(db());
        // All returned rates must be active and currently effective
        for (const r of rates) {
          assert.equal(r.isActive, true, "listRates should return only active rates by default");
          assert.ok(
            r.effectiveUntil === null || r.effectiveUntil > new Date(),
            "listRates should not return expired rates",
          );
        }
        // At minimum the seeded active rates should be present
        const serviceTypes = rates.map((r) => r.serviceType);
        assert.ok(serviceTypes.includes("ai.chat_token"), "ai.chat_token should be in listRates");
        assert.ok(serviceTypes.includes("email.ses"), "email.ses should be in listRates");
        // Inactive sms.transactional should NOT be included
        assert.ok(!rates.some((r) => r.serviceType === "sms.transactional" && !r.isActive));
      });

      // ── 14. listRates — filter by serviceType ────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const rates = await rateCardService.listRates(db(), { serviceType: "email.ses" });
        assert.ok(rates.length >= 2, "should return both aws-specific and global email.ses rates");
        for (const r of rates) {
          assert.equal(r.serviceType, "email.ses");
        }
      });

      // ── 15. listRates — activeOnly: false returns all including inactive ──
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const allRates = await rateCardService.listRates(db(), { activeOnly: false });
        const inactiveRates = allRates.filter((r) => !r.isActive);
        assert.ok(inactiveRates.length > 0, "activeOnly:false should include inactive rates");
      });

      // ── 16. getRateById returns the rate ─────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const all = await rateCardService.listRates(db(), { serviceType: "ai.agent_action" });
        const first = all[0];
        assert.ok(first, "ai.agent_action should exist");

        const byId = await rateCardService.getRateById(db(), first.id);
        assert.equal(byId.id, first.id);
        assert.equal(byId.serviceType, "ai.agent_action");
      });

      // ── 17. getRateById — unknown id throws RATE_NOT_FOUND ────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          rateCardService.getRateById(db(), "01994bbc-ffff-7000-8000-000000000000"),
          (err: unknown) => (err as { code?: string }).code === "RATE_NOT_FOUND",
        );
      });

      // ── 18. No country context → global rate returned ─────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        // whatsapp.template has only IN-specific rate; no global fallback seeded
        await assert.rejects(
          rateCardService.resolveRate(db(), "whatsapp.template"),
          (err: unknown) => (err as { code?: string }).code === "RATE_NOT_FOUND",
          "whatsapp.template without country should fail — no global default seeded",
        );
      });

      // ── 19. calculateBillingAmount returns rateCard.id for Phase 5 ────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await rateCardService.calculateBillingAmount(db(), {
          serviceType: "ai.agent_action",
          quantity: "1.0000",
        });
        assert.ok(typeof result.rateCard.id === "string" && result.rateCard.id.length > 0,
          "rateCard.id must be present for Phase 5 usage_event FK");
        assert.equal(result.rateCard.serviceType, "ai.agent_action");
        // 1 × 5.0000 = 5.0000
        assert.equal(result.calculatedCredits, "5.0000");
        assert.equal(result.unitLabel, "action");
      });

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
