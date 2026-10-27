import "../src/config/env.js";
import { env } from "../src/config/env.js";
import pg from "pg";

const pool = new pg.Pool({ connectionString: env.database.adminUrl! });
const client = await pool.connect();

// Try setting is_super_admin to see if that bypasses RLS
await client.query("SET app.is_super_admin = 'true'");
await client.query("SET app.current_tenant_id = '00000000-0000-0000-0000-000000000000'");
await client.query("SET app.current_user_id = '00000000-0000-0000-0000-000000000000'");

const { rows: tenants } = await client.query(`SELECT id, name FROM tenancy.tenants LIMIT 5`);
console.log("Tenants after super_admin:", tenants);

const { rows: users } = await client.query(`SELECT id, email FROM iam.users LIMIT 5`);
console.log("Users after super_admin:", users);

// Check RLS policies on leads table
const { rows: policies } = await client.query(`
  SELECT tablename, policyname, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'crm' AND tablename = 'leads'
`);
console.log("\nRLS policies on crm.leads:", JSON.stringify(policies, null, 2));

// Check if crm_migrator has bypassrls
const { rows: role } = await client.query(`
  SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
`);
console.log("\nCurrent user role:", role);

client.release();
await pool.end();
