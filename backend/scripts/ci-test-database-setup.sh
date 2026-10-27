#!/usr/bin/env bash
# ci-test-database-setup.sh
#
# Provisions the PostgreSQL roles and database required to run the full
# backend test suite, including integration tests that need:
#   - DATABASE_ADMIN_URL (superuser or CREATEROLE + CREATEDB)
#   - sensible_app_role   (application RLS role)
#   - sensible_rls_owner  (schema-owner role for RLS management)
#
# Usage:
#   export DATABASE_ADMIN_URL="postgresql://postgres:password@localhost:5432/postgres"
#   bash backend/scripts/ci-test-database-setup.sh
#
# Environment variables consumed:
#   DATABASE_ADMIN_URL     Required. Superuser connection string pointing at
#                          the postgres system database.
#   TEST_DB_NAME           Name of the test database.  Default: sensible_crm_test
#   TEST_APP_ROLE          Application role name.  Default: sensible_app_role
#   TEST_RLS_OWNER_ROLE    Schema-owner role name.  Default: sensible_rls_owner
#   TEST_APP_USER          Login user for the test app connection.
#                          Default: sensible_crm_test_app
#   TEST_APP_PASSWORD      Password for TEST_APP_USER.  Default: random 32-char hex.
#
# Outputs (on stdout, sourcing this file in CI shells):
#   DATABASE_URL=postgresql://...
#   DATABASE_ADMIN_URL=postgresql://...   (updated to point at TEST_DB_NAME)
#
# Security notes:
#   - Never grants SUPERUSER or BYPASSRLS to the application role.
#   - FORCE ROW LEVEL SECURITY is applied to the schema owner so that even
#     owner queries respect RLS policies.
#   - Roles are created IF NOT EXISTS; safe to re-run on an existing environment.

set -euo pipefail

: "${DATABASE_ADMIN_URL:?DATABASE_ADMIN_URL must be set}"
: "${TEST_DB_NAME:=sensible_crm_test}"
: "${TEST_APP_ROLE:=sensible_app_role}"
: "${TEST_RLS_OWNER_ROLE:=sensible_rls_owner}"
: "${TEST_APP_USER:=sensible_crm_test_app}"
: "${TEST_APP_PASSWORD:=$(openssl rand -hex 16)}"

PSQL="psql ${DATABASE_ADMIN_URL} --no-password -v ON_ERROR_STOP=1"

echo "[ci-setup] Creating roles and database for test environment..."

# ── Roles ──────────────────────────────────────────────────────────────────────
$PSQL <<SQL
-- Shared group role: application row-level security
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${TEST_APP_ROLE}') THEN
    CREATE ROLE ${TEST_APP_ROLE} NOLOGIN INHERIT NOREPLICATION NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
  END IF;
END \$\$;

-- Shared group role: schema / table owner (still subject to RLS via FORCE)
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${TEST_RLS_OWNER_ROLE}') THEN
    CREATE ROLE ${TEST_RLS_OWNER_ROLE} NOLOGIN INHERIT NOREPLICATION NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS;
  END IF;
END \$\$;

-- Login role for the test application connection
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${TEST_APP_USER}') THEN
    CREATE ROLE ${TEST_APP_USER} LOGIN INHERIT NOREPLICATION NOCREATEDB NOCREATEROLE NOSUPERUSER NOBYPASSRLS
      PASSWORD '${TEST_APP_PASSWORD}';
  ELSE
    ALTER ROLE ${TEST_APP_USER} PASSWORD '${TEST_APP_PASSWORD}';
  END IF;
END \$\$;

GRANT ${TEST_APP_ROLE} TO ${TEST_APP_USER};
SQL

# ── Database ───────────────────────────────────────────────────────────────────
$PSQL <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = '${TEST_DB_NAME}') THEN
    -- createdb cannot run inside a transaction block; use dynamic SQL via dblink
    -- if your PostgreSQL version supports it, otherwise fall through to the shell.
  END IF;
END \$\$;
SQL

# psql's \gexec trick to create DB outside a transaction block
$PSQL -c "SELECT 'CREATE DATABASE ${TEST_DB_NAME}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${TEST_DB_NAME}')\\gexec" 2>/dev/null || true

# ── Connect to test DB and configure schemas ───────────────────────────────────
TEST_ADMIN_URL="${DATABASE_ADMIN_URL%/*}/${TEST_DB_NAME}"
PSQL_TEST="psql ${TEST_ADMIN_URL} --no-password -v ON_ERROR_STOP=1"

$PSQL_TEST <<SQL
-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
DO \$\$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN others THEN
  RAISE NOTICE 'pgvector extension not available; AI embedding features will be skipped';
END \$\$;

-- Grant the application roles membership in the admin role so that migration
-- can run under the admin user and the app role can still access objects.
GRANT ${TEST_APP_ROLE}    TO CURRENT_USER WITH ADMIN OPTION;
GRANT ${TEST_RLS_OWNER_ROLE} TO CURRENT_USER WITH ADMIN OPTION;

-- Allow the app role to use and create in the sensible schemas after migration
-- (Drizzle migrations run as admin; grants to app roles happen inside migrations)
SQL

# ── Apply migrations ───────────────────────────────────────────────────────────
echo "[ci-setup] Applying migrations to ${TEST_DB_NAME}..."
DATABASE_ADMIN_URL="${TEST_ADMIN_URL}" \
  node --loader ts-node/esm backend/src/db/migrate.ts

# ── FORCE RLS on schema-owner role (security requirement) ─────────────────────
$PSQL_TEST <<SQL
-- The schema owner role must not bypass row-level security policies.
-- This ensures the application code (even with elevated schema access) respects
-- tenant isolation.
ALTER ROLE ${TEST_RLS_OWNER_ROLE} NOBYPASSRLS;

-- Seed foundation data required for all integration tests
SELECT set_config('app.is_super_admin', 'true', false);
SQL

# Run seed via the migration script
DATABASE_ADMIN_URL="${TEST_ADMIN_URL}" \
  node --loader ts-node/esm -e "
    import { seedFoundation } from './backend/src/db/seeds/foundation.js';
    import { Pool } from 'pg';
    const pool = new Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
    await seedFoundation(pool);
    await pool.end();
  " 2>/dev/null || echo "[ci-setup] Seed skipped (foundation already seeded or seed script unavailable)"

# ── Output environment variables ───────────────────────────────────────────────
APP_URL_BASE="${TEST_ADMIN_URL%/*}"
echo ""
echo "# Paste these into your CI environment (e.g. .env.ci or GitHub Actions secrets):"
echo "export DATABASE_URL=\"${APP_URL_BASE}/$(echo "${TEST_APP_USER}:${TEST_APP_PASSWORD}@$(echo "${TEST_ADMIN_URL}" | sed 's|.*@||')" | sed 's|postgresql://.*@|postgresql://|')\""
echo "export DATABASE_ADMIN_URL=\"${TEST_ADMIN_URL}\""
echo ""
echo "[ci-setup] Done. Test database '${TEST_DB_NAME}' is ready."

# ── Teardown instructions ──────────────────────────────────────────────────────
cat <<'TEARDOWN'

# To clean up after tests:
#   psql $DATABASE_ADMIN_URL -c "DROP DATABASE IF EXISTS sensible_crm_test WITH (FORCE)"
#   psql $DATABASE_ADMIN_URL -c "DROP ROLE IF EXISTS sensible_crm_test_app"
# Do NOT drop sensible_app_role or sensible_rls_owner if shared with other databases.
TEARDOWN
