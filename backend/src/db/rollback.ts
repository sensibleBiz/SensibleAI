/**
 * Migration rollback runner.
 *
 * Usage:  tsx src/db/rollback.ts <migration-prefix>
 * Example: tsx src/db/rollback.ts 0038
 *
 * Finds migrations/<prefix>*_rollback.sql, splits it into individual
 * statements, and executes them one-by-one so that DROP INDEX CONCURRENTLY
 * (which cannot run inside a transaction) works correctly.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { env } from "../config/env.js";

const prefix = process.argv[2];
if (!prefix) {
  console.error("Usage: tsx src/db/rollback.ts <migration-prefix>  (e.g. 0038)");
  process.exit(1);
}

const connectionString = env.database.adminUrl ?? env.database.url;
if (!connectionString) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../migrations",
);

const files = await readdir(migrationsDir);
const rollbackFile = files.find(
  (f) => f.startsWith(prefix) && f.endsWith("_rollback.sql"),
);

if (!rollbackFile) {
  console.error(`No rollback file found for prefix "${prefix}" in ${migrationsDir}`);
  console.error("Available rollback files:", files.filter((f) => f.endsWith("_rollback.sql")).join(", "));
  process.exit(1);
}

const rollbackPath = path.join(migrationsDir, rollbackFile);
console.log(`Running rollback: ${rollbackFile}`);

const sql = await readFile(rollbackPath, "utf8");

// Split on semicolons that are NOT inside a $$ dollar-quote block.
// Simple heuristic: split on ";\n" and skip blank/comment-only segments.
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

const pool = new Pool({
  connectionString,
  max: 1,
  application_name: "sensible-crm-rollback",
});

try {
  for (const statement of statements) {
    const preview = statement.slice(0, 80).replace(/\s+/g, " ");
    console.log(`  Executing: ${preview}...`);
    await pool.query(statement);
  }
  console.log(`Rollback complete: ${rollbackFile}`);
} finally {
  await pool.end();
}
