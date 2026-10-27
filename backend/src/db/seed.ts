import { Pool } from "pg";
import { env } from "../config/env.js";
import { seedFoundation } from "./seeds/foundation.js";

const connectionString = env.database.adminUrl;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL is required for foundation seeding");

const pool = new Pool({ connectionString, max: 1, application_name: "sensible-crm-seeder" });
try {
  await seedFoundation(pool);
  console.log("Foundation seed completed");
} finally {
  await pool.end();
}
