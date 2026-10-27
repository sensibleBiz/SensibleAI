import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import type { PostgresAuthorizationRepository } from "../src/modules/authorization/postgresAuthorization.repository.js";
import type { PostgresCallRepository } from "../src/modules/calls/postgresCall.repository.js";
import type { PostgresLeadRepository } from "../src/modules/leads/postgresLead.repository.js";
import { PostgresCallService } from "../src/modules/calls/postgresCall.service.js";
import {
  postgresCallCreateSchema,
  postgresCallReportQuerySchema,
  postgresLeadCallListQuerySchema,
} from "../src/modules/calls/postgresCall.validator.js";

const ids = {
  tenant: "01994abc-0000-7000-8000-000000000001",
  outlet: "01994abc-0000-7000-8000-000000000021",
  business: "01994abc-0000-7000-8000-000000000011",
  user: "01994abc-0000-7000-8000-000000000051",
  lead: "01994abc-0000-7000-8000-000000000061",
};

const database = {} as TransactionDatabase;

test("B6 validators require PostgreSQL UUID scope and preserve one-day report windows", () => {
  assert.equal(postgresLeadCallListQuerySchema.safeParse({ outletId: "firestore-outlet" }).success, false);
  assert.equal(
    postgresCallReportQuerySchema.safeParse({
      outletId: ids.outlet,
      startDate: 100,
      endDate: 86_400_101,
    }).success,
    false,
  );
  assert.equal(
    postgresCallCreateSchema.safeParse({
      outletId: ids.outlet,
      direction: "incoming",
      durationSeconds: 30,
      number: "9876543210",
      receiverName: "Sales User",
      timestamp: Date.now(),
    }).success,
    true,
  );
});

test("B6 PostgreSQL call router is mounted; legacy call router removed", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(routes, /apiRouter\.use\("\/", postgresCallRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/", callRouter\)/);
});

test("B6 migration defines crm.calls with RLS and no Firestore migration", async () => {
  const migration = await readFile(new URL("../migrations/0007_phase_b6_calls.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE crm\.calls/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /calls\.reports\.read/);
  assert.doesNotMatch(migration, /backfill|\betl\b|synchroni[sz]e|firestore/i);
});

test("B6 lead call list resolves PostgreSQL lead mobile variants only", async () => {
  const repository = {
    listByNumbers: async () => [{
      id: "01994abc-0000-7000-8000-000000000091",
      tenantId: ids.tenant,
      businessId: ids.business,
      outletId: ids.outlet,
      leadId: ids.lead,
      customerId: null,
      loggedByUserId: ids.user,
      direction: "incoming",
      durationSeconds: 12,
      number: "+919876543210",
      receiverMobileNo: "9000000000",
      receiverName: "Sales User",
      employeeLabel: "Sales User",
      department: "SALES",
      loggedAt: new Date("2026-01-01T10:00:00.000Z"),
      phoneAccountId: null,
      simLabel: null,
      simPhoneNumber: null,
      subscriptionId: null,
      deviceId: null,
      externalCallSource: null,
      externalCallId: null,
      createdByUserId: ids.user,
      updatedByUserId: ids.user,
      createdAt: new Date(),
      updatedAt: new Date(),
    }],
  } as unknown as PostgresCallRepository;
  const leads = {
    getById: async () => ({
      id: ids.lead,
      outletId: ids.outlet,
      mobile: "9876543210",
      customerId: null,
    }),
  } as unknown as PostgresLeadRepository;
  const authorization = {
    hasOutletPermission: async () => true,
  } as unknown as PostgresAuthorizationRepository;
  const service = new PostgresCallService(repository, authorization, leads);
  const result = await service.listByLead(database, ids.tenant, ids.user, {
    outletId: ids.outlet,
    leadId: ids.lead,
    limit: 30,
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.number, "+919876543210");
});

test("B6 call creation enforces outlet business resolution and permissions", async () => {
  const events: string[] = [];
  const repository = {
    resolveOutletBusiness: async () => ids.business,
    create: async () => { events.push("create"); },
    getById: async () => ({
      id: "01994abc-0000-7000-8000-000000000092",
      tenantId: ids.tenant,
      businessId: ids.business,
      outletId: ids.outlet,
      leadId: null,
      customerId: null,
      loggedByUserId: ids.user,
      direction: "outgoing",
      durationSeconds: 5,
      number: "9876543210",
      receiverMobileNo: "",
      receiverName: "Sales User",
      employeeLabel: "Sales User",
      department: "SALES",
      loggedAt: new Date(),
      phoneAccountId: null,
      simLabel: null,
      simPhoneNumber: null,
      subscriptionId: null,
      deviceId: null,
      externalCallSource: null,
      externalCallId: null,
      createdByUserId: ids.user,
      updatedByUserId: ids.user,
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
  } as unknown as PostgresCallRepository;
  const authorization = {
    hasOutletPermission: async (_database: TransactionDatabase, _userId: string, _tenantId: string, _outletId: string, permission: string) => {
      events.push(permission);
      return true;
    },
    hasOutletAccess: async () => true,
  } as unknown as PostgresAuthorizationRepository;
  const service = new PostgresCallService(repository, authorization, {} as PostgresLeadRepository);
  await service.create(database, ids.tenant, ids.user, {
    outletId: ids.outlet,
    direction: "outgoing",
    durationSeconds: 5,
    number: "9876543210",
    receiverName: "Sales User",
    timestamp: Date.now(),
  });
  assert.deepEqual(events, ["calls.create", "create"]);
});
