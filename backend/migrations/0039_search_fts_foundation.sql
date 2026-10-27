-- =============================================================================
-- Migration 0039: Full-text search foundation for crm.leads
--
-- Adds a GENERATED ALWAYS AS STORED tsvector column and a GIN index.
-- Uses 'simple' text-search configuration (no stemming / stop-word removal):
--   - Preserves Indian business names, product names and mixed-language content
--   - Keeps phone numbers and alphanumeric codes intact (not stripped as stop-words)
--
-- This migration runs inside a transaction (no CONCURRENTLY).
-- On a table with > 100k rows the GIN index build will hold an ACCESS SHARE
-- lock; schedule during a maintenance window or use a separate CONCURRENTLY
-- rebuild after the column is added.
-- =============================================================================

-- array_to_string is STABLE (not IMMUTABLE) in PostgreSQL 16+, so tags cannot
-- be included in a GENERATED ALWAYS AS STORED expression. Tags are searchable
-- via the GIN index on the tags[] column added in migration 0003.
ALTER TABLE crm.leads
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(business_name,      '') || ' ' ||
      coalesce(customer_name,      '') || ' ' ||
      coalesce(requirement,        '') || ' ' ||
      coalesce(city,               '') || ' ' ||
      coalesce(state,              '') || ' ' ||
      coalesce(area,               '') || ' ' ||
      coalesce(source,             '') || ' ' ||
      coalesce(normalized_mobile,  '') || ' ' ||
      coalesce(normalized_email,   '') || ' ' ||
      coalesce(external_ref,       '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS leads_search_vector_idx
  ON crm.leads USING gin(search_vector);

-- Grant SELECT on the new column to the application role
GRANT SELECT (search_vector) ON crm.leads TO sensible_app_role;
