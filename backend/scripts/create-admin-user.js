import pg from 'pg';
import argon2 from 'argon2';

const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://sensible_crm_app:Sensible%402016@34.47.221.74:5432/sensible-database',
  ssl: { rejectUnauthorized: false }
});

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 4,
};

const FOUNDATION_PERMISSIONS = [
  ["outlets.read", "View authorized outlets"],
  ["outlets.manage", "Manage outlets within an administered tenant"],
  ["members.manage", "Manage memberships within an administered tenant"],
  ["customers.read", "View PostgreSQL customers"],
  ["customers.create", "Create PostgreSQL customers"],
  ["customers.update", "Update PostgreSQL customers"],
  ["customers.archive", "Mark PostgreSQL customers inactive"],
  ["team.read", "View PostgreSQL team members"],
  ["team.manage", "Manage PostgreSQL team memberships"],
  ["users.create", "Provision PostgreSQL users"],
  ["leads.read", "View PostgreSQL leads"],
  ["leads.manage", "Manage PostgreSQL leads"],
];

const email = 'admin@sensible.biz';
const password = 'Sensible@2026';
const displayName = 'Sensible Administrator';
const tenantName = 'Sensible Connect';
const tenantSlug = 'sensible-connect';
const outletName = 'Sensible HQ';
const outletCode = 'HQ';

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.is_super_admin = 'true'");

    console.log("1. Seeding permissions...");
    for (const [key, description] of FOUNDATION_PERMISSIONS) {
      await client.query(
        `INSERT INTO iam.permissions (permission_key, description)
         VALUES ($1, $2)
         ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description`,
        [key, description]
      );
    }

    console.log("2. Upserting tenant...");
    const tenantRes = await client.query(`
      INSERT INTO tenancy.tenants (name, slug)
      VALUES ($1, $2)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
      RETURNING id
    `, [tenantName, tenantSlug]);
    const tenantId = tenantRes.rows[0].id;
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);

    console.log("3. Upserting business...");
    const businessRes = await client.query(`
      WITH existing AS (
        SELECT id FROM tenancy.businesses WHERE tenant_id = $1 AND name = $2 LIMIT 1
      ), inserted AS (
        INSERT INTO tenancy.businesses (tenant_id, name)
        SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id
      )
      SELECT id FROM inserted UNION ALL SELECT id FROM existing LIMIT 1
    `, [tenantId, tenantName]);
    const businessId = businessRes.rows[0].id;

    console.log("4. Upserting outlet...");
    const outletRes = await client.query(`
      INSERT INTO tenancy.outlets (tenant_id, business_id, outlet_code, name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id, outlet_code)
      DO UPDATE SET business_id = EXCLUDED.business_id, name = EXCLUDED.name, active = true, updated_at = now()
      RETURNING id
    `, [tenantId, businessId, outletCode, outletName]);
    const outletId = outletRes.rows[0].id;

    console.log("5. Upserting user (plain insert)...");
    let userId;
    const existingUser = await client.query("SELECT id FROM iam.users WHERE email = $1", [email]);
    if (existingUser.rows.length > 0) {
      userId = existingUser.rows[0].id;
      await client.query("UPDATE iam.users SET display_name = $1 WHERE id = $2", [displayName, userId]);
      console.log("User updated:", userId);
    } else {
      const newUser = await client.query(
        "INSERT INTO iam.users (email, display_name) VALUES ($1, $2) RETURNING id",
        [email, displayName]
      );
      userId = newUser.rows[0].id;
      console.log("Created user:", userId);
    }

    console.log("6. Adding tenant membership...");
    await client.query(`
      INSERT INTO tenancy.tenant_memberships (tenant_id, user_id, is_tenant_admin)
      VALUES ($1, $2, true)
      ON CONFLICT (tenant_id, user_id)
      DO UPDATE SET active = true, is_tenant_admin = true, updated_at = now()
    `, [tenantId, userId]);

    await client.query(`SET LOCAL app.current_user_id = '${userId}'`);

    console.log("7. Hashing password and storing credentials...");
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    await client.query(`
      INSERT INTO iam.user_credentials
        (user_id, password_hash, state, password_changed_at, refresh_token_version)
      VALUES ($1, $2, 'argon2id', now(), 0)
      ON CONFLICT (user_id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash, state = 'argon2id',
        password_changed_at = now(), refresh_token_version = 0,
        failed_attempts = 0, locked_until = NULL, updated_at = now()
    `, [userId, passwordHash]);

    console.log("8. Adding role...");
    const roleRes = await client.query(`
      INSERT INTO iam.roles (tenant_id, name, description)
      VALUES ($1, 'super-admin', 'Super Administrator with full permissions')
      ON CONFLICT (tenant_id, name)
      DO UPDATE SET active = true, description = EXCLUDED.description, updated_at = now()
      RETURNING id
    `, [tenantId]);
    const roleId = roleRes.rows[0].id;

    console.log("9. Granting role permissions...");
    await client.query(`
      INSERT INTO iam.role_permissions (tenant_id, role_id, permission_id)
      SELECT $1, $2, permission.id FROM iam.permissions permission
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `, [tenantId, roleId]);

    console.log("10. Assigning outlet...");
    await client.query(`
      INSERT INTO tenancy.outlet_assignments (tenant_id, outlet_id, user_id, role_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (outlet_id, user_id, role_id) DO UPDATE SET active = true, updated_at = now()
    `, [tenantId, outletId, userId, roleId]);

    await client.query("COMMIT");
    console.log(`\n🎉 SUCCESS! Admin user provisioned:\nEmail: ${email}\nPassword: ${password}\nOutlet: ${outletName} (${outletId})`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error creating admin user:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
