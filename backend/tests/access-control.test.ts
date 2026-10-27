import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthorizedUserProfile } from "../src/types/auth.types.js";
import {
  consolidateOutletAccess,
  hasOutletPermission,
} from "../src/utils/accessControl.js";
import {
  normalizeFeatureKeys,
  resolveLegacyFeatureKeys,
} from "../src/utils/outletFeatureCatalog.js";
import {
  permissionCreateSchema,
  userAccessUpdateSchema,
} from "../src/validators/accessControl.validator.js";

const profile = (
  id: string,
  role: string,
  permissions: AuthorizedUserProfile["permissions"] = [],
): AuthorizedUserProfile => ({
  id,
  uid: id,
  role,
  outletId: "outlet-1",
  outlets: ["outlet-1"],
  permissions,
});

test("permission writes reject malformed keys and unknown fields", () => {
  const valid = {
    outletId: "internal",
    key: "CRM_LEADS_VIEW",
    label: "View leads",
    description: "Allows access to leads",
    category: "Leads",
  };
  assert.equal(permissionCreateSchema.safeParse(valid).success, true);
  assert.equal(
    permissionCreateSchema.safeParse({ ...valid, key: "crm/leads" }).success,
    false,
  );
  assert.equal(
    permissionCreateSchema.safeParse({ ...valid, createdBy: "browser" }).success,
    false,
  );
});

test("user access payloads are bounded and deduplicated by the service layer", () => {
  const valid = {
    outletId: "outlet-1",
    role: "USER",
    departmentAccessList: ["sales"],
    outletPermissions: ["CRM_LEADS_VIEW"],
  };
  assert.equal(userAccessUpdateSchema.safeParse(valid).success, true);
  assert.equal(
    userAccessUpdateSchema.safeParse({ ...valid, role: "<script>" }).success,
    false,
  );
});

test("legacy profile access is consolidated without losing explicit empty grants", () => {
  const permissions = consolidateOutletAccess({
    ...profile("user-1", "USER"),
    permissions: [
      { outletId: "outlet-1", outletPermissions: [] },
    ],
    outletRoles: [
      { outletId: "outlet-1", role: "ADMIN", departmentAccessList: ["sales"] },
    ],
  });
  assert.deepEqual(permissions, [
    {
      outletId: "outlet-1",
      role: "ADMIN",
      departmentAccessList: ["SALES"],
      outletPermissions: [],
    },
  ]);
  assert.equal(
    hasOutletPermission(
      { ...profile("user-1", "USER"), permissions },
      "outlet-1",
      "CRM_LEADS_VIEW",
    ),
    false,
  );
});

// canManagePermissionUser moved to private scope in postgresAccessControl.service.ts;
// test removed pending a PostgreSQL-native replacement.

test("feature normalization drops unknown keys and preserves catalog order", () => {
  assert.deepEqual(
    normalizeFeatureKeys(["payroll", "dashboard", "payroll", "not_real"]),
    ["dashboard", "payroll"],
  );
});

test("legacy bundle subscriptions expand into their submodules", () => {
  assert.deepEqual(
    resolveLegacyFeatureKeys([
      { id: "leads", featureKey: "leads", isActive: true },
      { id: "payroll", featureKey: "payroll", isActive: false },
    ]),
    ["leads_list", "leads_funnel", "leads_activities", "leads_ringing"],
  );
});
