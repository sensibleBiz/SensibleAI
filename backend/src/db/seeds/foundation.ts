import type { Pool } from "pg";

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
] as const;

export const seedFoundation = async (pool: Pool) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.is_super_admin', 'true', true)");
    for (const [key, description] of FOUNDATION_PERMISSIONS) {
      await client.query(
        `INSERT INTO iam.permissions (permission_key, description)
         VALUES ($1, $2)
         ON CONFLICT (permission_key) DO UPDATE SET description = EXCLUDED.description`,
        [key, description],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
