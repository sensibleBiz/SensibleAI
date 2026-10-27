import { Pool } from "pg";
import { env } from "../src/config/env.js";

const REQUIRED_EXTENSIONS = ["uuid-ossp", "pgcrypto", "postgis", "vector", "ltree"] as const;

const connectionString = env.database.adminUrl ?? env.database.url;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

const pool = new Pool({ connectionString, max: 1, application_name: "sensible-crm-extension-check" });

try {
  const server = await pool.query<{ version: string }>("SELECT version()");
  const extensions = await pool.query<{
    name: string;
    default_version: string | null;
    installed_version: string | null;
  }>(
    `SELECT name, default_version, installed_version
     FROM pg_available_extensions
     WHERE name = ANY($1::text[])
     ORDER BY name`,
    [REQUIRED_EXTENSIONS],
  );
  const available = new Map(extensions.rows.map((extension) => [extension.name, extension]));
  const result = REQUIRED_EXTENSIONS.map((name) => ({
    name,
    available: available.has(name),
    installed: available.get(name)?.installed_version ?? null,
    defaultVersion: available.get(name)?.default_version ?? null,
  }));
  console.log(server.rows[0]?.version ?? "Unknown PostgreSQL version");
  console.table(result);
  if (result.some((extension) => !extension.available)) process.exitCode = 1;
} finally {
  await pool.end();
}
