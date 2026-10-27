-- =============================================================================
-- Migration 0038: Query Performance Indexes
--
-- Uses plain CREATE INDEX (not CONCURRENTLY) so this migration runs safely
-- inside Drizzle's transaction wrapper. On a live production database with
-- large tables you can rebuild these indexes with CREATE INDEX CONCURRENTLY
-- after applying the migration.
-- =============================================================================

-- 1. crm.leads — outlet + created_at (cursor pagination without stage filter)
CREATE INDEX IF NOT EXISTS leads_outlet_created_idx
  ON crm.leads (tenant_id, outlet_id, created_at DESC, id DESC);

-- 2. crm.leads — external_ref deduplication for bulk imports
CREATE INDEX IF NOT EXISTS leads_outlet_external_ref_idx
  ON crm.leads (tenant_id, outlet_id, external_ref)
  WHERE external_ref <> '';

-- 3. crm.activities — outlet + created_at (default list sort)
CREATE INDEX IF NOT EXISTS activities_outlet_created_idx
  ON crm.activities (tenant_id, outlet_id, created_at DESC, id DESC);

-- 4. crm.tasks — status + updated_at (filtered task list)
CREATE INDEX IF NOT EXISTS tasks_status_updated_idx
  ON crm.tasks (tenant_id, outlet_id, status, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- 5. crm.stock_ledger — outlet_id time-series queries
CREATE INDEX IF NOT EXISTS stock_ledger_outlet_created_idx
  ON crm.stock_ledger (tenant_id, outlet_id, created_at DESC);

-- 6. crm.calls — customer_id FK lookup
CREATE INDEX IF NOT EXISTS calls_tenant_customer_logged_idx
  ON crm.calls (tenant_id, customer_id, logged_at DESC, id DESC)
  WHERE customer_id IS NOT NULL;

-- 7. crm.payroll_run_summaries — payroll_run_id FK lookup
CREATE INDEX IF NOT EXISTS payroll_run_summaries_run_idx
  ON crm.payroll_run_summaries (tenant_id, payroll_run_id);
