/**
 * SES Post-Send Billing Recovery Tool
 *
 * Context:
 *   The /api/communication/send-email route sends via SES first, then attempts
 *   billing in a separate withDatabaseContext call. If that billing call fails
 *   (DB transient, wallet error, rate card missing), the email is delivered but
 *   credits are NOT charged. A structured WARNING is emitted with:
 *     event = "EMAIL_BILLING_FAILED_AFTER_SEND"
 *     sesMessageId, tenantId, outletId
 *
 * This script accepts a single EMAIL_BILLING_FAILED_AFTER_SEND log entry
 * (provided as env vars) and retries billing idempotently using the stable
 * ses:{sesMessageId} key.  It is safe to run multiple times — the usage
 * event's ON CONFLICT (tenant_id, idempotency_key) DO NOTHING guarantees no
 * duplicate billing.
 *
 * Usage:
 *   RECOVER_TENANT_ID=<uuid> \
 *   RECOVER_OUTLET_ID=<uuid> \
 *   RECOVER_ACTOR_USER_ID=<uuid> \
 *   RECOVER_SES_MESSAGE_ID=<SES MessageId> \
 *   node --loader ts-node/esm backend/scripts/recover-ses-usage.ts
 *
 * Required env vars (in addition to DATABASE_URL / DATABASE_ADMIN_URL):
 *   RECOVER_TENANT_ID      — the tenant UUID from the warning log
 *   RECOVER_OUTLET_ID      — the outlet UUID from the warning log
 *   RECOVER_ACTOR_USER_ID  — a valid user UUID to attribute the billing to
 *   RECOVER_SES_MESSAGE_ID — the SES MessageId from the warning log
 *
 * Safety constraints enforced:
 *   - Never calls SES — only retries the billing write
 *   - Idempotency key ses:{messageId} prevents double-billing on repeated runs
 *   - Script exits with code 1 on any error
 *   - Produces structured JSON log on stdout for audit
 */

import { closeAdminPool, closeApplicationPool } from "../src/db/client.js";
import { withDatabaseContext } from "../src/db/context.js";
import { usageService } from "../src/modules/billing/usage.service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} must be set`);
  return value.trim();
}

try {
  const tenantId = requireEnv("RECOVER_TENANT_ID");
  const outletId = requireEnv("RECOVER_OUTLET_ID");
  const actorUserId = requireEnv("RECOVER_ACTOR_USER_ID");
  const sesMessageId = requireEnv("RECOVER_SES_MESSAGE_ID");

  if (!UUID_RE.test(tenantId)) throw new Error("RECOVER_TENANT_ID must be a valid UUID");
  if (!UUID_RE.test(outletId)) throw new Error("RECOVER_OUTLET_ID must be a valid UUID");
  if (!UUID_RE.test(actorUserId)) throw new Error("RECOVER_ACTOR_USER_ID must be a valid UUID");
  if (!sesMessageId) throw new Error("RECOVER_SES_MESSAGE_ID must not be empty");

  const idempotencyKey = `ses:${sesMessageId}`;

  console.info(JSON.stringify({
    event: "SES_BILLING_RECOVERY_STARTED",
    tenantId,
    outletId,
    sesMessageId,
    idempotencyKey,
  }));

  const result = await withDatabaseContext({ tenantId, userId: actorUserId }, async (db) => {
    return usageService.meterUsage(db, {
      tenantId,
      outletId,
      serviceType: "email.ses",
      quantity: "1.0000",
      idempotencyKey,
      actorUserId,
      providerRef: sesMessageId,
      provider: "aws",
      metadata: { recovery: true },
    });
  });

  console.info(JSON.stringify({
    event: "SES_BILLING_RECOVERY_COMPLETE",
    tenantId,
    outletId,
    sesMessageId,
    usageEventId: result.usageEvent.id,
    walletTxnId: result.walletTxnId,
    billedCredits: result.billedCredits,
    idempotent: result.idempotent,
  }));

} catch (error) {
  console.error(JSON.stringify({
    event: "SES_BILLING_RECOVERY_FAILED",
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
} finally {
  await Promise.all([closeApplicationPool(), closeAdminPool()]);
}
