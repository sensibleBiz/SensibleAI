-- =============================================================================
-- Migration 0045: Rate-card admin mutations
--
-- Purpose:
--   Extends billing.rate_cards to support admin-driven INSERT and UPDATE
--   operations via the application API (Phase 9 Admin Rate Card Management).
--
-- Design notes:
--   • Previously rate_cards were managed via migration scripts only (SELECT only
--     for sensible_app_role). This migration expands the grant to allow INSERT
--     and UPDATE so authenticated administrators can manage rates at runtime.
--
--   • rate_cards has no tenant_id column (rates are platform-wide / global).
--     The RLS INSERT and UPDATE policies therefore use USING (true) / WITH CHECK
--     (true) and rely entirely on backend application-level authorization:
--       - All mutations require isTenantAdmin in the session JWT.
--       - The route handler enforces this before the DB statement is issued.
--       - FORCE ROW LEVEL SECURITY is already active on the table (from 0044).
--
--   ⚠️  AUTHORIZATION GAP (documented, not resolved here):
--       Because rate cards are global, isTenantAdmin allows ANY tenant admin to
--       call these endpoints. Production deployments MUST restrict access to the
--       Sensible AI internal tenant via an additional backend check or a new
--       system-permission column before rate-card admin is promoted to general
--       availability. The route is marked internalOnly in the frontend sidebar
--       as a defense-in-depth measure.
--
--   • No DELETE policy is added — rate cards referenced by billing.usage_events
--     are protected by ON DELETE RESTRICT. Deactivation (is_active = false) is
--     the safe alternative; the schema constraint rate_cards_active_service_uq
--     prevents duplicate open-ended active rates.
--
-- Rollback: see 0045_rate_card_admin_rollback.sql
-- =============================================================================

SET TIME ZONE 'UTC';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extend grants: add INSERT and UPDATE to sensible_app_role
-- ─────────────────────────────────────────────────────────────────────────────
GRANT INSERT, UPDATE ON billing.rate_cards TO sensible_app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS policies for admin mutations
--    rate_cards has no tenant_id; policies are intentionally permissive
--    because the backend enforces isTenantAdmin before reaching the database.
--    FORCE ROW LEVEL SECURITY (from migration 0044) ensures these policies
--    run even for the table owner.
-- ─────────────────────────────────────────────────────────────────────────────

-- INSERT: allow any authenticated app session (backend enforces isTenantAdmin).
CREATE POLICY rate_cards_insert ON billing.rate_cards FOR INSERT
  WITH CHECK (true);

-- UPDATE: allow updates to any row (backend validates id + enforces isTenantAdmin).
CREATE POLICY rate_cards_update ON billing.rate_cards FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Safety check: sensible_app_role must not hold BYPASSRLS
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE rec record;
BEGIN
  SELECT rolbypassrls, rolsuper INTO rec
  FROM pg_roles WHERE rolname = 'sensible_app_role';
  IF rec.rolbypassrls OR rec.rolsuper THEN
    RAISE EXCEPTION
      'sensible_app_role must not hold BYPASSRLS or superuser; '
      'current state: rolbypassrls=%, rolsuper=%', rec.rolbypassrls, rec.rolsuper;
  END IF;
END;
$$;
