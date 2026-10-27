-- =============================================================================
-- Migration 0049 Rollback: Drop accounts and exports schemas
-- =============================================================================

DROP SCHEMA IF EXISTS accounts CASCADE;
DROP SCHEMA IF EXISTS exports CASCADE;

DELETE FROM iam.permissions WHERE permission_key IN (
  'accounts.read',
  'accounts.vouchers.manage',
  'accounts.gst.invoices',
  'accounts.expenses.approve',
  'accounts.tally.sync',
  'exports.read',
  'exports.orders.manage',
  'exports.lc.manage',
  'exports.shipments.track'
);

