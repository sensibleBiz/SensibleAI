-- Rollback for migration 0044: Credit billing schema
-- Drop tables in reverse dependency order.
-- wallet_transactions and usage_events reference wallets, so drop them first.
-- top_up_orders references both wallets and wallet_transactions.
-- CASCADE handles any view or index dependencies.

DROP TABLE IF EXISTS billing.top_up_orders CASCADE;
DROP TABLE IF EXISTS billing.usage_events CASCADE;
DROP TABLE IF EXISTS billing.wallet_transactions CASCADE;
DROP TABLE IF EXISTS billing.wallets CASCADE;
DROP TABLE IF EXISTS billing.rate_cards CASCADE;

DROP SCHEMA IF EXISTS billing;

-- Keep billing.* permissions so any role assignments survive rollback.
-- Remove them only if re-running from scratch:
-- DELETE FROM iam.permissions WHERE permission_key IN (
--   'billing.read', 'billing.topup', 'billing.admin'
-- );
