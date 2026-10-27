import argon2 from "argon2";
import { Pool, type PoolClient } from "pg";
import { env } from "../config/env.js";
import { ARGON2_OPTIONS } from "../modules/auth/auth.service.js";
import { seedFoundation } from "./seeds/foundation.js";

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the development auth seed`);
  return value;
};

const oneId = async (client: PoolClient, query: string, values: unknown[]) => {
  const result = await client.query<{ id: string }>(query, values);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Development auth seed did not return an id");
  return id;
};

if (env.nodeEnv === "production") {
  throw new Error("The development auth seed cannot run in production");
}
if (!env.database.adminUrl) {
  throw new Error("DATABASE_ADMIN_URL is required for the development auth seed");
}

const email = required("POSTGRES_DEV_USER_EMAIL").toLowerCase();
const password = required("POSTGRES_DEV_USER_PASSWORD");
const displayName = process.env.POSTGRES_DEV_USER_NAME?.trim() || "PostgreSQL Developer";
const tenantName = process.env.POSTGRES_DEV_TENANT_NAME?.trim() || "PostgreSQL Development";
const tenantSlug = process.env.POSTGRES_DEV_TENANT_SLUG?.trim() || "postgres-development";
const outletName = process.env.POSTGRES_DEV_OUTLET_NAME?.trim() || "Development Outlet";
const outletCode = process.env.POSTGRES_DEV_OUTLET_CODE?.trim().toUpperCase() || "DEV";
const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
const pool = new Pool({
  connectionString: env.database.adminUrl,
  max: 1,
  application_name: "sensible-crm-development-auth-seed",
});

try {
  await seedFoundation(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sensible_dev_seed_role') THEN
          CREATE ROLE sensible_dev_seed_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
        END IF;
      END $$;
      GRANT sensible_dev_seed_role TO CURRENT_USER;
      GRANT USAGE ON SCHEMA iam, tenancy, crm TO sensible_dev_seed_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA iam, tenancy, crm TO sensible_dev_seed_role;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA iam, tenancy, crm TO sensible_dev_seed_role;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA iam, tenancy, crm TO sensible_dev_seed_role;
      SET LOCAL ROLE sensible_dev_seed_role;
    `);
    await client.query("SELECT set_config('app.is_super_admin', 'true', true)");
    const tenantId = await oneId(client, `
      INSERT INTO tenancy.tenants (name, slug)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
      RETURNING id
    `, [tenantName, tenantSlug]);
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantId]);
    const businessId = await oneId(client, `
      WITH existing AS (
        SELECT id FROM tenancy.businesses WHERE tenant_id = $1 AND name = $2 LIMIT 1
      ), inserted AS (
        INSERT INTO tenancy.businesses (tenant_id, name)
        SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id
      )
      SELECT id FROM inserted UNION ALL SELECT id FROM existing LIMIT 1
    `, [tenantId, tenantName]);
    const outletId = await oneId(client, `
      INSERT INTO tenancy.outlets (tenant_id, business_id, outlet_code, name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, outlet_code)
      DO UPDATE SET business_id = EXCLUDED.business_id, name = EXCLUDED.name, active = true, updated_at = now()
      RETURNING id
    `, [tenantId, businessId, outletCode, outletName]);
    const userId = await oneId(client, `
      INSERT INTO iam.users (email, display_name)
      VALUES ($1, $2)
      ON CONFLICT (email) WHERE email IS NOT NULL
      DO UPDATE SET display_name = EXCLUDED.display_name, active = true, updated_at = now()
      RETURNING id
    `, [email, displayName]);
    await client.query(`
      INSERT INTO iam.user_credentials
        (user_id, password_hash, state, password_changed_at, refresh_token_version)
      VALUES ($1, $2, 'argon2id', now(), 0)
      ON CONFLICT (user_id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash, state = 'argon2id',
        password_changed_at = now(), refresh_token_version = 0,
        failed_attempts = 0, locked_until = NULL, updated_at = now()
    `, [userId, passwordHash]);
    await client.query(`
      INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin)
      VALUES ($1, $2, true)
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET active = true, is_tenant_admin = true, updated_at = now()
    `, [tenantId, userId]);
    const roleId = await oneId(client, `
      INSERT INTO iam.roles (tenant_id, name, description)
      VALUES ($1, 'phase-a-admin', 'Development-only Phase A administrator')
      ON CONFLICT (tenant_id, name)
      DO UPDATE SET active = true, description = EXCLUDED.description, updated_at = now()
      RETURNING id
    `, [tenantId]);
    await client.query(`
      INSERT INTO iam.role_permissions (tenant_id, role_id, permission_id)
      SELECT $1, $2, permission.id FROM iam.permissions permission
      WHERE permission.permission_key IN ('outlets.read', 'outlets.manage', 'members.manage')
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `, [tenantId, roleId]);
    await client.query(`
      INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (outlet_id, user_id, role_id) DO UPDATE SET active = true, updated_at = now()
    `, [tenantId, outletId, userId, roleId]);
    await client.query("COMMIT");
    console.log(`Development PostgreSQL auth identity ready for ${email}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
