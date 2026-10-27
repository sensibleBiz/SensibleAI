/**
 * Usage metering integration tests — Phase 5
 *
 * Requires DATABASE_ADMIN_URL. Creates an isolated temp database, runs all
 * migrations, seeds foundation + rate cards + a pre-funded wallet, then
 * exercises usageService.meterUsage against real PostgreSQL.
 *
 * Rate cards and wallet credits are seeded via the admin pool (the app role
 * does not have INSERT on rate_cards; wallets require is_tenant_admin).
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
import { usageService } from "../../src/modules/billing/usage.service.js";
import { walletService } from "../../src/modules/billing/wallet.service.js";

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
  tenant: "01994bbc-0002-7000-8000-000000000001",
  tenantB: "01994bbc-0002-7000-8000-000000000002",
  business: "01994bbc-0002-7000-8000-000000000011",
  businessB: "01994bbc-0002-7000-8000-000000000012",
  outlet: "01994bbc-0002-7000-8000-000000000021",
  outletB: "01994bbc-0002-7000-8000-000000000022",
  admin: "01994bbc-0002-7000-8000-000000000051",
  user: "01994bbc-0002-7000-8000-000000000052",
  userB: "01994bbc-0002-7000-8000-000000000053",
  role: "01994bbc-0002-7000-8000-000000000031",
};

const key = (suffix: string) => `test-usage-${suffix}-${randomBytes(4).toString("hex")}`;

test("usage metering service — integration", { skip: !adminConnectionString }, async () => {
  assert.ok(adminConnectionString);

  const adminPool = new Pool({ connectionString: buildConnectionUrl(adminConnectionString, "postgres"), max: 1 });
  const dbName = `sensible_usage_test_${randomBytes(6).toString("hex")}`;
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

    // Seed rate cards (admin pool — app role SELECT only)
    await pool.query(`
      SELECT set_config('app.is_platform_admin', 'true', false);
      INSERT INTO billing.rate_cards
        (service_type, country_code, provider, unit_label, credits_per_unit, is_active, effective_from)
      VALUES
        ('whatsapp.service',  'IN', NULL,   'message',    2.0000, true, NOW() - INTERVAL '1 day'),
        ('email.ses',         NULL, 'aws',  'email',      0.2500, true, NOW() - INTERVAL '1 day'),
        ('email.ses',         NULL, NULL,   'email',      0.5000, true, NOW() - INTERVAL '1 day'),
        ('ai.agent_action',   NULL, NULL,   'action',     5.0000, true, NOW() - INTERVAL '1 day')
    `);

    // Seed tenants, outlets, users
    await pool.query(`
      SELECT set_config('app.is_super_admin', 'true', false);
      ALTER TABLE tenancy.businesses DISABLE TRIGGER USER;
      INSERT INTO tenancy.tenants(id, legacy_id, name, slug) VALUES
        ('${ids.tenant}',  'usage-tenant-a', 'Usage Tenant A', 'usage-tenant-a'),
        ('${ids.tenantB}', 'usage-tenant-b', 'Usage Tenant B', 'usage-tenant-b');
      INSERT INTO tenancy.businesses(id, tenant_id, legacy_id, name) VALUES
        ('${ids.business}',  '${ids.tenant}',  'usage-biz-a', 'Biz A'),
        ('${ids.businessB}', '${ids.tenantB}', 'usage-biz-b', 'Biz B');
      INSERT INTO tenancy.outlets(id, tenant_id, business_id, legacy_id, outlet_code, name) VALUES
        ('${ids.outlet}',  '${ids.tenant}',  '${ids.business}',  'usage-outlet-a', 'UA1', 'Usage Outlet A'),
        ('${ids.outletB}', '${ids.tenantB}', '${ids.businessB}', 'usage-outlet-b', 'UB1', 'Usage Outlet B');
      INSERT INTO iam.roles(id, tenant_id, name) VALUES ('${ids.role}', '${ids.tenant}', 'member');
      INSERT INTO iam.users(id, legacy_id, email, display_name) VALUES
        ('${ids.admin}',  'usage-admin-a', 'usage-admin@example.com', 'Usage Admin'),
        ('${ids.user}',   'usage-user-a',  'usage-user@example.com',  'Usage User'),
        ('${ids.userB}',  'usage-user-b',  'usage-user-b@example.com','Usage User B');
      INSERT INTO tenancy.tenant_memberships(tenant_id, user_id, is_tenant_admin) VALUES
        ('${ids.tenant}',  '${ids.admin}', true),
        ('${ids.tenant}',  '${ids.user}',  false),
        ('${ids.tenantB}', '${ids.userB}', true);
      INSERT INTO tenancy.outlet_assignments(tenant_id, outlet_id, user_id, role_id) VALUES
        ('${ids.tenant}', '${ids.outlet}', '${ids.admin}', '${ids.role}'),
        ('${ids.tenant}', '${ids.outlet}', '${ids.user}',  '${ids.role}');
      ALTER TABLE tenancy.businesses ENABLE TRIGGER USER;
    `);

    const client = await pool.connect();
    let walletId = "";

    try {
      const db = (): TransactionDatabase => ({
        client,
        db: drizzle(client, { schema: databaseSchema }),
      } as TransactionDatabase);

      // ── Setup: create and fund wallet (admin only due to RLS) ─────────────
      await withAppContext(client, ids.tenant, ids.admin, async () => {
        const wallet = await walletService.getOrCreateWallet(db(), ids.tenant, ids.outlet);
        walletId = wallet.id;
        await walletService.creditWallet(db(), ids.tenant, ids.outlet, {
          amount: "1000.0000",
          idempotencyKey: "usage-test-initial-grant",
          description: "Test grant",
        });
      });

      // ── 1. Successful metering — ai.agent_action ─────────────────────────
      const key1 = key("ai-basic");
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await usageService.meterUsage(db(), {
          tenantId: ids.tenant,
          outletId: ids.outlet,
          serviceType: "ai.agent_action",
          quantity: "1.0000",
          idempotencyKey: key1,
          actorUserId: ids.user,
        });
        assert.equal(result.billedCredits, "5.0000", "ai.agent_action should cost 5 credits");
        assert.equal(result.idempotent, false);
        assert.ok(result.walletTxnId, "wallet_txn_id must be set on billed event");
        assert.equal(result.usageEvent.status, "BILLED");
        assert.equal(result.usageEvent.walletTxnId, result.walletTxnId);
      });

      // ── 2. Wallet balance reduced correctly ───────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const bal = await walletService.getBalance(db(), ids.tenant, ids.outlet);
        assert.equal(bal.balanceCredits, "995.0000", "balance should be 1000 - 5 = 995");
      });

      // ── 3. Usage event and wallet ledger are coherent ────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const ledger = await client.query<{ usage_credits: string; wallet_credits: string }>(`
          SELECT ue.billed_credits AS usage_credits, wt.credits AS wallet_credits
          FROM billing.usage_events ue
          JOIN billing.wallet_transactions wt ON wt.id = ue.wallet_txn_id::uuid
          WHERE ue.tenant_id = $1 AND ue.idempotency_key = $2
        `, [ids.tenant, key1]);
        assert.ok(ledger.rows[0], "should find linked usage_event + wallet_transaction");
        assert.equal(ledger.rows[0]?.usage_credits, "5.0000");
        assert.equal(ledger.rows[0]?.wallet_credits, "5.0000");
      });

      // ── 4. Idempotency — same key never charges twice ─────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const idempotent = await usageService.meterUsage(db(), {
          tenantId: ids.tenant,
          outletId: ids.outlet,
          serviceType: "ai.agent_action",
          quantity: "1.0000",
          idempotencyKey: key1,   // same key
          actorUserId: ids.user,
        });
        assert.equal(idempotent.idempotent, true, "repeated key should be idempotent");
        const bal = await walletService.getBalance(db(), ids.tenant, ids.outlet);
        assert.equal(bal.balanceCredits, "995.0000", "balance must not change on idempotent replay");
      });

      // ── 5. WhatsApp billing — whatsapp.service rate ───────────────────────
      const key2 = key("wa-message");
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await usageService.meterUsage(db(), {
          tenantId: ids.tenant,
          outletId: ids.outlet,
          serviceType: "whatsapp.service",
          quantity: "1.0000",
          idempotencyKey: key2,
          countryCode: "IN",
          referenceType: "whatsapp_message",
          referenceId: "01994bbc-0002-7000-8000-000000000099",
          providerRef: "msg91-abc-def",
        });
        assert.equal(result.billedCredits, "2.0000");
      });

      // ── 6. Email billing — provider-specific aws rate ─────────────────────
      const key3 = key("email-ses");
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await usageService.meterUsage(db(), {
          tenantId: ids.tenant,
          outletId: ids.outlet,
          serviceType: "email.ses",
          quantity: "1.0000",
          idempotencyKey: key3,
          provider: "aws",
          providerRef: "ses-message-id-0001",
        });
        assert.equal(result.billedCredits, "0.2500", "aws email rate should be 0.25 credits");
        assert.equal(result.usageEvent.providerRef, "ses-message-id-0001");
      });

      // ── 7. Email global fallback rate when provider not specified ─────────
      const key4 = key("email-global");
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await usageService.meterUsage(db(), {
          tenantId: ids.tenant,
          outletId: ids.outlet,
          serviceType: "email.ses",
          quantity: "1.0000",
          idempotencyKey: key4,
          // No provider — should fall back to global email.ses rate (0.5000)
        });
        assert.equal(result.billedCredits, "0.5000", "global email rate should be 0.50 credits");
      });

      // ── 8. Insufficient balance — throws and does not create usage event ──
      // Drain wallet to near zero first
      await withAppContext(client, ids.tenant, ids.admin, async () => {
        const balance = await walletService.getBalance(db(), ids.tenant, ids.outlet);
        const drainAmount = (parseFloat(balance.balanceCredits) - 1).toFixed(4);
        await walletService.debitCredits(db(), ids.tenant, ids.outlet, {
          amount: drainAmount,
          idempotencyKey: key("drain-for-insufficient-test"),
        });
      });

      const keyInsufficient = key("insufficient-check");
      await assert.rejects(
        () => withAppContext(client, ids.tenant, ids.user, async () => {
          await usageService.meterUsage(db(), {
            tenantId: ids.tenant,
            outletId: ids.outlet,
            serviceType: "ai.agent_action",
            quantity: "1.0000",
            idempotencyKey: keyInsufficient,
          });
        }),
        (err: unknown) => (err as { code?: string }).code === "INSUFFICIENT_CREDITS",
        "should throw INSUFFICIENT_CREDITS when balance is too low",
      );

      // Verify no usage_event was persisted for the failed attempt
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const failedEvent = await client.query(
          "SELECT id FROM billing.usage_events WHERE tenant_id=$1 AND idempotency_key=$2",
          [ids.tenant, keyInsufficient],
        );
        assert.equal(failedEvent.rowCount, 0, "no usage_event should persist when INSUFFICIENT_CREDITS causes rollback");
      });

      // ── 9. Wallet not found — throws WALLET_NOT_FOUND ────────────────────
      // Use a tenant B user who has no wallet
      const clientB = await pool.connect();
      try {
        const dbB = (): TransactionDatabase => ({
          client: clientB,
          db: drizzle(clientB, { schema: databaseSchema }),
        } as TransactionDatabase);
        await withAppContext(clientB, ids.tenantB, ids.userB, async () => {
          await assert.rejects(
            usageService.meterUsage(dbB(), {
              tenantId: ids.tenantB,
              outletId: ids.outletB,
              serviceType: "ai.agent_action",
              quantity: "1.0000",
              idempotencyKey: key("no-wallet"),
            }),
            (err: unknown) => (err as { code?: string }).code === "WALLET_NOT_FOUND",
            "should throw WALLET_NOT_FOUND when outlet has no wallet",
          );
        });
      } finally {
        clientB.release();
      }

      // ── 10. Rate not found — throws RATE_NOT_FOUND ────────────────────────
      // Refund wallet before this test
      await withAppContext(client, ids.tenant, ids.admin, async () => {
        await walletService.creditWallet(db(), ids.tenant, ids.outlet, {
          amount: "100.0000",
          idempotencyKey: key("refund-for-rate-test"),
        });
      });

      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          usageService.meterUsage(db(), {
            tenantId: ids.tenant,
            outletId: ids.outlet,
            serviceType: "sms.nonexistent",
            quantity: "1.0000",
            idempotencyKey: key("no-rate"),
          }),
          (err: unknown) => (err as { code?: string }).code === "RATE_NOT_FOUND",
          "unknown service type should throw RATE_NOT_FOUND",
        );
      });

      // ── 11. Atomic rollback — usage_event + wallet debit together ─────────
      // Simulate: insert usage event succeeds, then a constraint violation on
      // wallet_transactions. The outer transaction should roll back both.
      // We test this indirectly: verify that after a failed meterUsage, neither
      // the usage_event NOR the wallet_transaction exists.
      const keyAtomic = key("atomic-rollback");
      let atomicAttemptCount = 0;
      await withAppContext(client, ids.tenant, ids.user, async () => {
        try {
          // Pass an invalid actorUserId to trigger a FK violation mid-transaction
          await usageService.meterUsage(db(), {
            tenantId: ids.tenant,
            outletId: ids.outlet,
            serviceType: "ai.agent_action",
            quantity: "1.0000",
            idempotencyKey: keyAtomic,
            actorUserId: "00000000-0000-7000-8000-000000000099",  // non-existent user
          });
        } catch {
          atomicAttemptCount++;
        }
      }).catch(() => {});  // outer tx may also rollback
      assert.equal(atomicAttemptCount, 1, "the deliberately invalid metering attempt must fail");

      await withAppContext(client, ids.tenant, ids.user, async () => {
        const atomicUsageEvent = await client.query(
          "SELECT id FROM billing.usage_events WHERE tenant_id=$1 AND idempotency_key=$2",
          [ids.tenant, keyAtomic],
        );
        const atomicWalletTxn = await client.query(
          "SELECT id FROM billing.wallet_transactions WHERE wallet_id=$1 AND idempotency_key=$2",
          [walletId, keyAtomic],
        );
        assert.equal(atomicWalletTxn.rowCount, 0, "no wallet transaction should persist after a mid-tx failure");
        assert.equal(atomicUsageEvent.rowCount, 0, "no usage_event should persist after a mid-tx failure");
      });

      // ── 12. Idempotency key reuse with different service type is rejected ─
      const keyReuse = key("reuse-check");
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await usageService.meterUsage(db(), {
          tenantId: ids.tenant,
          outletId: ids.outlet,
          serviceType: "ai.agent_action",
          quantity: "1.0000",
          idempotencyKey: keyReuse,
        });
      });

      // Second call with same key but different service — ON CONFLICT returns
      // the original BILLED event rather than creating a new one. The caller
      // receives idempotent:true. This is the correct behavior: the key space
      // enforces "this key = this event" across all service types.
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const reused = await usageService.meterUsage(db(), {
          tenantId: ids.tenant,
          outletId: ids.outlet,
          serviceType: "email.ses",     // different service type
          quantity: "1.0000",
          idempotencyKey: keyReuse,      // same key
        });
        assert.equal(reused.idempotent, true, "same key with different service returns original event");
        assert.equal(reused.usageEvent.serviceType, "ai.agent_action", "original service type is preserved");
      });

      // ── 13. Cross-tenant isolation ────────────────────────────────────────
      // Create a wallet for tenantB and fund it
      const clientB2 = await pool.connect();
      try {
        const dbB2 = (): TransactionDatabase => ({
          client: clientB2,
          db: drizzle(clientB2, { schema: databaseSchema }),
        } as TransactionDatabase);

        await withAppContext(clientB2, ids.tenantB, ids.userB, async () => {
          await walletService.getOrCreateWallet(dbB2(), ids.tenantB, ids.outletB);
          await walletService.creditWallet(dbB2(), ids.tenantB, ids.outletB, {
            amount: "500.0000",
            idempotencyKey: "tenant-b-initial-grant",
          });
        });

        // Tenant B should only see their own usage events
        await withAppContext(clientB2, ids.tenantB, ids.userB, async () => {
          const result = await usageService.meterUsage(dbB2(), {
            tenantId: ids.tenantB,
            outletId: ids.outletB,
            serviceType: "ai.agent_action",
            quantity: "1.0000",
            idempotencyKey: key("tenant-b-usage"),
          });
          assert.equal(result.usageEvent.tenantId, ids.tenantB, "usage event should belong to tenant B");
        });

        // Tenant A cannot see tenant B's usage events (RLS)
        await withAppContext(clientB2, ids.tenantB, ids.userB, async () => {
          const tenantBQuery = await clientB2.query(
            `SELECT id FROM billing.usage_events WHERE tenant_id = $1`,
            [ids.tenantB],
          );
          assert.ok(tenantBQuery.rowCount! > 0, "tenant B can see its own usage events");
        });

        // Via app role, tenant A cannot see tenant B events
        await withAppContext(client, ids.tenant, ids.user, async () => {
          const appRoleQuery = await db().client.query(
            "SELECT id FROM billing.usage_events WHERE tenant_id = $1",
            [ids.tenantB],
          );
          assert.equal(appRoleQuery.rowCount, 0, "RLS must prevent tenant A seeing tenant B events");
        });
      } finally {
        clientB2.release();
      }

      // ── 14. Input validation ──────────────────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          usageService.meterUsage(db(), {
            tenantId: ids.tenant,
            outletId: ids.outlet,
            serviceType: "ai.agent_action",
            quantity: "0",            // invalid: zero
            idempotencyKey: key("invalid-qty"),
          }),
          (err: unknown) => (err as { code?: string }).code === "INVALID_METER_INPUT",
        );

        await assert.rejects(
          usageService.meterUsage(db(), {
            tenantId: ids.tenant,
            outletId: ids.outlet,
            serviceType: "ai.agent_action",
            quantity: "1.0000",
            idempotencyKey: "short",   // too short (< 8 chars)
          }),
          (err: unknown) => (err as { code?: string }).code === "INVALID_METER_INPUT",
        );
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
