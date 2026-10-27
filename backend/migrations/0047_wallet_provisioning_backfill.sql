-- Phase 11: guarantee one zero-balance INR credit wallet for every existing outlet.
-- New outlets are provisioned transactionally by postgresOutletService.create.

-- Keep the RLS table owner able to resolve billing objects even when upgrading a
-- database whose earlier 0044 migration predates the owner-USAGE correction.
GRANT USAGE ON SCHEMA billing TO sensible_rls_owner;

-- wallets has FORCE ROW LEVEL SECURITY and its application INSERT policy is
-- tenant-scoped. Run this cross-tenant maintenance backfill as its trusted
-- BYPASSRLS table owner, not as the migration login's arbitrary GUC context.
SET LOCAL ROLE sensible_rls_owner;

INSERT INTO billing.wallets (tenant_id, outlet_id, currency)
SELECT outlet.tenant_id, outlet.id, 'INR'
FROM tenancy.outlets AS outlet
ON CONFLICT (tenant_id, outlet_id) DO NOTHING;

RESET ROLE;
