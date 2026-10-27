import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  derivePermissionKeys,
  PostgresAccessControlRepository,
  resolvePermissionUserRole,
} from "../src/modules/authorization/postgresAccessControl.repository.js";
import type { TransactionDatabase } from "../src/db/context.js";
import { postgresPermissionCreateSchema } from "../src/modules/authorization/postgresAccessControl.validator.js";

test("B10 PostgreSQL access-control router is mounted; legacy router removed", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(routes, /apiRouter\.use\("\/access-control", postgresAccessControlRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/access-control", accessControlRouter\)/);
});

test("B10 migration defines access-control admin tables, RLS, and permissions", async () => {
  const migration = await readFile(
    new URL("../migrations/0015_phase_b10_access_control_admin.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE iam\.user_outlet_permissions/);
  assert.match(migration, /CREATE TABLE iam\.user_outlet_department_access/);
  assert.match(migration, /CREATE TABLE tenancy\.outlet_feature_configs/);
  assert.match(migration, /CREATE TABLE iam\.access_control_audit/);
  assert.match(migration, /access_control\.permissions\.view/);
  assert.match(migration, /access_control\.users\.manage/);
  assert.match(migration, /access_control\.features\.manage/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /backfill|\betl\b|firestore/i);
});

test("B10 postgres access-control modules do not import Firestore", async () => {
  const files = [
    "../src/modules/authorization/postgresAccessControl.repository.ts",
    "../src/modules/authorization/postgresAccessControl.service.ts",
    "../src/modules/authorization/postgresAccessControl.controller.ts",
    "../src/modules/authorization/postgresAccessControl.routes.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /firebase-admin|firestore|accessControl\.repository/);
  }
});

test("B10 permission keys map CRM catalog keys onto PostgreSQL runtime keys", () => {
  assert.deepEqual(derivePermissionKeys("CRM_LEADS_VIEW"), {
    permissionKey: "leads.view",
    catalogKey: "CRM_LEADS_VIEW",
  });
  assert.deepEqual(derivePermissionKeys("expense.read"), {
    permissionKey: "expense.read",
    catalogKey: "CRM_EXPENSE_READ",
  });
});

test("B10 postgres permission create accepts CRM and dotted keys", () => {
  const outletId = "01994abc-0000-7000-8000-000000000021";
  assert.equal(postgresPermissionCreateSchema.safeParse({
    outletId,
    key: "CRM_B10_CUSTOM",
    label: "Custom",
    description: "Custom permission",
    category: "Tests",
  }).success, true);
  assert.equal(postgresPermissionCreateSchema.safeParse({
    outletId,
    key: "access_control.users.view",
    label: "View users",
    description: "View users",
    category: "Permissions",
  }).success, true);
  assert.equal(postgresPermissionCreateSchema.safeParse({
    outletId,
    key: "crm/leads",
    label: "Bad",
    description: "Bad",
    category: "Tests",
  }).success, false);
});

test("B10 permission users fall back from technical IAM roles to canonical profile roles", () => {
  assert.equal(resolvePermissionUserRole("USER", "demo-admin"), "USER");
  assert.equal(resolvePermissionUserRole("USER", "MANAGER"), "MANAGER");
  assert.equal(resolvePermissionUserRole(null, "unknown-role"), "USER");
});

test("B10 user access rejects unknown permission keys before replacing grants", async () => {
  const statements: string[] = [];
  const database = {
    client: {
      query: async (text: string) => {
        statements.push(text);
        return { rows: [], rowCount: 0 };
      },
    },
  } as unknown as TransactionDatabase;
  const repository = new PostgresAccessControlRepository();

  await assert.rejects(
    repository.updateUserAccess(
      database,
      "tenant",
      "actor",
      "user",
      {
        outletId: "outlet",
        role: "USER",
        departmentAccessList: [],
        outletPermissions: ["CRM_NOT_IN_CATALOG"],
      },
      "USER",
    ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "INVALID_PERMISSION_KEYS",
  );
  assert.equal(statements.length, 1);
  assert.doesNotMatch(statements[0]!, /DELETE|UPDATE|INSERT/);
});

test("B10 permission editor uses PostgreSQL-aware Super Admin access", async () => {
  const source = await readFile(
    new URL("../../src/features/access-control/pages/editPermession.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /isSuperAdmin: hasSuperAdminAccess/);
  assert.match(source, /currentUserIsSuperAdmin = hasSuperAdminAccess/);
  assert.doesNotMatch(source, /currentUserIsSuperAdmin = isSuperAdminRole\(currentRole\)/);
});
