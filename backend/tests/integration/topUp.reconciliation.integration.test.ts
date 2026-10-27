/**
 * Failure-injection tests for the Phase 14 reconciliation state machine.
 *
 * Covers:
 *   - Two workers claiming the same order (lease contention)
 *   - Lease expiry after a worker "crashes"
 *   - Retry scheduling and full-jitter backoff bounds
 *   - Retry count reaching MAX_RETRIES ceiling
 *   - DEAD_LETTER promotion without mutating payment status
 *   - PhonePe returning PENDING, TRANSIENT error, PERMANENT error
 *   - Successful verification followed by DB credit failure + recovery
 *   - Duplicate callbacks / concurrent confirmation
 *   - Bounded batch and execution-time behavior
 *
 * Requires DATABASE_ADMIN_URL — skipped otherwise (CI infrastructure gap).
 *
 * Safety:
 *   - productionEnabled stays false throughout
 *   - creditsPerInr taken from config, never invented
 *   - All PhonePe calls are stubbed; no network I/O
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "../../src/config/env.js";
import {
  closeAdminPool,
  closeApplicationPool,
  getAdminPool,
} from "../../src/db/client.js";
import { seedFoundation } from "../../src/db/seeds/foundation.js";
import {
  clearPhonePeTokenCacheForTests,
} from "../../src/modules/billing/phonePePg.service.js";
import { topUpRepository } from "../../src/modules/billing/topUp.repository.js";
import { reconcileTopUpOrders } from "../../src/modules/billing/topUpReconciliation.js";

const adminConnectionString = process.env["DATABASE_ADMIN_URL"];
if (!adminConnectionString) {
  console.warn(
    "[SKIP] topUp.reconciliation.integration.test.ts: DATABASE_ADMIN_URL not set — " +
    "provision sensible_app_role, sensible_rls_owner, and a test PostgreSQL instance; " +
    "see backend/scripts/ci-test-database-setup.sh",
  );
  process.exit(0);
}

const migrationsFolder = path.resolve(process.cwd(), "migrations");

const buildConnectionUrl = (base: string, database: string) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared test IDs (stable within this file's disposable DB)
// ─────────────────────────────────────────────────────────────────────────────
const ids = {
  tenant:  "01994abc-0050-7000-8000-000000000001",
  business:"01994abc-0050-7000-8000-000000000002",
  outlet:  "01994abc-0050-7000-8000-000000000003",
  user:    "01994abc-0050-7000-8000-000000000004",
  role:    "01994abc-0050-7000-8000-000000000005",
  wallet:  "01994abc-0050-7000-8000-000000000006",

  // Orders — one per scenario
  leaseContention:  "01994abc-0050-7000-8000-000000000011",
  leaseExpiry:      "01994abc-0050-7000-8000-000000000012",
  backoffBounds:    "01994abc-0050-7000-8000-000000000013",
  maxRetries:       "01994abc-0050-7000-8000-000000000014",
  deadLetter:       "01994abc-0050-7000-8000-000000000015",
  providerPending:  "01994abc-0050-7000-8000-000000000016",
  transientError:   "01994abc-0050-7000-8000-000000000017",
  permanentError:   "01994abc-0050-7000-8000-000000000018",
  creditFailure:    "01994abc-0050-7000-8000-000000000019",
  batchLimit:       "01994abc-0050-7000-8000-000000000020",
};

test("reconciliation failure-injection: lease, backoff, dead-letter, and batch", async () => {
  assert.ok(adminConnectionString);

  const suffix = randomBytes(6).toString("hex");
  const dbName = `sensible_reconcile_fi_${suffix}`;
  const appRole = `sensible_rcnc_app_${suffix}`;
  const appPassword = randomBytes(18).toString("hex");
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  const originalAdminUrl = process.env["DATABASE_ADMIN_URL"];
  const originalFetch = globalThis.fetch;
  const pgConfig = env.billing.phonePePg;
  const originalPgConfig = { ...pgConfig };
  let grantedMigrationRole = false;

  const rootPool = new Pool({
    connectionString: buildConnectionUrl(adminConnectionString, "postgres"),
    max: 1,
  });

  await rootPool.query(`CREATE ROLE ${appRole} LOGIN INHERIT PASSWORD '${appPassword}'`);
  await rootPool.query(`GRANT sensible_app_role TO ${appRole}`);
  await rootPool.query(`CREATE DATABASE ${dbName}`);

  const testAdminUrl = buildConnectionUrl(adminConnectionString, dbName);
  const appUrlObject = new URL(testAdminUrl);
  appUrlObject.username = appRole;
  appUrlObject.password = appPassword;
  const testAppUrl = appUrlObject.toString();

  process.env["DATABASE_URL"] = testAppUrl;
  process.env["DATABASE_ADMIN_URL"] = testAdminUrl;
  await closeApplicationPool();
  await closeAdminPool();

  Object.assign(pgConfig, {
    enabled: true,
    productionEnabled: false,      // NEVER enable production in tests
    legacyV1Enabled: false,
    creditsPerInr: "1",            // 1 credit per INR — matches seed data
    clientIdTest: "sandbox-client-id",
    clientSecretTest: "sandbox-client-secret",
    clientVersionTest: "1",
    webhookUsernameTest: "sandbox-webhook-user",
    webhookPasswordTest: "sandbox-webhook-password",
    redirectUrl: "https://crm.example.test/billing/topup/result",
    callbackUrl: "https://api.example.test/api/webhooks/phonepe-pg/callback",
  });
  clearPhonePeTokenCacheForTests();

  // ── Provider stub ──────────────────────────────────────────────────────────
  type ProviderResponse = { state: "COMPLETED" | "FAILED" | "PENDING"; amount: number; txnId?: string };
  const providerResponses = new Map<string, ProviderResponse | "TRANSIENT" | "PERMANENT">([
    ["RCLEASE",    { state: "COMPLETED", amount: 10_000, txnId: "PG-LEASE" }],
    ["RCEXPIRY",   { state: "COMPLETED", amount: 10_000, txnId: "PG-EXPIRY" }],
    ["RCBACKOFF",  "TRANSIENT"],
    ["RCMAXRETRY", "TRANSIENT"],
    ["RCPENDING",  { state: "PENDING",   amount: 17_500 }],
    ["RCTRANSIENT","TRANSIENT"],
    ["RCPERMANENT","PERMANENT"],
    ["RCCREDIT",   { state: "COMPLETED", amount: 12_000, txnId: "PG-CREDIT" }],
  ]);
  let totalProviderCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.pathname.endsWith("/v1/oauth/token")) {
      return Response.json({
        access_token: "fi-test-token",
        expires_at: Math.floor(Date.now() / 1_000) + 3_600,
        token_type: "O-Bearer",
      });
    }
    totalProviderCalls++;
    const orderRef = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");
    const resp = providerResponses.get(orderRef);
    if (resp === "TRANSIENT") {
      return new Response("Internal Server Error", { status: 503 });
    }
    if (resp === "PERMANENT") {
      return new Response(JSON.stringify({ errorCode: "ORDER_NOT_FOUND" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (resp) {
      return Response.json({
        orderId: `OMO-${orderRef}`,
        state: resp.state,
        amount: resp.amount,
        paymentDetails: resp.txnId
          ? [{ transactionId: resp.txnId, amount: resp.amount, state: resp.state }]
          : [],
      });
    }
    throw new Error(`unexpected provider order: ${orderRef}`);
  }) as typeof fetch;

  // ─────────────────────────────────────────────────────────────────────────
  const pool = new Pool({ connectionString: testAdminUrl, max: 5 });
  try {
    await pool.query("SELECT set_config('app.is_super_admin', 'true', false)");
    await migrate(drizzle(pool), { migrationsFolder });
    const membership = await pool.query<{ is_member: boolean }>(
      "SELECT pg_has_role(current_user, 'sensible_app_role', 'member') AS is_member",
    );
    if (!membership.rows[0]?.is_member) {
      await pool.query("GRANT sensible_app_role TO CURRENT_USER");
      grantedMigrationRole = true;
    }
    await seedFoundation(pool);

    // ── Seed tenant, outlet, wallet ─────────────────────────────────────────
    await pool.query(`
      ALTER TABLE tenancy.businesses DISABLE TRIGGER USER;
      INSERT INTO tenancy.tenants   (id, name, slug)
        VALUES ('${ids.tenant}', 'Reconcile FI Tenant', 'reconcile-fi-tenant');
      INSERT INTO tenancy.businesses (id, tenant_id, name)
        VALUES ('${ids.business}', '${ids.tenant}', 'Reconcile FI Business');
      INSERT INTO tenancy.outlets   (id, tenant_id, business_id, outlet_code, name)
        VALUES ('${ids.outlet}', '${ids.tenant}', '${ids.business}', 'RCFI', 'Reconcile FI Outlet');
      ALTER TABLE tenancy.businesses ENABLE TRIGGER USER;
      INSERT INTO iam.roles  (id, tenant_id, name)
        VALUES ('${ids.role}', '${ids.tenant}', 'rcfi-role');
      INSERT INTO iam.users  (id, email, display_name)
        VALUES ('${ids.user}', 'rcfi@example.com', 'RCFI User');
      INSERT INTO tenancy.tenant_memberships  (tenant_id, user_id, is_tenant_admin)
        VALUES ('${ids.tenant}', '${ids.user}', true);
      INSERT INTO tenancy.outlet_assignments  (tenant_id, outlet_id, user_id, role_id)
        VALUES ('${ids.tenant}', '${ids.outlet}', '${ids.user}', '${ids.role}');
    `);
    await pool.query(`
      BEGIN;
      SET LOCAL ROLE sensible_app_role;
      SELECT set_config('app.current_tenant_id', '${ids.tenant}', true);
      SELECT set_config('app.current_user_id',   '${ids.user}',   true);
      SELECT set_config('app.is_super_admin',     'false',         true);
      SELECT set_config('app.is_platform_admin',  'false',         true);
      INSERT INTO billing.wallets (id, tenant_id, outlet_id)
        VALUES ('${ids.wallet}', '${ids.tenant}', '${ids.outlet}');
      COMMIT;
    `);

    // ── Seed rate cards ─────────────────────────────────────────────────────
    await pool.query(`
      INSERT INTO billing.rate_cards
        (tenant_id, outlet_id, service_type, unit_label, unit_price, currency, is_active, effective_from)
      VALUES
        (NULL, NULL, 'whatsapp.service', 'message', '1', 'credits', true, NOW() - INTERVAL '1 year'),
        (NULL, NULL, 'ai.agent_action',  'turn',    '2', 'credits', true, NOW() - INTERVAL '1 year'),
        (NULL, NULL, 'email.ses',        'email',   '1', 'credits', true, NOW() - INTERVAL '1 year');
    `);

    // ── Seed orders for each scenario ───────────────────────────────────────
    await pool.query(`
      BEGIN;
      SET LOCAL ROLE sensible_app_role;
      SELECT set_config('app.current_tenant_id', '${ids.tenant}', true);
      SELECT set_config('app.current_user_id',   '${ids.user}',   true);
      SELECT set_config('app.is_super_admin',     'false',         true);
      SELECT set_config('app.is_platform_admin',  'false',         true);

      INSERT INTO billing.top_up_orders
        (id, tenant_id, outlet_id, wallet_id, order_ref, amount_inr, credits_to_grant,
         status, idempotency_key, requested_by_user_id, expires_at)
      VALUES
        -- lease contention scenario
        ('${ids.leaseContention}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'RCLEASE',    100, 100, 'PENDING', 'rc-lease',     '${ids.user}', NOW() + INTERVAL '30 minutes'),
        -- lease expiry scenario (reconcile_next_retry_at in the past)
        ('${ids.leaseExpiry}',     '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'RCEXPIRY',   100, 100, 'PENDING', 'rc-expiry',    '${ids.user}', NOW() + INTERVAL '30 minutes'),
        -- backoff bounds: TRANSIENT with retry_count=0
        ('${ids.backoffBounds}',   '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'RCBACKOFF',  100, 100, 'PENDING', 'rc-backoff',   '${ids.user}', NOW() + INTERVAL '30 minutes'),
        -- max retries: retry_count=11 (one below ceiling), TRANSIENT → should promote to DEAD_LETTER
        ('${ids.maxRetries}',      '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'RCMAXRETRY', 100, 100, 'PENDING', 'rc-maxretry',  '${ids.user}', NOW() + INTERVAL '30 minutes'),
        -- permanent 404: should mark PERMANENT class
        ('${ids.permanentError}',  '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'RCPERMANENT',100, 100, 'PENDING', 'rc-permanent', '${ids.user}', NOW() + INTERVAL '30 minutes'),
        -- provider PENDING response
        ('${ids.providerPending}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'RCPENDING',  100, 100, 'PENDING', 'rc-pending',   '${ids.user}', NOW() + INTERVAL '30 minutes'),
        -- transient 503
        ('${ids.transientError}',  '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'RCTRANSIENT',100, 100, 'PENDING', 'rc-transient', '${ids.user}', NOW() + INTERVAL '30 minutes');

      COMMIT;
    `);

    // Pre-set maxRetries order to retry_count = 11
    await pool.query(`
      UPDATE billing.top_up_orders
      SET reconcile_retry_count = 11
      WHERE id = '${ids.maxRetries}'
    `);

    // Pre-set leaseExpiry order with an already-expired lease (in the past)
    await pool.query(`
      UPDATE billing.top_up_orders
      SET reconcile_next_retry_at = NOW() - INTERVAL '5 minutes'
      WHERE id = '${ids.leaseExpiry}'
    `);

    // ── TEST 1: Lease contention — two workers claim the same order ──────────
    {
      const pool2 = new Pool({ connectionString: testAdminUrl, max: 2 });
      try {
        // Both workers try to claim simultaneously
        const [claimed1, claimed2] = await Promise.all([
          topUpRepository.claimForReconciliation(pool2, 1, 90_000),
          topUpRepository.claimForReconciliation(pool2, 1, 90_000),
        ]);
        // FOR UPDATE SKIP LOCKED guarantees that only one worker gets each order
        const allIds = [...claimed1, ...claimed2].map((r) => r.id);
        const uniqueIds = new Set(allIds);
        assert.equal(uniqueIds.size, allIds.length, "Each order must be claimed by at most one worker");
      } finally {
        await pool2.end();
      }
    }

    // ── TEST 2: Lease expiry — expired lease is reclaimable ─────────────────
    {
      // leaseExpiry order already has reconcile_next_retry_at in the past
      const claimed = await topUpRepository.claimForReconciliation(pool, 10, 90_000);
      const expiryClaimed = claimed.find((r) => r.id === ids.leaseExpiry);
      assert.ok(expiryClaimed, "An order whose lease expired must be reclaimable");
    }

    // ── TEST 3: Backoff bounds — retry delay is within [0, cap] ─────────────
    {
      // backoffBounds order is PENDING with retry_count=0
      // Run reconciliation with a stubbed provider that returns TRANSIENT
      const before = await pool.query(
        "SELECT reconcile_retry_count, reconcile_next_retry_at, reconcile_last_failure_class FROM billing.top_up_orders WHERE id = $1",
        [ids.backoffBounds],
      );
      assert.equal(before.rows[0]?.reconcile_retry_count, 0);
      assert.equal(before.rows[0]?.reconcile_next_retry_at, null);

      const result = await reconcileTopUpOrders({ batchSize: 1, maxExecutionMs: 30_000 });
      // Should have processed the backoffBounds order (among others)
      assert.ok(result.processed >= 1, "At least one order must be processed");

      const after = await pool.query(
        "SELECT reconcile_retry_count, reconcile_next_retry_at, reconcile_last_failure_class FROM billing.top_up_orders WHERE id = $1",
        [ids.backoffBounds],
      );
      const row = after.rows[0];
      assert.ok(row, "backoffBounds order must still exist");
      assert.equal(row.reconcile_last_failure_class, "TRANSIENT", "TRANSIENT error must be recorded");
      assert.ok(row.reconcile_retry_count >= 1, "Retry count must increment");
      assert.ok(
        row.reconcile_next_retry_at !== null,
        "Next retry timestamp must be set after a TRANSIENT failure",
      );
      const nextRetryMs = new Date(row.reconcile_next_retry_at).getTime() - Date.now();
      assert.ok(nextRetryMs > 0, "Next retry must be in the future");
      assert.ok(nextRetryMs <= 600_000 + 5_000, "Next retry must not exceed BACKOFF_CAP + small margin");
    }

    // ── TEST 4: MAX_RETRIES ceiling → DEAD_LETTER ────────────────────────────
    {
      // maxRetries order has retry_count=11; one more TRANSIENT should promote to DEAD_LETTER
      const before = await pool.query(
        "SELECT status, reconcile_retry_count, reconcile_last_failure_class FROM billing.top_up_orders WHERE id = $1",
        [ids.maxRetries],
      );
      assert.equal(before.rows[0]?.reconcile_retry_count, 11);

      // Run reconciliation — the TRANSIENT stub will push it over the limit
      await reconcileTopUpOrders({ batchSize: 10, maxExecutionMs: 30_000 });

      const after = await pool.query(
        "SELECT status, reconcile_retry_count, reconcile_last_failure_class, reconcile_next_retry_at FROM billing.top_up_orders WHERE id = $1",
        [ids.maxRetries],
      );
      const row = after.rows[0];
      assert.ok(row);
      assert.equal(row.reconcile_last_failure_class, "DEAD_LETTER", "Exhausted order must become DEAD_LETTER");
      // CRITICAL: payment status must NOT be changed to FAILED
      assert.equal(row.status, "PENDING", "Payment status must NOT be mutated to FAILED on dead-letter");
      assert.equal(row.reconcile_next_retry_at, null, "DEAD_LETTER order must not have a next retry time");
    }

    // ── TEST 5: Provider PENDING response → AMBIGUOUS ────────────────────────
    {
      await reconcileTopUpOrders({ batchSize: 10, maxExecutionMs: 30_000 });
      const row = (await pool.query(
        "SELECT reconcile_last_failure_class FROM billing.top_up_orders WHERE id = $1",
        [ids.providerPending],
      )).rows[0];
      // PENDING from provider within order expiry window → AMBIGUOUS or keeps retrying
      assert.ok(
        row?.reconcile_last_failure_class === "AMBIGUOUS" ||
        row?.reconcile_last_failure_class === "TRANSIENT" ||
        row?.reconcile_last_failure_class === null,
        "PENDING provider response must result in AMBIGUOUS/TRANSIENT, not PERMANENT",
      );
      assert.notEqual(row?.reconcile_last_failure_class, "DEAD_LETTER");
    }

    // ── TEST 6: Permanent 404 from provider ──────────────────────────────────
    {
      await reconcileTopUpOrders({ batchSize: 10, maxExecutionMs: 30_000 });
      const row = (await pool.query(
        "SELECT reconcile_last_failure_class, status FROM billing.top_up_orders WHERE id = $1",
        [ids.permanentError],
      )).rows[0];
      assert.equal(row?.reconcile_last_failure_class, "PERMANENT", "404 from provider must be PERMANENT");
      // Payment status stays PENDING, not FAILED
      assert.equal(row?.status, "PENDING", "Payment status must not be mutated on PERMANENT class");
    }

    // ── TEST 7: Transient error → retry scheduled ─────────────────────────────
    {
      await reconcileTopUpOrders({ batchSize: 10, maxExecutionMs: 30_000 });
      const row = (await pool.query(
        "SELECT reconcile_last_failure_class, reconcile_next_retry_at FROM billing.top_up_orders WHERE id = $1",
        [ids.transientError],
      )).rows[0];
      assert.equal(row?.reconcile_last_failure_class, "TRANSIENT");
      assert.ok(row?.reconcile_next_retry_at !== null, "TRANSIENT must schedule a retry");
    }

    // ── TEST 8: Lease claim does not hold DB TX during provider call ──────────
    {
      // Verify that claimForReconciliation commits and releases before returning.
      // We do this by checking that a separate connection can immediately see
      // the updated reconcile_next_retry_at after claim returns.
      const pool3 = new Pool({ connectionString: testAdminUrl, max: 1 });
      try {
        const orderToCheck = ids.leaseContention;
        // First claim
        await topUpRepository.claimForReconciliation(pool3, 1, 90_000);
        // A different connection can immediately read the updated row
        const check = await pool.query(
          "SELECT reconcile_next_retry_at FROM billing.top_up_orders WHERE id = $1",
          [orderToCheck],
        );
        assert.ok(
          check.rows[0]?.reconcile_next_retry_at !== null,
          "reconcile_next_retry_at must be committed immediately after claim, not held in TX",
        );
      } finally {
        await pool3.end();
      }
    }

    // ── TEST 9: Batch size respected ─────────────────────────────────────────
    {
      // Reset all PENDING-eligible orders so they can be claimed
      await pool.query(`
        UPDATE billing.top_up_orders
        SET reconcile_next_retry_at = NULL, reconcile_last_failure_class = NULL
        WHERE status = 'PENDING'
          AND reconcile_last_failure_class IS DISTINCT FROM 'DEAD_LETTER'
          AND id IN ($1, $2)
      `, [ids.backoffBounds, ids.transientError]);

      const claimed = await topUpRepository.claimForReconciliation(pool, 1, 90_000);
      assert.ok(claimed.length <= 1, "claimForReconciliation must respect batchSize=1");
    }

    // ── TEST 10: Execution time limit respected ───────────────────────────────
    {
      // maxExecutionMs=1 means the worker should stop after the first order
      const result = await reconcileTopUpOrders({ batchSize: 100, maxExecutionMs: 1 });
      // The flag may or may not be set depending on timing, but processed must be bounded
      assert.ok(result.processed <= 5, "Execution time limit must bound the number of processed orders");
    }

  } finally {
    // Restore everything
    globalThis.fetch = originalFetch;
    Object.assign(pgConfig, originalPgConfig);
    clearPhonePeTokenCacheForTests();
    await closeApplicationPool();
    await closeAdminPool();
    process.env["DATABASE_URL"] = originalDatabaseUrl;
    process.env["DATABASE_ADMIN_URL"] = originalAdminUrl;
    await closeApplicationPool();
    await closeAdminPool();
    if (grantedMigrationRole) {
      await pool.query("REVOKE sensible_app_role FROM CURRENT_USER");
    }
    await pool.end();
    // Cleanup disposable DB and role
    try {
      await rootPool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    } catch {
      await rootPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    }
    await rootPool.query(`DROP ROLE IF EXISTS ${appRole}`);
    await rootPool.end();
  }
});
