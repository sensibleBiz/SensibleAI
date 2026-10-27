import { Pool } from "pg";
import { env } from "../src/config/env.js";

const connectionString = env.database.adminUrl ?? env.database.url;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");
const pool = new Pool({
  connectionString,
  max: 1,
  application_name: "sensible-billing-readiness-audit",
});

const appPool = env.database.url
  ? new Pool({
      connectionString: env.database.url,
      max: 1,
      application_name: "sensible-billing-app-role-audit",
    })
  : null;

try {
  if (appPool) {
    const appIdentity = await appPool.query(`
      SELECT current_user AS database_user,
             role.rolsuper,
             role.rolbypassrls,
             role.rolinherit,
             role.rolcanlogin,
             pg_has_role(current_user, 'sensible_app_role', 'MEMBER') AS is_app_role_member
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `);
    console.table(appIdentity.rows);
  }

  const migrationState = await pool.query(`
    SELECT current_database() AS database_name,
           CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN 0
                ELSE (SELECT COUNT(*) FROM drizzle.__drizzle_migrations) END AS migration_count
  `);
  console.table(migrationState.rows);

  const roles = await pool.query(`
    SELECT role.rolname, role.rolsuper, role.rolbypassrls, role.rolinherit, role.rolcanlogin
    FROM pg_roles AS role
    WHERE role.rolname IN ('sensible_app_role', 'sensible_rls_owner')
    ORDER BY role.rolname
  `);
  console.table(roles.rows);

  const tables = await pool.query(`
    SELECT table_class.relname AS table_name,
           owner.rolname AS owner,
           table_class.relrowsecurity AS rls_enabled,
           table_class.relforcerowsecurity AS rls_forced
    FROM pg_class AS table_class
    JOIN pg_namespace AS namespace ON namespace.oid = table_class.relnamespace
    JOIN pg_roles AS owner ON owner.oid = table_class.relowner
    WHERE namespace.nspname = 'billing' AND table_class.relkind = 'r'
    ORDER BY table_class.relname
  `);
  console.table(tables.rows);

  const security = await pool.query(`
    SELECT has_schema_privilege('sensible_app_role', 'billing', 'USAGE') AS app_schema_usage,
           has_schema_privilege('sensible_rls_owner', 'billing', 'USAGE') AS owner_schema_usage,
           to_regprocedure('billing.is_platform_admin()') IS NOT NULL AS platform_admin_function,
           has_table_privilege('sensible_app_role', 'billing.rate_cards', 'INSERT') AS rate_insert_grant,
           has_table_privilege('sensible_app_role', 'billing.rate_cards', 'UPDATE') AS rate_update_grant,
           has_table_privilege('sensible_app_role', 'billing.rate_cards', 'DELETE') AS rate_delete_grant
  `);
  console.table(security.rows);

  const policies = await pool.query(`
    SELECT tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'billing'
    ORDER BY tablename, policyname
  `);
  console.table(policies.rows);

  const coverage = await pool.query(`
    SELECT (SELECT COUNT(*) FROM tenancy.outlets) AS outlets,
           (SELECT COUNT(*) FROM billing.wallets) AS wallets,
           (SELECT COUNT(*)
              FROM tenancy.outlets AS outlet
              LEFT JOIN billing.wallets AS wallet
                ON wallet.tenant_id = outlet.tenant_id AND wallet.outlet_id = outlet.id
             WHERE wallet.id IS NULL) AS outlets_without_wallet,
           (SELECT COUNT(*) FROM billing.rate_cards WHERE is_active) AS active_rate_cards,
           (SELECT COUNT(DISTINCT service_type) FROM billing.rate_cards WHERE is_active) AS priced_service_types
  `);
  console.table(coverage.rows);

  const invariants = await pool.query(`
    SELECT (SELECT COUNT(*) FROM billing.wallets
             WHERE balance_credits < 0 OR reserved_credits < 0 OR reserved_credits > balance_credits)
             AS invalid_wallets,
           (SELECT COUNT(*) FROM billing.top_up_orders
             WHERE (status = 'SUCCESS' AND (wallet_txn_id IS NULL OR paid_at IS NULL))
                OR (status <> 'SUCCESS' AND wallet_txn_id IS NOT NULL))
             AS invalid_top_up_orders,
           (SELECT COUNT(*) FROM billing.usage_events
             WHERE (status = 'BILLED' AND (billed_credits IS NULL OR wallet_txn_id IS NULL))
                OR (status <> 'BILLED' AND wallet_txn_id IS NOT NULL))
             AS invalid_usage_events
  `);
  console.table(invariants.rows);
} finally {
  await Promise.all([pool.end(), appPool?.end()]);
}
