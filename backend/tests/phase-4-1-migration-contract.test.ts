import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const migrationPath = path.resolve(process.cwd(), "migrations/0001_phase_4_1_foundation.sql");

test("Phase 4.1 migration declares every required extension, table, and forced RLS boundary", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const extension of ['"uuid-ossp"', "pgcrypto", "ltree"]) {
    assert.match(sql, new RegExp(`CREATE EXTENSION IF NOT EXISTS ${extension.replace(/["-]/g, "\\$&")}`, "i"));
  }
  assert.match(sql, /pg_available_extensions/i);
  assert.match(sql, /ARRAY\['postgis', 'vector'\]/i);
  for (const schema of ["iam", "tenancy"]) assert.match(sql, new RegExp(`CREATE SCHEMA IF NOT EXISTS ${schema}`, "i"));
  for (const table of [
    "tenancy.tenants", "tenancy.businesses", "tenancy.outlets", "iam.permissions", "iam.roles",
    "iam.role_permissions", "iam.users", "iam.user_credentials", "tenancy.tenant_memberships",
    "tenancy.outlet_assignments", "tenancy.outlet_features",
  ]) assert.match(sql, new RegExp(`CREATE TABLE ${table.replace(".", "\\.")}`, "i"));
  for (const table of [
    "tenancy.tenants", "tenancy.businesses", "tenancy.outlets", "iam.roles", "iam.role_permissions",
    "iam.users", "iam.user_credentials", "tenancy.tenant_memberships", "tenancy.outlet_assignments",
    "tenancy.outlet_features",
  ]) assert.match(sql, new RegExp(`ALTER TABLE ${table.replace(".", "\\.")} FORCE ROW LEVEL SECURITY`, "i"));
  assert.match(sql, /sensible_app_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS/i);
  assert.match(sql, /FOREIGN KEY \(tenant_id, outlet_id\)/i);
  assert.match(sql, /FOREIGN KEY \(tenant_id, user_id\)/i);
  assert.match(sql, /FOREIGN KEY \(tenant_id, role_id\)/i);
  assert.doesNotMatch(sql, /plaintext_password|legacy_password\s+(text|varchar)/i);
});
