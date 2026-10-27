-- =============================================================================
-- Rollback for migration 0048: Durable reconciliation retry tracking
-- =============================================================================

SET TIME ZONE 'UTC';

DROP INDEX IF EXISTS billing.top_up_orders_reconcile_claim_idx;

ALTER TABLE billing.top_up_orders
  DROP CONSTRAINT IF EXISTS top_up_reconcile_failure_class_ck,
  DROP CONSTRAINT IF EXISTS top_up_reconcile_retry_nonneg_ck,
  DROP COLUMN IF EXISTS reconcile_last_failure_class,
  DROP COLUMN IF EXISTS reconcile_next_retry_at,
  DROP COLUMN IF EXISTS reconcile_retry_count;
