import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "../config/env.js";

const connectionString = env.database.adminUrl ?? env.database.url;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

const pool = new Pool({ connectionString, max: 1, application_name: "sensible-crm-migrator" });
const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");

try {
  // Later migrations seed permission rows after RLS is enabled. The migration
  // connection is privileged and single-use, so declare its policy context for
  // this session without weakening application connections.
  await pool.query(`SELECT set_config('app.is_super_admin', 'true', false)`);
  await migrate(drizzle(pool), { migrationsFolder });
  if (env.database.url && env.database.adminUrl) {
    const applicationPool = new Pool({ connectionString: env.database.url, max: 1 });
    try {
      const applicationRole = await applicationPool.query<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolinherit: boolean;
      }>(`
        SELECT current_user, role.rolsuper, role.rolbypassrls, role.rolinherit
        FROM pg_roles role WHERE role.rolname = current_user
      `);
      const role = applicationRole.rows[0];
      if (!role || role.rolsuper || role.rolbypassrls) {
        throw new Error("DATABASE_URL must not use a superuser or BYPASSRLS role");
      }
      const quotedRole = `"${role.current_user.replaceAll('"', '""')}"`;
      if (!role.rolinherit) {
        await pool.query(`ALTER ROLE ${quotedRole} INHERIT`);
      }
      await pool.query(`GRANT sensible_app_role TO ${quotedRole}`);
    } finally {
      await applicationPool.end();
    }
  }
  console.log("Database migrations completed");
} finally {
  await pool.end();
}
