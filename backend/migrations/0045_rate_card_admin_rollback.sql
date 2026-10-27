-- Rollback for migration 0045_rate_card_admin
-- Removes INSERT/UPDATE grants and the two new RLS policies.

SET TIME ZONE 'UTC';

DROP POLICY IF EXISTS rate_cards_insert ON billing.rate_cards;
DROP POLICY IF EXISTS rate_cards_update ON billing.rate_cards;

REVOKE INSERT, UPDATE ON billing.rate_cards FROM sensible_app_role;
