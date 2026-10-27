-- =============================================================================
-- Rollback for Migration 0039: Full-text search foundation
-- =============================================================================

DROP INDEX IF EXISTS crm.leads_search_vector_idx;
ALTER TABLE crm.leads DROP COLUMN IF EXISTS search_vector;
