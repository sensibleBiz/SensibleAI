import assert from "node:assert/strict";
import test from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import { normalizeIndianPhone } from "../src/repositories/postgresOnboarding.repository.js";
import { createOutletCode } from "../src/modules/outlets/outletCode.js";
import { postgresOutletService } from "../src/modules/outlets/postgresOutlet.service.js";
import { createOutletSchema, planCatalogSchema, updateOutletSchema } from "../src/modules/outlets/postgresOutlet.validator.js";

test("OTP onboarding normalizes supported Indian phone formats", () => {
  assert.equal(normalizeIndianPhone("9876543210"), "+919876543210");
  assert.equal(normalizeIndianPhone("+91 98765 43210"), "+919876543210");
});

test("outlet updates are bounded and require at least one editable field", () => {
  assert.equal(updateOutletSchema.safeParse({}).success, false);
  assert.equal(updateOutletSchema.safeParse({ name: "Main outlet", city: "Pune" }).success, true);
  assert.equal(updateOutletSchema.safeParse({ active: false }).success, false);
});

test("outlet creation requires routing geography and rejects client-controlled fields", () => {
  const result = createOutletSchema.safeParse({
    businessId: "01994abc-0000-7000-8000-000000000001",
    name: "  Pune Central  ",
    city: " Pune ",
    state: " Maharashtra ",
    latitude: 18.5204,
    longitude: 73.8567,
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data, {
      businessId: "01994abc-0000-7000-8000-000000000001",
      name: "Pune Central",
      branch: "",
      address: "",
      city: "Pune",
      state: "Maharashtra",
      latitude: 18.5204,
      longitude: 73.8567,
    });
  }
  assert.equal(createOutletSchema.safeParse({ name: "Outlet", state: "Maharashtra" }).success, false);
  assert.equal(createOutletSchema.safeParse({ name: "Outlet", city: "Pune", state: "Maharashtra", outletCode: "ADMIN1" }).success, false);
  assert.equal(createOutletSchema.safeParse({ name: "Outlet", city: "Pune", state: "Maharashtra", role: "SUPER_ADMIN" }).success, false);
  assert.equal(createOutletSchema.safeParse({ name: "Outlet", city: "Pune", state: "Maharashtra", latitude: 91 }).success, false);
  assert.equal(createOutletSchema.safeParse({ businessId: "not-a-uuid", name: "Outlet", city: "Pune", state: "Maharashtra" }).success, false);
});

test("outlet codes are server-generated, uppercase, and bounded", () => {
  assert.equal(createOutletCode("Pune Central", 0), "PUN0000");
  assert.equal(createOutletCode("***", 35), "OUT000Z");
  assert.match(createOutletCode("Mumbai Store", 1_000), /^[A-Z0-9]{7}$/);
});

test("tenant admin outlet creation provisions the relational outlet context", async () => {
  const statements: string[] = [];
  const now = new Date("2026-10-08T10:00:00.000Z");
  let outletCode = "";
  let renewalDate = now;
  const database = {
    client: {
      async query(text: string, values: unknown[] = []) {
        statements.push(text);
        if (text.includes("FROM iam.users usr")) {
          return { rows: [{
            user_id: "01994abc-0000-7000-8000-000000000010",
            email: "owner@example.com",
            phone: "+919876543210",
            display_name: "Owner",
            is_tenant_admin: true,
            outlet_id: null,
            outlet_name: null,
            business_id: null,
            business_name: null,
            role_id: null,
            role_name: null,
            permissions: [],
            profile_role: null,
            departments: [],
            zones: [],
          }] };
        }
        if (text.includes("SELECT business.id, business.name")) {
          return { rows: [{ id: "01994abc-0000-7000-8000-000000000020", name: "Acme" }] };
        }
        if (text.includes("INSERT INTO tenancy.outlets")) {
          outletCode = String(values[2]);
          renewalDate = values[8] as Date;
          return { rows: [{ id: "01994abc-0000-7000-8000-000000000030" }] };
        }
        if (text.includes("INSERT INTO iam.roles")) {
          return { rows: [{ id: "01994abc-0000-7000-8000-000000000040" }] };
        }
        if (text.includes("INSERT INTO crm.user_profiles")) {
          return { rows: [{ id: "01994abc-0000-7000-8000-000000000050" }] };
        }
        if (text.includes("FROM billing.wallets")) {
          return { rows: [{
            id: "01994abc-0000-7000-8000-000000000070",
            tenant_id: "01994abc-0000-7000-8000-000000000001",
            outlet_id: "01994abc-0000-7000-8000-000000000030",
            balance_credits: "0.0000",
            reserved_credits: "0.0000",
            available_credits: "0.0000",
            currency: "INR",
            low_balance_threshold: "50000.0000",
            created_at: now,
            updated_at: now,
          }] };
        }
        if (text.includes("FROM tenancy.outlets outlet")) {
          return { rows: [{
            id: "01994abc-0000-7000-8000-000000000030",
            business_id: "01994abc-0000-7000-8000-000000000020",
            business_name: "Acme",
            outlet_code: outletCode,
            name: "Pune Central",
            branch: "Main Branch",
            address: "12 Market Road",
            city: "Pune",
            state: "Maharashtra",
            billing_type: "TRIAL",
            renewal_date: renewalDate,
            active: true,
            created_at: now,
            latitude: "18.5204000",
            longitude: "73.8567000",
          }] };
        }
        if (text.includes("FROM tenancy.outlet_subscriptions")) {
          return { rows: [{
            id: "01994abc-0000-7000-8000-000000000060",
            outlet_id: "01994abc-0000-7000-8000-000000000030",
            plan_tier: "trial",
            status: "trial",
            amount: "0",
            permitted_users: 5,
            starts_at: now,
            renews_at: renewalDate,
            external_transaction_id: null,
          }] };
        }
        return { rows: [], rowCount: 1 };
      },
    },
    db: {},
  } as unknown as TransactionDatabase;

  const result = await postgresOutletService.create(
    database,
    "01994abc-0000-7000-8000-000000000001",
    "01994abc-0000-7000-8000-000000000010",
    {
      name: "Pune Central",
      branch: "Main Branch",
      address: "12 Market Road",
      city: "Pune",
      state: "Maharashtra",
      latitude: 18.5204,
      longitude: 73.8567,
    },
  );

  assert.equal(result.outlet.outletCode, outletCode);
  assert.match(outletCode, /^PUN[A-Z0-9]{4}$/);
  assert.equal(result.subscription?.planTier, "trial");
  assert.ok(statements.some((statement) => statement.includes("INSERT INTO tenancy.outlet_assignments")));
  assert.ok(statements.some((statement) => statement.includes("INSERT INTO crm.team_memberships")));
  assert.ok(statements.some((statement) => statement.includes("INSERT INTO tenancy.outlet_features")));
  assert.ok(statements.some((statement) => statement.includes("INSERT INTO tenancy.outlet_subscriptions")));
  assert.ok(statements.some((statement) => statement.includes("INSERT INTO billing.wallets")));
});

test("plan catalog accepts only known tiers and bounded feature records", () => {
  assert.equal(planCatalogSchema.safeParse({ features: [{
    id: "lead-management", label: "Lead Management", tier: "silver", source: "default",
  }] }).success, true);
  assert.equal(planCatalogSchema.safeParse({ features: [{
    id: "lead-management", label: "Lead Management", tier: "enterprise", source: "default",
  }] }).success, false);
});
