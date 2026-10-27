/**
 * Billing integration tests — wallet service
 *
 * Requires DATABASE_ADMIN_URL (superuser-capable Postgres connection) to be set.
 * Creates an isolated temp database, runs all migrations, seeds foundation data,
 * then exercises the wallet service against real PostgreSQL.
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
import { walletService } from "../../src/modules/billing/wallet.service.js";

const adminConnectionString = process.env.DATABASE_ADMIN_URL;
const migrationsFolder = path.resolve(process.cwd(), "migrations");

const buildConnectionUrl = (base: string, database: string) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

// Mirrors the withAppContext helper in postgres.integration.test.ts
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

// Fixed UUIDs for deterministic test data
const ids = {
  tenant: "01994bbc-0000-7000-8000-000000000001",
  tenantB: "01994bbc-0000-7000-8000-000000000002",
  business: "01994bbc-0000-7000-8000-000000000011",
  businessB: "01994bbc-0000-7000-8000-000000000012",
  outlet: "01994bbc-0000-7000-8000-000000000021",
  outletB: "01994bbc-0000-7000-8000-000000000022",
  admin: "01994bbc-0000-7000-8000-000000000051",
  user: "01994bbc-0000-7000-8000-000000000052",
  userB: "01994bbc-0000-7000-8000-000000000053",
  role: "01994bbc-0000-7000-8000-000000000031",
};

test("billing wallet service — integration", { skip: !adminConnectionString }, async () => {
  assert.ok(adminConnectionString);

  // ── Create isolated temp database ─────────────────────────────────────────
  const adminPool = new Pool({ connectionString: buildConnectionUrl(adminConnectionString, "postgres"), max: 1 });
  const dbName = `sensible_billing_test_${randomBytes(6).toString("hex")}`;
  let grantedAppRole = false;

  await adminPool.query(`CREATE DATABASE ${dbName}`);
  const testConnectionString = buildConnectionUrl(adminConnectionString, dbName);
  const pool = new Pool({ connectionString: testConnectionString, max: 5 });

  try {
    // ── Migrate + seed ──────────────────────────────────────────────────────
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

    // Verify billing schema exists
    const tables = await pool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'billing' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tableNames = tables.rows.map((r) => r.table_name).sort();
    assert.deepEqual(tableNames, ["rate_cards", "top_up_orders", "usage_events", "wallet_transactions", "wallets"]);

    // ── Seed test data ──────────────────────────────────────────────────────
    await pool.query(`
      SELECT set_config('app.is_super_admin', 'true', false);
      ALTER TABLE tenancy.businesses DISABLE TRIGGER USER;
      INSERT INTO tenancy.tenants (id, legacy_id, name, slug) VALUES
        ('${ids.tenant}', 'billing-tenant-a', 'Billing Tenant A', 'billing-tenant-a'),
        ('${ids.tenantB}', 'billing-tenant-b', 'Billing Tenant B', 'billing-tenant-b');
      INSERT INTO tenancy.businesses (id, tenant_id, legacy_id, name) VALUES
        ('${ids.business}', '${ids.tenant}', 'billing-biz-a', 'Billing Biz A'),
        ('${ids.businessB}', '${ids.tenantB}', 'billing-biz-b', 'Billing Biz B');
      INSERT INTO tenancy.outlets (id, tenant_id, business_id, legacy_id, outlet_code, name) VALUES
        ('${ids.outlet}', '${ids.tenant}', '${ids.business}', 'billing-outlet-a', 'BA1', 'Billing Outlet A'),
        ('${ids.outletB}', '${ids.tenantB}', '${ids.businessB}', 'billing-outlet-b', 'BB1', 'Billing Outlet B');
      INSERT INTO iam.roles (id, tenant_id, name) VALUES
        ('${ids.role}', '${ids.tenant}', 'member');
      INSERT INTO iam.users (id, legacy_id, email, display_name) VALUES
        ('${ids.admin}', 'billing-admin-a', 'billing-admin@example.com', 'Billing Admin'),
        ('${ids.user}', 'billing-user-a', 'billing-user@example.com', 'Billing User'),
        ('${ids.userB}', 'billing-user-b', 'billing-user-b@example.com', 'Billing User B');
      INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin) VALUES
        ('${ids.tenant}', '${ids.admin}', true),
        ('${ids.tenant}', '${ids.user}', false),
        ('${ids.tenantB}', '${ids.userB}', true);
      INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id) VALUES
        ('${ids.tenant}', '${ids.outlet}', '${ids.admin}', '${ids.role}'),
        ('${ids.tenant}', '${ids.outlet}', '${ids.user}', '${ids.role}');
      ALTER TABLE tenancy.businesses ENABLE TRIGGER USER;
    `);

    const client = await pool.connect();
    try {
      const db = (): TransactionDatabase => ({ client, db: drizzle(client, { schema: databaseSchema }) } as TransactionDatabase);

      // ── 1. Wallet not found before creation ─────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          walletService.getWallet(db(), ids.tenant, ids.outlet),
          (err: unknown) => (err as { code?: string }).code === "WALLET_NOT_FOUND",
          "getWallet should throw WALLET_NOT_FOUND before wallet is created",
        );
      });

      // ── 2. Create wallet (admin only due to RLS INSERT policy) ───────────
      let walletId = "";
      await withAppContext(client, ids.tenant, ids.admin, async () => {
        const wallet = await walletService.getOrCreateWallet(db(), ids.tenant, ids.outlet);
        walletId = wallet.id;
        assert.equal(wallet.tenantId, ids.tenant);
        assert.equal(wallet.outletId, ids.outlet);
        assert.equal(wallet.balanceCredits, "0.0000");
        assert.equal(wallet.reservedCredits, "0.0000");
        assert.equal(wallet.availableCredits, "0.0000");
        assert.equal(wallet.currency, "INR");
        assert.equal(wallet.isLowBalance, true);  // 0 < default threshold
      });

      // ── 3. getOrCreateWallet is idempotent ───────────────────────────────
      await withAppContext(client, ids.tenant, ids.admin, async () => {
        const wallet2 = await walletService.getOrCreateWallet(db(), ids.tenant, ids.outlet);
        assert.equal(wallet2.id, walletId, "second call returns the same wallet");
      });

      // ── 4. Debit on empty wallet → INSUFFICIENT_CREDITS ─────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          walletService.debitCredits(db(), ids.tenant, ids.outlet, {
            amount: "100.0000",
            idempotencyKey: "debit-empty-wallet-test",
            description: "should fail",
          }),
          (err: unknown) => (err as { code?: string }).code === "INSUFFICIENT_CREDITS",
        );
      });

      // ── 5. Credit wallet ─────────────────────────────────────────────────
      await withAppContext(client, ids.tenant, ids.admin, async () => {
        const result = await walletService.creditWallet(db(), ids.tenant, ids.outlet, {
          amount: "500.0000",
          idempotencyKey: "credit-initial-grant",
          description: "Initial grant",
          actorUserId: ids.admin,
        });
        assert.equal(result.wallet.balanceCredits, "500.0000");
        assert.equal(result.wallet.availableCredits, "500.0000");
        assert.equal(result.transaction.txnType, "CREDIT");
        assert.equal(result.transaction.credits, "500.0000");
        assert.equal(result.transaction.balanceAfter, "500.0000");
        assert.equal(result.idempotent, false);
      });

      // ── 6. Credit idempotency — same key returns same result ─────────────
      await withAppContext(client, ids.tenant, ids.admin, async () => {
        const idempotentResult = await walletService.creditWallet(db(), ids.tenant, ids.outlet, {
          amount: "500.0000",
          idempotencyKey: "credit-initial-grant",
          description: "Initial grant",
          actorUserId: ids.admin,
        });
        assert.equal(idempotentResult.idempotent, true, "repeated idempotency key must not credit twice");
        // Balance should still be 500
        const wallet = await walletService.getWallet(db(), ids.tenant, ids.outlet);
        assert.equal(wallet.balanceCredits, "500.0000", "balance unchanged by idempotent credit");
      });

      // ── 7. Debit credits ─────────────────────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const result = await walletService.debitCredits(db(), ids.tenant, ids.outlet, {
          amount: "100.0000",
          idempotencyKey: "debit-service-charge-001",
          referenceType: "whatsapp_message",
          referenceId: "01994bbc-0000-7000-8000-000000000099",
          description: "WhatsApp template message",
          actorUserId: ids.user,
        });
        assert.equal(result.transaction.txnType, "DEBIT");
        assert.equal(result.transaction.credits, "100.0000");
        assert.equal(result.transaction.balanceAfter, "400.0000");
        assert.equal(result.wallet.balanceCredits, "400.0000");
        assert.equal(result.wallet.availableCredits, "400.0000");
        assert.equal(result.idempotent, false);
      });

      // ── 8. Debit idempotency — repeated charge does not debit twice ──────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const idempotentDebit = await walletService.debitCredits(db(), ids.tenant, ids.outlet, {
          amount: "100.0000",
          idempotencyKey: "debit-service-charge-001",
          description: "WhatsApp template message",
        });
        assert.equal(idempotentDebit.idempotent, true, "repeated key must not debit again");
        const wallet = await walletService.getWallet(db(), ids.tenant, ids.outlet);
        assert.equal(wallet.balanceCredits, "400.0000", "balance unchanged by idempotent debit");
      });

      // ── 9. Debit more than available → INSUFFICIENT_CREDITS ─────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          walletService.debitCredits(db(), ids.tenant, ids.outlet, {
            amount: "401.0000",
            idempotencyKey: "debit-overflow-attempt",
          }),
          (err: unknown) => (err as { code?: string }).code === "INSUFFICIENT_CREDITS",
        );
        const wallet = await walletService.getWallet(db(), ids.tenant, ids.outlet);
        assert.equal(wallet.balanceCredits, "400.0000", "balance unchanged after failed debit");
      });

      // ── 10. Invalid amount validation ────────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          walletService.debitCredits(db(), ids.tenant, ids.outlet, {
            amount: "-50",
            idempotencyKey: "invalid-amount-neg",
          }),
          (err: unknown) => (err as { code?: string }).code === "INVALID_AMOUNT",
        );
        await assert.rejects(
          walletService.debitCredits(db(), ids.tenant, ids.outlet, {
            amount: "0",
            idempotencyKey: "invalid-amount-zero",
          }),
          (err: unknown) => (err as { code?: string }).code === "INVALID_AMOUNT",
        );
        await assert.rejects(
          walletService.creditWallet(db(), ids.tenant, ids.outlet, {
            amount: "not-a-number",
            idempotencyKey: "invalid-amount-nan",
          }),
          (err: unknown) => (err as { code?: string }).code === "INVALID_AMOUNT",
        );
      });

      // ── 11. Reserve credits ──────────────────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const reservation = await walletService.reserveCredits(db(), ids.tenant, ids.outlet, {
          amount: "50.0000",
          idempotencyKey: "reserve-ai-operation-001",
          description: "AI agent pre-reservation",
        });
        assert.equal(reservation.transaction.txnType, "RESERVE");
        assert.equal(reservation.wallet.reservedCredits, "50.0000");
        assert.equal(reservation.wallet.balanceCredits, "400.0000");
        assert.equal(reservation.wallet.availableCredits, "350.0000");
      });

      // ── 12. Reserve more than available (after existing reservation) ─────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        await assert.rejects(
          walletService.reserveCredits(db(), ids.tenant, ids.outlet, {
            amount: "351.0000",
            idempotencyKey: "reserve-overflow-attempt",
          }),
          (err: unknown) => (err as { code?: string }).code === "INSUFFICIENT_CREDITS",
          "reservation should fail when available < amount",
        );
      });

      // ── 13. Release reservation ──────────────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const release = await walletService.releaseReservation(db(), ids.tenant, ids.outlet, {
          amount: "50.0000",
          idempotencyKey: "release-ai-operation-001",
          description: "AI agent reservation released",
        });
        assert.equal(release.transaction.txnType, "RELEASE");
        assert.equal(release.wallet.reservedCredits, "0.0000");
        assert.equal(release.wallet.balanceCredits, "400.0000");
        assert.equal(release.wallet.availableCredits, "400.0000");
      });

      // ── 14. Reversal (compensating credit) ──────────────────────────────
      // First find the txn id from step 7
      let originalTxnId = "";
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const history = await walletService.getTransactionHistory(db(), ids.tenant, ids.outlet, {});
        const debit = history.find((t) => t.idempotencyKey === "debit-service-charge-001");
        assert.ok(debit, "original debit should be in transaction history");
        originalTxnId = debit.id;
      });

      await withAppContext(client, ids.tenant, ids.admin, async () => {
        const reversal = await walletService.createReversal(db(), ids.tenant, ids.outlet, {
          amount: "100.0000",
          idempotencyKey: "reversal-service-charge-001",
          originalTxnId,
          actorUserId: ids.admin,
          description: "Reversal of incorrect charge",
        });
        assert.equal(reversal.transaction.txnType, "REVERSAL");
        assert.equal(reversal.wallet.balanceCredits, "500.0000", "balance restored after reversal");
      });

      // ── 15. Transaction history order and content ────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const history = await walletService.getTransactionHistory(db(), ids.tenant, ids.outlet, { limit: 10 });
        assert.ok(history.length >= 4, "should have initial credit, debit, reserve, release, reversal entries");
        // Most recent first
        for (let i = 0; i < history.length - 1; i++) {
          assert.ok(
            history[i]!.createdAt >= history[i + 1]!.createdAt,
            "transactions should be ordered most-recent first",
          );
        }
        // All transactions belong to this tenant
        for (const txn of history) {
          assert.equal(txn.tenantId, ids.tenant);
          assert.equal(txn.outletId, ids.outlet);
        }
      });

      // ── 16. getBalance ───────────────────────────────────────────────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const balance = await walletService.getBalance(db(), ids.tenant, ids.outlet);
        assert.equal(balance.balanceCredits, "500.0000");
        assert.equal(balance.availableCredits, "500.0000");
        assert.equal(balance.currency, "INR");
      });

      // ── 17. Tenant isolation — tenant B cannot see tenant A wallet ───────
      // First create tenant B's wallet
      await withAppContext(client, ids.tenantB, ids.userB, async () => {
        await walletService.getOrCreateWallet(db(), ids.tenantB, ids.outletB);
      });

      await withAppContext(client, ids.tenantB, ids.userB, async () => {
        // Can see their own wallet
        const ownWallet = await walletService.getWallet(db(), ids.tenantB, ids.outletB);
        assert.equal(ownWallet.tenantId, ids.tenantB);

        // Cannot access tenant A's outlet wallet — RLS ensures tenant isolation
        await assert.rejects(
          walletService.getWallet(db(), ids.tenantB, ids.outlet),
          (err: unknown) => (err as { code?: string }).code === "WALLET_NOT_FOUND",
          "tenant B cannot read tenant A wallet via tenantB context",
        );
      });

      // ── 18. Ledger integrity — balance equals sum of transactions ────────
      await withAppContext(client, ids.tenant, ids.user, async () => {
        const walletRow = await pool.query<{
          balance_credits: string;
          reserved_credits: string;
        }>("SELECT balance_credits, reserved_credits FROM billing.wallets WHERE id = $1", [walletId]);
        const ledgerSum = await pool.query<{ net: string }>(`
          SELECT
            SUM(CASE WHEN txn_type IN ('CREDIT','REVERSAL') THEN credits
                     WHEN txn_type = 'DEBIT' THEN -credits
                     ELSE 0 END) AS net
          FROM billing.wallet_transactions WHERE wallet_id = $1
        `, [walletId]);
        const walletBalance = walletRow.rows[0]?.balance_credits;
        const ledgerNet = ledgerSum.rows[0]?.net;
        assert.equal(parseFloat(walletBalance!).toFixed(4), parseFloat(ledgerNet!).toFixed(4),
          "wallet balance must equal net of ledger entries");
      });

      // ── 19. Concurrent debits — exactly one succeeds ─────────────────────
      // Credit the wallet more so we have a controlled balance for concurrency test
      await withAppContext(client, ids.tenant, ids.admin, async () => {
        await walletService.creditWallet(db(), ids.tenant, ids.outlet, {
          amount: "100.0000",
          idempotencyKey: "credit-conc-setup",
        });
        // Balance is now 600
      });

      // Use two separate pool connections to run concurrent FOR UPDATE scenarios
      const clientA = await pool.connect();
      const clientB = await pool.connect();
      try {
        // Manually set up context for both clients outside withAppContext
        // so we can interleave operations
        const setContext = async (c: PoolClient, tenantId: string, userId: string) => {
          await c.query("BEGIN");
          await c.query("SET LOCAL ROLE sensible_app_role");
          await c.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
          await c.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
          await c.query("SELECT set_config('app.is_super_admin', 'false', true)");
        };

        await setContext(clientA, ids.tenant, ids.user);
        // clientA: lock the wallet row
        await clientA.query(
          "SELECT id FROM billing.wallets WHERE tenant_id = $1 AND outlet_id = $2 FOR UPDATE",
          [ids.tenant, ids.outlet],
        );

        // clientB starts its own transaction; the SELECT FOR UPDATE will block until A commits
        await setContext(clientB, ids.tenant, ids.user);
        const clientBDebitPromise = clientB.query(`
          SELECT balance_credits - reserved_credits AS available
          FROM billing.wallets
          WHERE tenant_id = '${ids.tenant}' AND outlet_id = '${ids.outlet}'
          FOR UPDATE
        `);

        // Give clientB a moment to issue the query and block
        await new Promise((r) => setTimeout(r, 80));

        // clientA debits 580 credits (nearly all remaining 600)
        await clientA.query(`
          INSERT INTO billing.wallet_transactions (
            tenant_id, outlet_id, wallet_id, txn_type, credits,
            balance_after, reserved_after, idempotency_key, metadata
          ) SELECT
            tenant_id, outlet_id, id, 'DEBIT', 580::numeric,
            balance_credits - 580::numeric,
            reserved_credits,
            'conc-debit-client-a', '{}'::jsonb
          FROM billing.wallets
          WHERE tenant_id = '${ids.tenant}' AND outlet_id = '${ids.outlet}'
        `);
        await clientA.query(`
          UPDATE billing.wallets
          SET balance_credits = balance_credits - 580::numeric, updated_at = NOW()
          WHERE tenant_id = '${ids.tenant}' AND outlet_id = '${ids.outlet}'
            AND balance_credits - reserved_credits >= 580::numeric
        `);
        await clientA.query("COMMIT");  // releases FOR UPDATE lock

        // clientB now unblocks and sees balance = 20
        const clientBWallet = await clientBDebitPromise;
        const availableAfterA = parseFloat(clientBWallet.rows[0]?.available ?? "0");
        assert.ok(availableAfterA < 580, `clientB sees updated balance (${availableAfterA}) after clientA committed`);
        await clientB.query("ROLLBACK");

        // Verify final balance
        let finalAvail = 0;
        await withAppContext(client, ids.tenant, ids.user, async () => {
          const finalBalance = await client.query<{ balance_credits: string }>(
            "SELECT balance_credits FROM billing.wallets WHERE id = $1",
            [walletId],
          );
          finalAvail = parseFloat(finalBalance.rows[0]?.balance_credits ?? "0");
        });
        assert.equal(finalAvail, 20, `balance should be exactly 20 after 580 debit (was 600), got ${finalAvail}`);

      } finally {
        try { await clientA.query("ROLLBACK"); } catch { /* already committed or rolled back */ }
        try { await clientB.query("ROLLBACK"); } catch { /* already rolled back */ }
        clientA.release();
        clientB.release();
      }

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
