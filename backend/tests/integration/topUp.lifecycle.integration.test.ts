import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { test } from "node:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "../../src/config/env.js";
import { closeAdminPool, closeApplicationPool, getAdminPool } from "../../src/db/client.js";
import { withDatabaseContext } from "../../src/db/context.js";
import { seedFoundation } from "../../src/db/seeds/foundation.js";
import { phonePePgTopUpRouter } from "../../src/modules/billing/phonePePg.routes.js";
import { topUpService } from "../../src/modules/billing/topUp.service.js";
import { clearPhonePeTokenCacheForTests } from "../../src/modules/billing/phonePePg.service.js";
import { reconcileTopUpOrders } from "../../src/modules/billing/topUpReconciliation.js";

const adminConnectionString = process.env["DATABASE_ADMIN_URL"];
if (!adminConnectionString) {
  throw new Error("DATABASE_ADMIN_URL is required to run top-up lifecycle integration tests");
}

const migrationsFolder = path.resolve(process.cwd(), "migrations");
const buildConnectionUrl = (base: string, database: string) => {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
};

const ids = {
  tenant: "01994abc-0047-7000-8000-000000000001",
  business: "01994abc-0047-7000-8000-000000000002",
  outlet: "01994abc-0047-7000-8000-000000000003",
  user: "01994abc-0047-7000-8000-000000000004",
  role: "01994abc-0047-7000-8000-000000000005",
  wallet: "01994abc-0047-7000-8000-000000000006",
  successOrder: "01994abc-0047-7000-8000-000000000011",
  mismatchOrder: "01994abc-0047-7000-8000-000000000012",
  recoveryOrder: "01994abc-0047-7000-8000-000000000013",
  expiredOrder: "01994abc-0047-7000-8000-000000000014",
  pendingOrder: "01994abc-0047-7000-8000-000000000015",
  callbackOrder: "01994abc-0047-7000-8000-000000000016",
  databaseFailureOrder: "01994abc-0047-7000-8000-000000000017",
  staleOrder: "01994abc-0047-7000-8000-000000000018",
  timeoutOrder: "01994abc-0047-7000-8000-000000000019",
};

test("top-up lifecycle is atomic, idempotent, and server-status authoritative", async () => {
  assert.ok(adminConnectionString);
  const rootPool = new Pool({
    connectionString: buildConnectionUrl(adminConnectionString, "postgres"),
    max: 1,
  });
  const suffix = randomBytes(6).toString("hex");
  const dbName = `sensible_topup_lifecycle_${suffix}`;
  const appRole = `sensible_topup_app_${suffix}`;
  const appPassword = randomBytes(18).toString("hex");
  const originalDatabaseUrl = process.env["DATABASE_URL"];
  const originalAdminUrl = process.env["DATABASE_ADMIN_URL"];
  const originalFetch = globalThis.fetch;
  const pgConfig = env.billing.phonePePg;
  const originalPgConfig = { ...pgConfig };
  let grantedMigrationRole = false;

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
  // Other integration files can share this worker. Ensure lazily cached pools
  // are rebound after the test swaps connection URLs.
  await closeApplicationPool();
  await closeAdminPool();

  Object.assign(pgConfig, {
    enabled: true,
    productionEnabled: false,
    legacyV1Enabled: false,
    creditsPerInr: "1",
    clientIdTest: "sandbox-client-id",
    clientSecretTest: "sandbox-client-secret",
    clientVersionTest: "1",
    webhookUsernameTest: "sandbox-webhook-user",
    webhookPasswordTest: "sandbox-webhook-password",
    redirectUrl: "https://crm.example.test/billing/topup/result",
    callbackUrl: "https://api.example.test/api/webhooks/phonepe-pg/callback",
  });
  clearPhonePeTokenCacheForTests();

  type ProviderState = { state: "COMPLETED" | "FAILED" | "PENDING"; amount: number; txnId?: string };
  const providerStates = new Map<string, ProviderState>([
    ["TUSUCCESS", { state: "COMPLETED", amount: 10_000, txnId: "PG-SUCCESS" }],
    ["TUMISMATCH", { state: "COMPLETED", amount: 9_999, txnId: "PG-MISMATCH" }],
    ["TURECOVERY", { state: "FAILED", amount: 20_000 }],
    ["TUEXPIRED", { state: "PENDING", amount: 30_000 }],
    ["TUPENDING", { state: "PENDING", amount: 17_500 }],
    ["TUCALLBACK", { state: "PENDING", amount: 15_000 }],
    ["TUDBFAIL", { state: "COMPLETED", amount: 12_500, txnId: "PG-DBFAIL" }],
    ["TUSTALE", { state: "COMPLETED", amount: 22_500, txnId: "PG-STALE" }],
  ]);
  let createPaymentCalls = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.pathname.endsWith("/v1/oauth/token")) {
      return Response.json({
        access_token: "integration-test-token",
        expires_at: Math.floor(Date.now() / 1_000) + 3_600,
        token_type: "O-Bearer",
      });
    }
    if (url.pathname.endsWith("/checkout/v2/pay")) {
      createPaymentCalls++;
      throw new DOMException("request timed out", "TimeoutError");
    }
    const orderRef = decodeURIComponent(url.pathname.split("/").at(-2) ?? "");
    const provider = providerStates.get(orderRef);
    assert.ok(provider, `unexpected provider order ${orderRef}`);
    return Response.json({
      orderId: `OMO-${orderRef}`,
      state: provider.state,
      amount: provider.amount,
      paymentDetails: provider.txnId
        ? [{ transactionId: provider.txnId, amount: provider.amount, state: provider.state }]
        : [],
    });
  }) as typeof fetch;

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
    await pool.query(`
      ALTER TABLE tenancy.businesses DISABLE TRIGGER USER;
      INSERT INTO tenancy.tenants (id, name, slug)
        VALUES ('${ids.tenant}', 'Top-up tenant', 'topup-tenant');
      INSERT INTO tenancy.businesses (id, tenant_id, name)
        VALUES ('${ids.business}', '${ids.tenant}', 'Top-up business');
      INSERT INTO tenancy.outlets (id, tenant_id, business_id, outlet_code, name)
        VALUES ('${ids.outlet}', '${ids.tenant}', '${ids.business}', 'TOPUP', 'Top-up outlet');
      ALTER TABLE tenancy.businesses ENABLE TRIGGER USER;
      INSERT INTO iam.roles (id, tenant_id, name)
        VALUES ('${ids.role}', '${ids.tenant}', 'topup-test-role');
      INSERT INTO iam.users (id, email, display_name)
        VALUES ('${ids.user}', 'topup-lifecycle@example.com', 'Top-up User');
      INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin)
        VALUES ('${ids.tenant}', '${ids.user}', true);
      INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id)
        VALUES ('${ids.tenant}', '${ids.outlet}', '${ids.user}', '${ids.role}');
      BEGIN;
      SET LOCAL ROLE sensible_app_role;
      SELECT set_config('app.current_tenant_id', '${ids.tenant}', true);
      SELECT set_config('app.current_user_id', '${ids.user}', true);
      SELECT set_config('app.is_super_admin', 'false', true);
      SELECT set_config('app.is_platform_admin', 'false', true);
      INSERT INTO billing.wallets (id, tenant_id, outlet_id)
        VALUES ('${ids.wallet}', '${ids.tenant}', '${ids.outlet}');
      INSERT INTO billing.top_up_orders
        (id, tenant_id, outlet_id, wallet_id, order_ref, amount_inr,
         credits_to_grant, status, idempotency_key, requested_by_user_id, expires_at)
      VALUES
        ('${ids.successOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TUSUCCESS', 100, 25, 'PENDING', 'success-order', '${ids.user}', NOW() + INTERVAL '30 minutes'),
        ('${ids.mismatchOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TUMISMATCH', 100, 10, 'PENDING', 'mismatch-order', '${ids.user}', NOW() + INTERVAL '30 minutes'),
        ('${ids.recoveryOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TURECOVERY', 200, 40, 'PENDING', 'recovery-order', '${ids.user}', NOW() + INTERVAL '30 minutes'),
        ('${ids.expiredOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TUEXPIRED', 300, 60, 'PENDING', 'expired-order', '${ids.user}', NOW() - INTERVAL '1 minute'),
        ('${ids.pendingOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TUPENDING', 175, 20, 'PENDING', 'pending-order', '${ids.user}', NOW() + INTERVAL '30 minutes'),
        ('${ids.callbackOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TUCALLBACK', 150, 30, 'PENDING', 'callback-order', '${ids.user}', NOW() + INTERVAL '30 minutes'),
        ('${ids.databaseFailureOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TUDBFAIL', 125, 15, 'PENDING', 'database-failure-order', '${ids.user}', NOW() + INTERVAL '30 minutes'),
        ('${ids.staleOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TUSTALE', 225, 35, 'PENDING', 'stale-order', '${ids.user}', NOW() + INTERVAL '30 minutes'),
        ('${ids.timeoutOrder}', '${ids.tenant}', '${ids.outlet}', '${ids.wallet}',
         'TUTIMEOUT', 125, 15, 'CREATED', 'timeout-order', '${ids.user}', NOW() + INTERVAL '30 minutes');
      UPDATE billing.top_up_orders
      SET provider_order_id = 'OMO-TUCALLBACK'
      WHERE id = '${ids.callbackOrder}';
      UPDATE billing.top_up_orders
      SET updated_at = NOW() - INTERVAL '10 minutes'
      WHERE id = '${ids.staleOrder}';
      COMMIT;
    `);

    const concurrent = await Promise.all([
      topUpService.verifyAndCreditTopUp(ids.tenant, ids.user, ids.outlet, ids.successOrder),
      topUpService.verifyAndCreditTopUp(ids.tenant, ids.user, ids.outlet, ids.successOrder),
    ]);
    assert.ok(concurrent.every((entry) => entry.status === "SUCCESS"));
    const firstBalance = await withDatabaseContext(
      { tenantId: ids.tenant, userId: ids.user },
      (db) => db.client.query<{ balance: string; txns: string }>(`
        SELECT wallet.balance_credits::text AS balance,
               (SELECT COUNT(*)::text FROM billing.wallet_transactions WHERE wallet_id = wallet.id) AS txns
        FROM billing.wallets AS wallet WHERE wallet.id = $1
      `, [ids.wallet]),
    );
    assert.equal(firstBalance.rows[0]!.balance, "25.0000");
    assert.equal(firstBalance.rows[0]!.txns, "1", "concurrent verification must mint once");

    await assert.rejects(
      topUpService.verifyAndCreditTopUp(ids.tenant, ids.user, ids.outlet, ids.mismatchOrder),
      (error: unknown) => (error as { code?: string }).code === "AMOUNT_MISMATCH",
    );

    const failed = await topUpService.verifyAndCreditTopUp(
      ids.tenant, ids.user, ids.outlet, ids.recoveryOrder,
    );
    assert.equal(failed.status, "FAILED");
    providerStates.set("TURECOVERY", { state: "COMPLETED", amount: 20_000, txnId: "PG-RECOVERED" });
    const recovered = await topUpService.verifyAndCreditTopUp(
      ids.tenant, ids.user, ids.outlet, ids.recoveryOrder,
    );
    assert.equal(recovered.status, "SUCCESS", "trusted later success must recover prior failure");

    const expired = await topUpService.verifyAndCreditTopUp(
      ids.tenant, ids.user, ids.outlet, ids.expiredOrder,
    );
    assert.equal(expired.status, "EXPIRED");

    const browserReturnPoll = await topUpService.verifyAndCreditTopUp(
      ids.tenant, ids.user, ids.outlet, ids.pendingOrder,
    );
    assert.equal(browserReturnPoll.status, "PENDING", "browser return/poll must not imply success");

    await assert.rejects(
      topUpService.callPhonePeAndUpdateOrder(
        ids.tenant, ids.user, ids.timeoutOrder, "TUTIMEOUT", "125.00",
      ),
      /create payment request failed/,
    );
    assert.equal(createPaymentCalls, 1, "ambiguous create must not be retried");
    const afterCreateTimeout = await withDatabaseContext(
      { tenantId: ids.tenant, userId: ids.user },
      (db) => db.client.query<{ status: string }>(
        "SELECT status FROM billing.top_up_orders WHERE id = $1",
        [ids.timeoutOrder],
      ),
    );
    assert.equal(afterCreateTimeout.rows[0]!.status, "CREATED",
      "an ambiguous create outcome must remain available for reconciliation");

    type RouteHandler = (
      request: unknown,
      response: {
        status(code: number): unknown;
        json(body: unknown): unknown;
      },
      next: (error?: unknown) => void,
    ) => Promise<void>;
    const routeLayer = (
      phonePePgTopUpRouter as unknown as {
        stack: Array<{
          route?: {
            path: string;
            stack: Array<{ handle: RouteHandler }>;
          };
        }>;
      }
    ).stack.find((layer) => layer.route?.path === "/topup");
    const routeHandler = routeLayer?.route?.stack.at(-1)?.handle;
    assert.ok(routeHandler, "top-up route handler should be registered");
    let replayResponse: unknown;
    const replayResponseWriter = {
      status() {
        return this;
      },
      json(body: unknown) {
        replayResponse = body;
        return this;
      },
    };
    await routeHandler(
      {
        body: { outletId: ids.outlet, amountInr: "125.00", idempotencyKey: "timeout-order" },
        postgresAuth: { tenantId: ids.tenant, userId: ids.user },
      },
      replayResponseWriter,
      (error) => {
        if (error) throw error;
      },
    );
    const replayedResult = (replayResponse as { data?: {
      reused?: boolean;
      redirectUrl?: string | null;
      status?: string;
    } }).data;
    assert.equal(replayedResult?.reused, true);
    assert.equal(replayedResult?.redirectUrl, null);
    assert.equal(replayedResult?.status, "CREATED");
    assert.equal(createPaymentCalls, 1, "replaying an ambiguous order must not create another payment");

    const webhookAuthorization = createHash("sha256")
      .update("sandbox-webhook-user:sandbox-webhook-password")
      .digest("hex");
    // The local integration admin URL is the migration owner. Activate its
    // granted BYPASSRLS maintenance role to mirror the production admin-pool
    // contract for callback tenant resolution and reconciliation.
    const adminClient = await getAdminPool().connect();
    try {
      await adminClient.query("SET ROLE sensible_rls_owner");
    } finally {
      adminClient.release();
    }
    const adminProbe = await getAdminPool().query<{ database_name: string; order_count: string }>(`
      SELECT current_database() AS database_name,
        (SELECT COUNT(*)::text FROM billing.top_up_orders WHERE order_ref = 'TUCALLBACK') AS order_count
    `);
    assert.equal(adminProbe.rows[0]!.database_name, dbName);
    assert.equal(adminProbe.rows[0]!.order_count, "1");
    await topUpService.handlePhonePeCallback({
      event: "checkout.order.completed",
      payload: { merchantOrderId: "TUCALLBACK", state: "COMPLETED", amount: 15_000 },
    }, webhookAuthorization);
    const stillPending = await withDatabaseContext(
      { tenantId: ids.tenant, userId: ids.user },
      (db) => db.client.query<{ status: string }>(
        "SELECT status FROM billing.top_up_orders WHERE id = $1",
        [ids.callbackOrder],
      ),
    );
    assert.equal(stillPending.rows[0]!.status, "PENDING", "webhook body cannot authorize credit");

    providerStates.set("TUCALLBACK", {
      state: "COMPLETED", amount: 15_000, txnId: "PG-CALLBACK",
    });
    await topUpService.handlePhonePeCallback({
      event: "checkout.order.failed",
      payload: { merchantOrderId: "TUCALLBACK", state: "FAILED", amount: 15_000 },
    }, webhookAuthorization);
    await topUpService.handlePhonePeCallback({
      event: "checkout.order.completed",
      payload: { merchantOrderId: "TUCALLBACK", state: "COMPLETED", amount: 15_000 },
    }, webhookAuthorization);

    await pool.query(`
      CREATE OR REPLACE FUNCTION billing.fail_phase12_wallet_credit()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.reference_id = '${ids.databaseFailureOrder}'::uuid THEN
          RAISE EXCEPTION 'simulated phase 12 wallet credit failure';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER fail_phase12_wallet_credit
      BEFORE INSERT ON billing.wallet_transactions
      FOR EACH ROW EXECUTE FUNCTION billing.fail_phase12_wallet_credit();
    `);
    await assert.rejects(
      topUpService.verifyAndCreditTopUp(
        ids.tenant, ids.user, ids.outlet, ids.databaseFailureOrder,
      ),
      /simulated phase 12 wallet credit failure/,
    );
    const afterDatabaseFailure = await withDatabaseContext(
      { tenantId: ids.tenant, userId: ids.user },
      (db) => db.client.query<{ status: string; txns: string }>(`
        SELECT status,
          (SELECT COUNT(*)::text FROM billing.wallet_transactions WHERE reference_id = $1) AS txns
        FROM billing.top_up_orders WHERE id = $1
      `, [ids.databaseFailureOrder]),
    );
    assert.equal(afterDatabaseFailure.rows[0]!.status, "PENDING");
    assert.equal(afterDatabaseFailure.rows[0]!.txns, "0");
    await pool.query("DROP TRIGGER fail_phase12_wallet_credit ON billing.wallet_transactions");
    await pool.query("DROP FUNCTION billing.fail_phase12_wallet_credit() ");
    const databaseRetry = await topUpService.verifyAndCreditTopUp(
      ids.tenant, ids.user, ids.outlet, ids.databaseFailureOrder,
    );
    assert.equal(databaseRetry.status, "SUCCESS");

    const reconciliation = await reconcileTopUpOrders({ staleSinceMinutes: 5, batchSize: 10 });
    assert.equal(reconciliation.failed, 0);
    assert.equal(reconciliation.processed, 1);
    assert.equal(reconciliation.succeeded, 1);

    const finalState = await withDatabaseContext(
      { tenantId: ids.tenant, userId: ids.user },
      (db) => db.client.query<{ balance: string; txns: string; mismatch_status: string }>(`
        SELECT wallet.balance_credits::text AS balance,
               (SELECT COUNT(*)::text FROM billing.wallet_transactions WHERE wallet_id = wallet.id) AS txns,
               (SELECT status FROM billing.top_up_orders WHERE id = $2) AS mismatch_status
        FROM billing.wallets AS wallet WHERE wallet.id = $1
      `, [ids.wallet, ids.mismatchOrder]),
    );
    assert.equal(finalState.rows[0]!.balance, "145.0000");
    assert.equal(finalState.rows[0]!.txns, "5");
    assert.equal(finalState.rows[0]!.mismatch_status, "PENDING");
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(pgConfig, originalPgConfig);
    clearPhonePeTokenCacheForTests();
    await closeApplicationPool();
    await closeAdminPool();
    if (grantedMigrationRole) {
      await pool.query("REVOKE sensible_app_role FROM CURRENT_USER");
    }
    await pool.end();
    if (originalDatabaseUrl === undefined) delete process.env["DATABASE_URL"];
    else process.env["DATABASE_URL"] = originalDatabaseUrl;
    if (originalAdminUrl === undefined) delete process.env["DATABASE_ADMIN_URL"];
    else process.env["DATABASE_ADMIN_URL"] = originalAdminUrl;
    await rootPool.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid() AND backend_type = 'client backend'",
      [dbName],
    );
    await rootPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await rootPool.query(`DROP ROLE IF EXISTS ${appRole}`);
    await rootPool.end();
  }
});
