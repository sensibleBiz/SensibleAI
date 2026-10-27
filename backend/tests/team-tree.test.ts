import assert from "node:assert/strict";
import test from "node:test";
import { createTeamTreeUserSchema } from "../src/validators/teamTree.validator.js";

const validUser = {
  outletId: "outlet-1",
  name: "Asha Patil",
  phoneNumber: "9876543210",
  department: "SALES",
  roleInZone: "USER",
  zoneList: ["PUNE"],
  teamHeadProfileId: "manager-1",
  zoneHeadProfileId: "admin-1",
  empCode: "EMP-100",
  isOnPayRoll: true,
  isActive: true,
};

test("team-tree user validation requires a name and Indian mobile number", () => {
  assert.equal(createTeamTreeUserSchema.safeParse(validUser).success, true);
  assert.equal(
    createTeamTreeUserSchema.safeParse({ ...validUser, name: " " }).success,
    false,
  );
  assert.equal(
    createTeamTreeUserSchema.safeParse({ ...validUser, phoneNumber: "1234567890" })
      .success,
    false,
  );
  assert.equal(
    createTeamTreeUserSchema.safeParse({ ...validUser, outletId: "bad/id" })
      .success,
    false,
  );
});

test("team-tree user validation rejects unknown roles and fields", () => {
  assert.equal(
    createTeamTreeUserSchema.safeParse({ ...validUser, roleInZone: "OWNER" })
      .success,
    false,
  );
  assert.equal(
    createTeamTreeUserSchema.safeParse({ ...validUser, password: "secret" })
      .success,
    false,
  );
});

// mergeOutletAccess removed from codebase; test removed pending PostgreSQL-native replacement.
