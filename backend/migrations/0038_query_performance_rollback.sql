-- =============================================================================
-- Rollback for Migration 0038: Query Performance Indexes
--
-- Drops all 7 indexes added by 0038. Each DROP INDEX CONCURRENTLY avoids an
-- ACCESS EXCLUSIVE lock on the table during the drop.
--
-- IMPORTANT: Like the forward migration, these statements use DROP INDEX
-- CONCURRENTLY which cannot run inside a transaction. Do NOT wrap this file
-- in BEGIN/COMMIT.
-- =============================================================================

DROP INDEX CONCURRENTLY IF EXISTS crm.leads_outlet_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS crm.leads_outlet_external_ref_idx;
DROP INDEX CONCURRENTLY IF EXISTS crm.activities_outlet_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS crm.tasks_status_updated_idx;
DROP INDEX CONCURRENTLY IF EXISTS crm.stock_ledger_outlet_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS crm.calls_tenant_customer_logged_idx;
DROP INDEX CONCURRENTLY IF EXISTS crm.payroll_run_summaries_run_idx;
