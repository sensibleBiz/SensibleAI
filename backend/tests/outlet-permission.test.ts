import assert from "node:assert/strict";
import { test } from "node:test";
import { hasOutletPermission } from "../src/utils/accessControl.js";
import type { AuthorizedUserProfile } from "../src/types/auth.types.js";

const CREATE_LEADS = "CRM_LEADS_CREATE";

const profile = (
  overrides: Partial<AuthorizedUserProfile> = {},
): AuthorizedUserProfile => ({
  id: "profile-1",
  outletId: "outlet-1",
  outlets: ["outlet-1"],
  role: "USER",
  ...overrides,
});

test("primary outlet super admins retain create access", () => {
  assert.equal(
    hasOutletPermission(
      profile({ role: "SUPER_ADMIN" }),
      "outlet-1",
      CREATE_LEADS,
    ),
    true,
  );
});

test("sub-super admins without an explicit permission record retain default access", () => {
  assert.equal(
    hasOutletPermission(
      profile({
        role: "SUPER_ADMIN",
        outlets: ["outlet-1", "outlet-2"],
      }),
      "outlet-2",
      CREATE_LEADS,
    ),
    true,
  );
});

test("explicit outlet permissions constrain non-super-admin access", () => {
  const restrictedProfile = profile({
    permissions: [
      { outletId: "outlet-1", outletPermissions: ["CRM_LEADS_VIEW"] },
    ],
  });

  assert.equal(
    hasOutletPermission(restrictedProfile, "outlet-1", CREATE_LEADS),
    false,
  );
  assert.equal(
    hasOutletPermission(
      profile({
        permissions: [
          { outletId: "outlet-1", outletPermissions: [CREATE_LEADS] },
        ],
      }),
      "outlet-1",
      CREATE_LEADS,
    ),
    true,
  );
});

test("canonical permission entries supply the outlet role", () => {
  assert.equal(
    hasOutletPermission(
      profile({
        role: "USER",
        permissions: [{ outletId: "outlet-1", role: "SUPER_ADMIN" }],
      }),
      "outlet-1",
      CREATE_LEADS,
    ),
    true,
  );

  assert.equal(
    hasOutletPermission(
      profile({
        role: "SUPER_ADMIN",
        permissions: [
          {
            outletId: "outlet-1",
            role: "USER",
            outletPermissions: [],
          },
        ],
      }),
      "outlet-1",
      CREATE_LEADS,
    ),
    false,
  );
});

test("sub-super role defaults apply only when grants are omitted", () => {
  assert.equal(
    hasOutletPermission(
      profile({
        permissions: [{ outletId: "outlet-1", role: "SUB_SUPER_ADMIN" }],
      }),
      "outlet-1",
      CREATE_LEADS,
    ),
    true,
  );

  assert.equal(
    hasOutletPermission(
      profile({
        permissions: [
          {
            outletId: "outlet-1",
            role: "SUB_SUPER_ADMIN",
            outletPermissions: [],
          },
        ],
      }),
      "outlet-1",
      CREATE_LEADS,
    ),
    false,
  );
});
