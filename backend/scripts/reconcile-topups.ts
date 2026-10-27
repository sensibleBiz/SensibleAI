import { closeAdminPool, closeApplicationPool } from "../src/db/client.js";
import { reconcileTopUpOrders } from "../src/modules/billing/topUpReconciliation.js";

const parseBoundedInt = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
};

try {
  const result = await reconcileTopUpOrders({
    batchSize: parseBoundedInt("TOPUP_RECONCILIATION_BATCH_SIZE", 50, 1, 500),
    maxExecutionMs: parseBoundedInt("TOPUP_RECONCILIATION_MAX_EXECUTION_MS", 270_000, 10_000, 600_000),
  });
  console.info(JSON.stringify({
    event: "TOPUP_RECONCILIATION_COMMAND_COMPLETE",
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    skipped: result.skipped,
    deadLettered: result.deadLettered,
    errorCount: result.errors.length,
    timeoutReached: result.timeoutReached,
  }));
  if (result.errors.length > 0 || result.deadLettered > 0) process.exitCode = 1;
} finally {
  await Promise.all([closeApplicationPool(), closeAdminPool()]);
}
