\set ON_ERROR_STOP on

BEGIN;

DO $owner_check$
DECLARE
  deployed_owner text;
BEGIN
  SELECT owner.rolname
  INTO deployed_owner
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_roles owner ON owner.oid = procedure.proowner
  WHERE namespace.nspname = 'iam'
    AND procedure.proname = 'bootstrap_phone_onboarding'
    AND procedure.proargtypes = '25 25 25 25 25 25 25 25 25'::oidvector;

  IF deployed_owner IS NULL THEN
    RAISE EXCEPTION 'iam.bootstrap_phone_onboarding(text,text,text,text,text,text,text,text,text) was not found';
  END IF;

  IF deployed_owner <> 'sensible_rls_owner' THEN
    RAISE EXCEPTION
      'Unexpected onboarding function owner: expected sensible_rls_owner, found %',
      deployed_owner;
  END IF;
END
$owner_check$;

-- The migration owner owns the deployed tables. The operator executing this
-- repair must be a database administrator that can assume crm_migrator.
SET LOCAL ROLE crm_migrator;

GRANT INSERT ON TABLE
  tenancy.tenants,
  tenancy.businesses,
  iam.users,
  iam.user_credentials,
  tenancy.tenant_memberships,
  iam.roles,
  iam.role_permissions,
  tenancy.outlets,
  tenancy.outlet_assignments,
  crm.user_profiles,
  crm.team_memberships,
  tenancy.outlet_features,
  tenancy.outlet_subscriptions,
  tenancy.plan_catalogs
TO sensible_rls_owner;

RESET ROLE;

DO $permission_check$
DECLARE
  missing_insert_privileges text[];
BEGIN
  WITH required_tables(schema_name, table_name) AS (
    VALUES
      ('tenancy', 'tenants'),
      ('tenancy', 'businesses'),
      ('iam', 'users'),
      ('iam', 'user_credentials'),
      ('tenancy', 'tenant_memberships'),
      ('iam', 'roles'),
      ('iam', 'role_permissions'),
      ('tenancy', 'outlets'),
      ('tenancy', 'outlet_assignments'),
      ('crm', 'user_profiles'),
      ('crm', 'team_memberships'),
      ('tenancy', 'outlet_features'),
      ('tenancy', 'outlet_subscriptions'),
      ('tenancy', 'plan_catalogs')
  )
  SELECT array_agg(format('%I.%I', required.schema_name, required.table_name)
                   ORDER BY required.schema_name, required.table_name)
  INTO missing_insert_privileges
  FROM required_tables required
  JOIN pg_namespace namespace ON namespace.nspname = required.schema_name
  JOIN pg_class relation ON relation.relnamespace = namespace.oid
                        AND relation.relname = required.table_name
  WHERE NOT has_table_privilege('sensible_rls_owner', relation.oid, 'INSERT');

  IF missing_insert_privileges IS NOT NULL THEN
    RAISE EXCEPTION
      'sensible_rls_owner still lacks INSERT on: %',
      array_to_string(missing_insert_privileges, ', ');
  END IF;
END
$permission_check$;

COMMIT;
