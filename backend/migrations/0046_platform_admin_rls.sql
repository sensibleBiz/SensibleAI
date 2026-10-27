-- =============================================================================
-- Migration 0046: Platform-administrator RLS for billing.rate_cards
--
-- Purpose:
--   Closes the authorization gap from migration 0045.
--   Migration 0045 used permissive WITH CHECK (true) / USING (true) RLS
--   policies for rate_cards INSERT/UPDATE, relying entirely on the application
--   layer's isTenantAdmin check. Because rate_cards is global (no tenant_id),
--   any tenant administrator could reach those endpoints.
--
--   This migration:
--     1. Creates billing.is_platform_admin() — a stable function that reads
--        the session variable app.is_platform_admin set by withDatabaseContext.
--     2. Replaces the permissive INSERT and UPDATE policies with policies that
--        require billing.is_platform_admin() = true.
--
--   Defense-in-depth:
--     The app layer (rateCard.routes.ts) also checks:
--       auth.tenantId === env.billing.platformAdminTenantId
--       AND auth.isTenantAdmin === true
--     before calling withDatabaseContext. If that check passes, context.ts sets
--       SET LOCAL app.is_platform_admin = 'true'
--     Only then will the DB-level policy allow the write.
--
--   The session variable is set server-side in withDatabaseContext. It cannot
--   be forged by an API client — routes never accept it as an input, and the
--   app pool's connection lifecycle prevents cross-request contamination because
--   every request uses a fresh transaction with BEGIN / SET LOCAL.
--
--   BYPASSRLS safety check inherited from migration 0044 ensures sensible_app_role
--   cannot skip RLS regardless of the policy contents.
--
-- Rollback: see 0046_platform_admin_rls_rollback.sql
-- =============================================================================

SET TIME ZONE 'UTC';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create billing.is_platform_admin()
--    Reads app.is_platform_admin session variable (set by withDatabaseContext).
--    Returns false if the variable is absent or empty — fails closed.
-- ─────────────────────────────────────────────────────────────────────────────
-- PostgreSQL requires the new function owner to have CREATE on the containing
-- schema before ALTER FUNCTION ... OWNER can succeed. USAGE remains necessary
-- for FK/RLS work performed as the table owner; CREATE is revoked immediately.
GRANT USAGE, CREATE ON SCHEMA billing TO sensible_rls_owner;

CREATE OR REPLACE FUNCTION billing.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(
    nullif(pg_catalog.current_setting('app.is_platform_admin', true), '')::boolean,
    false
  )
$$;

ALTER FUNCTION billing.is_platform_admin() OWNER TO sensible_rls_owner;
REVOKE CREATE ON SCHEMA billing FROM sensible_rls_owner;
REVOKE ALL ON FUNCTION billing.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing.is_platform_admin() TO sensible_app_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace permissive rate_cards policies with platform-admin-only policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove the Phase 9 permissive policies
DROP POLICY IF EXISTS rate_cards_insert ON billing.rate_cards;
DROP POLICY IF EXISTS rate_cards_update ON billing.rate_cards;

-- INSERT: requires billing.is_platform_admin()
CREATE POLICY rate_cards_insert ON billing.rate_cards FOR INSERT
  WITH CHECK (billing.is_platform_admin());

-- UPDATE: requires billing.is_platform_admin()
CREATE POLICY rate_cards_update ON billing.rate_cards FOR UPDATE
  USING (billing.is_platform_admin())
  WITH CHECK (billing.is_platform_admin());

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
