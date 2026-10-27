import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const outletId = "487f6044-5f8e-7b89-87a0-b952bb81e625";

test("Team Tree access migration is restricted to the requested outlet", async () => {
  const migration = await readFile(
    new URL("../migrations/0029_enable_team_tree_for_outlet.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, new RegExp(outletId, "g"));
  assert.match(migration, /'team_tree', true/);
  assert.match(migration, /ON CONFLICT \(outlet_id, feature_key\)/);
  assert.match(migration, /permission\.permission_key = 'team\.read'/);
  assert.match(migration, /IN \('ADMIN', 'SUPERADMIN'\)/);
  assert.match(migration, /ON CONFLICT \(outlet_id, user_id, permission_id\) DO NOTHING/);
  assert.doesNotMatch(migration, /INSERT INTO iam\.role_permissions/);
});

test("Team Tree sidebar permission alias and feature gate stay aligned", async () => {
  const permissionHook = await readFile(
    new URL("../../src/features/access-control/hooks/usePermission.ts", import.meta.url),
    "utf8",
  );
  const sidebar = await readFile(
    new URL("../../src/shared/lib/sidebarMenuConfig.ts", import.meta.url),
    "utf8",
  );
  const router = await readFile(
    new URL("../../src/app/router/AppRouter.tsx", import.meta.url),
    "utf8",
  );
  const login = await readFile(
    new URL("../../src/features/auth/pages/Login.tsx", import.meta.url),
    "utf8",
  );
  assert.match(permissionHook, /CRM_TEAMTREE_VIEW: "team\.read"/);
  assert.match(sidebar, /requiredPermissions: \[PERMISSION_MASTER\.CRM_TEAMTREE_VIEW\]/);
  assert.match(sidebar, /featureKey: OUTLET_FEATURE_KEYS\.TEAM_TREE/);
  assert.match(router, /permission={PERMISSION_MASTER\.CRM_TEAMTREE_VIEW}/);
  assert.match(router, /const canReadTeam =/);
  assert.match(login, /const canReadTeam =/);
});

test("custom-role tenant admin receives an outlet-scoped Team Tree grant", async () => {
  const migration = await readFile(
    new URL("../migrations/0030_grant_team_tree_to_outlet_admin.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, new RegExp(outletId));
  assert.match(migration, /membership\.is_tenant_admin/);
  assert.match(migration, /permission\.permission_key = 'team\.read'/);
  assert.match(migration, /ON CONFLICT \(outlet_id, user_id, permission_id\) DO NOTHING/);
  assert.doesNotMatch(migration, /INSERT INTO iam\.role_permissions/);
});
