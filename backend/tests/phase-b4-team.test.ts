import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import type { PostgresAuthorizationRepository } from "../src/modules/authorization/postgresAuthorization.repository.js";
import type { PostgresTeamRepository } from "../src/modules/team/postgresTeam.repository.js";
import { PostgresTeamService } from "../src/modules/team/postgresTeam.service.js";
import { postgresTeamCreateSchema, postgresTeamListSchema, postgresTeamUpdateSchema } from "../src/modules/team/postgresTeam.validator.js";

const ids = {
  tenant: "01994abc-0000-7000-8000-000000000001",
  outlet: "01994abc-0000-7000-8000-000000000021",
  actor: "01994abc-0000-7000-8000-000000000051",
  user: "01994abc-0000-7000-8000-000000000052",
};

const database = {} as TransactionDatabase;
const authorization = {
  hasOutletAccess: async () => true,
  hasOutletPermission: async () => true,
} as unknown as PostgresAuthorizationRepository;

test("B4 validators require PostgreSQL UUID scope and a real new-user credential", () => {
  assert.equal(postgresTeamListSchema.safeParse({ outletId: "firestore-outlet", limit: 50 }).success, false);
  assert.equal(postgresTeamCreateSchema.safeParse({
    outletId: ids.outlet, name: "Employee", email: "employee@example.com", password: "short",
    department: "SALES", roleInZone: "USER", zoneList: [], empCode: "EMP-1",
    isOnPayRoll: true, isActive: true,
  }).success, false);
  assert.equal(postgresTeamCreateSchema.safeParse({
    outletId: ids.outlet, name: "Employee", email: "employee@example.com", password: "long-enough-password",
    department: "SALES", roleInZone: "USER", zoneList: ["west", "WEST"], empCode: "EMP-1",
    isOnPayRoll: true, isActive: true,
  }).data?.zoneList.length, 1);
  assert.equal(postgresTeamUpdateSchema.safeParse({
    outletId: ids.outlet,
    currentDepartment: "SUPPORT",
    department: "SALES",
  }).success, true);
});

test("B4 rejects self-management and hierarchy cycles", async () => {
  const repository = {
    managerProfile: async () => "01994abc-0000-7000-8000-000000000099",
    update: async () => "cycle" as const,
  } as unknown as PostgresTeamRepository;
  const service = new PostgresTeamService(repository, authorization);
  await assert.rejects(
    service.update(database, ids.tenant, ids.actor, ids.user, {
      outletId: ids.outlet, department: "SALES", managerUserId: ids.user,
    }),
    (error: unknown) => (error as { code?: string }).code === "TEAM_MANAGER_SELF_REFERENCE",
  );
  await assert.rejects(
    service.update(database, ids.tenant, ids.actor, ids.user, {
      outletId: ids.outlet, department: "SALES", managerUserId: ids.actor,
    }),
    (error: unknown) => (error as { code?: string }).code === "TEAM_HIERARCHY_CYCLE",
  );
});

test("B4 preserves an omitted manager and supports explicit manager removal", async () => {
  const managerLookups: string[] = [];
  const updates: Array<string | null | undefined> = [];
  const repository = {
    managerProfile: async (_database: TransactionDatabase, _tenantId: string, _outletId: string, managerUserId: string) => {
      managerLookups.push(managerUserId);
      return ids.user;
    },
    update: async (
      _database: TransactionDatabase,
      _tenantId: string,
      _userId: string,
      _input: unknown,
      managerProfileId: string | null | undefined,
    ) => {
      updates.push(managerProfileId);
      return true;
    },
    get: async () => [{}],
  } as unknown as PostgresTeamRepository;
  const service = new PostgresTeamService(repository, authorization);

  await service.update(database, ids.tenant, ids.actor, ids.user, {
    outletId: ids.outlet,
    department: "SALES",
    empCode: "EMP-1",
  });
  await service.update(database, ids.tenant, ids.actor, ids.user, {
    outletId: ids.outlet,
    department: "SALES",
    managerUserId: null,
  });

  assert.deepEqual(managerLookups, []);
  assert.deepEqual(updates, [undefined, null]);
});

test("B4 migration is normalized, forced-RLS, and contains no Firestore migration or synchronization", async () => {
  const migration = await readFile(new URL("../migrations/0005_phase_b4_team_tree_users.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE crm\.user_profiles/);
  assert.match(migration, /CREATE TABLE crm\.team_memberships/);
  assert.match(migration, /manager_profile_id/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
  assert.doesNotMatch(migration, /firestore|backfill|\betl\b|synchroni[sz]e/i);
});

test("B4 PostgreSQL routers are mounted; legacy routers removed", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(routes, /apiRouter\.use\("\/team-tree", postgresTeamRouter\)/);
  assert.match(routes, /apiRouter\.use\("\/access-control", postgresAccessControlRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/team-tree", teamTreeRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/access-control", accessControlRouter\)/);
});
