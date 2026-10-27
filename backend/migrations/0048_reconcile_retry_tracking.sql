-- =============================================================================
-- Migration 0048: Durable reconciliation retry tracking for top_up_orders
--
-- Adds three columns to billing.top_up_orders that enable the bounded
-- reconciliation worker to implement safe lease-based claiming, exponential
-- backoff with jitter, and an observable dead-letter state.
--
-- reconcile_retry_count   — number of reconciliation attempts made so far
-- reconcile_next_retry_at — earliest time the worker may claim this order again;
--                           NULL means the order has never been claimed
-- reconcile_last_failure_class — TRANSIENT | PERMANENT | AMBIGUOUS | DEAD_LETTER
--
-- The reconciliation query changes from:
--   WHERE status IN ('CREATED','PENDING')
--     AND updated_at < NOW() - ($n * INTERVAL '1 minute')
-- to:
--   WHERE status IN ('CREATED','PENDING')
--     AND reconcile_last_failure_class IS DISTINCT FROM 'DEAD_LETTER'
--     AND (reconcile_next_retry_at IS NULL OR reconcile_next_retry_at <= NOW())
--   FOR UPDATE SKIP LOCKED
--
-- SKIP LOCKED ensures concurrent workers each claim distinct orders without
-- waiting, so no DB lock is held during the outbound PhonePe HTTP call.
-- The worker updates reconcile_next_retry_at to a future time (backoff) before
-- making the network call, so a crash releases the lease when the time elapses.
--
-- Dead-letter: when reconcile_retry_count reaches the maximum (default 12),
-- the worker sets reconcile_last_failure_class = 'DEAD_LETTER' instead of
-- falsely marking the order FAILED. Operators can inspect and manually recover.
--
-- Rollback: see 0048_reconcile_retry_tracking_rollback.sql
-- =============================================================================

SET TIME ZONE 'UTC';

ALTER TABLE billing.top_up_orders
  ADD COLUMN IF NOT EXISTS reconcile_retry_count   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconcile_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconcile_last_failure_class varchar(16);

ALTER TABLE billing.top_up_orders
  ADD CONSTRAINT top_up_reconcile_failure_class_ck CHECK (
    reconcile_last_failure_class IS NULL
    OR reconcile_last_failure_class IN ('TRANSIENT','PERMANENT','AMBIGUOUS','DEAD_LETTER')
  ),
  ADD CONSTRAINT top_up_reconcile_retry_nonneg_ck CHECK (reconcile_retry_count >= 0);

-- Efficient index for the reconciliation worker's claim query.
-- Partial: only CREATED/PENDING orders that are not dead-lettered.
CREATE INDEX top_up_orders_reconcile_claim_idx
  ON billing.top_up_orders (reconcile_next_retry_at ASC NULLS FIRST)
  WHERE status IN ('CREATED','PENDING')
    AND (reconcile_last_failure_class IS NULL
         OR reconcile_last_failure_class <> 'DEAD_LETTER');
