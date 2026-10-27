-- Rollback for migration 0046_platform_admin_rls
-- Removes the Phase 10 policies without restoring Phase 9's permissive global
-- writes. A rollback fails closed: rate cards remain readable, but application-
-- role mutations stay disabled until a reviewed replacement policy is applied.

SET TIME ZONE 'UTC';

DROP POLICY IF EXISTS rate_cards_insert ON billing.rate_cards;
DROP POLICY IF EXISTS rate_cards_update ON billing.rate_cards;

REVOKE INSERT, UPDATE ON billing.rate_cards FROM sensible_app_role;

-- Drop the function (created in 0046)
DROP FUNCTION IF EXISTS billing.is_platform_admin();
