/**
 * Tests for the search foundation:
 *   - normalizePhone utility
 *   - Repository SQL: tenant/outlet isolation enforced in every query
 *   - Repository graceful handling of empty inputs
 *   - Exact-match query parameters
 */

import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";
import {
  normalizePhone,
  exactSearchLeadIds,
  ftsSearchLeadIds,
  vectorSearchLeadIds,
  fetchLeadsByIds,
} from "../src/modules/search/searchLead.repository.js";

const TENANT_ID = "11111111-1111-7111-a111-111111111111";
const OUTLET_ID = "22222222-2222-7222-a222-222222222222";

// ── Fake client builder ───────────────────────────────────────────────────────

interface FakeQuery {
  sql: string;
  params: unknown[];
}

const makeFakeClient = (rowsToReturn: Record<string, unknown>[][] = []) => {
  const queries: FakeQuery[] = [];
  let callIndex = 0;
  const client = {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      const rows = rowsToReturn[callIndex++] ?? [];
      return { rows, rowCount: rows.length };
    },
  } as unknown as PoolClient;
  return { client, queries };
};

// ── normalizePhone ────────────────────────────────────────────────────────────

test("normalizePhone strips non-digit characters", () => {
  assert.equal(normalizePhone("+91 98765 43210"), "9876543210");
  assert.equal(normalizePhone("(022) 2345-6789"), "2223456789"); // 0222345678​9 → last 10 digits
});

test("normalizePhone returns last 10 digits for a 10+ digit input", () => {
  assert.equal(normalizePhone("919876543210"), "9876543210");
});

test("normalizePhone returns raw digits for short inputs", () => {
  assert.equal(normalizePhone("1234"), "1234");
  assert.equal(normalizePhone("98765"), "98765");
});

test("normalizePhone handles pure digit input of exactly 10 digits", () => {
  assert.equal(normalizePhone("9876543210"), "9876543210");
});

// ── exactSearchLeadIds ────────────────────────────────────────────────────────

test("exactSearchLeadIds passes tenantId as $1 and outletId as $2", async () => {
  const { client, queries } = makeFakeClient([[{ id: "lead-1" }]]);
  const ids = await exactSearchLeadIds(client, TENANT_ID, OUTLET_ID, "9876543210");
  assert.equal(ids.length, 1);
  assert.equal(ids[0], "lead-1");
  assert.equal(queries.length, 1);
  assert.equal(queries[0]!.params[0], TENANT_ID);
  assert.equal(queries[0]!.params[1], OUTLET_ID);
});

test("exactSearchLeadIds passes phone digits as $3", async () => {
  const { client, queries } = makeFakeClient([[]]);
  await exactSearchLeadIds(client, TENANT_ID, OUTLET_ID, "+91-98765-43210");
  assert.equal(queries[0]!.params[2], "9876543210");
});

test("exactSearchLeadIds passes lowercase email as $4", async () => {
  const { client, queries } = makeFakeClient([[]]);
  await exactSearchLeadIds(client, TENANT_ID, OUTLET_ID, "User@Example.COM");
  assert.equal(queries[0]!.params[3], "user@example.com");
});

test("exactSearchLeadIds returns empty array when no rows returned", async () => {
  const { client } = makeFakeClient([[]]);
  const ids = await exactSearchLeadIds(client, TENANT_ID, OUTLET_ID, "xyz");
  assert.deepEqual(ids, []);
});

// ── ftsSearchLeadIds ──────────────────────────────────────────────────────────

test("ftsSearchLeadIds passes tenantId as $1, outletId as $2, query as $3", async () => {
  const { client, queries } = makeFakeClient([[{ id: "lead-fts" }]]);
  const ids = await ftsSearchLeadIds(client, TENANT_ID, OUTLET_ID, "solar panel", 10);
  assert.equal(ids.length, 1);
  assert.equal(queries[0]!.params[0], TENANT_ID);
  assert.equal(queries[0]!.params[1], OUTLET_ID);
  assert.equal(queries[0]!.params[2], "solar panel");
  assert.equal(queries[0]!.params[3], 10);
});

test("ftsSearchLeadIds SQL uses search_vector and websearch_to_tsquery", async () => {
  const { client, queries } = makeFakeClient([[]]);
  await ftsSearchLeadIds(client, TENANT_ID, OUTLET_ID, "test", 5);
  assert.ok(queries[0]!.sql.includes("search_vector"), "SQL must reference search_vector column");
  assert.ok(queries[0]!.sql.includes("websearch_to_tsquery"), "SQL must use websearch_to_tsquery");
  assert.ok(queries[0]!.sql.includes("'simple'"), "SQL must use 'simple' text search config");
});

// ── vectorSearchLeadIds ───────────────────────────────────────────────────────

test("vectorSearchLeadIds passes tenantId, outletId, vector JSON, and limit", async () => {
  const { client, queries } = makeFakeClient([[]]);
  const vec = [0.1, 0.2, 0.3];
  await vectorSearchLeadIds(client, TENANT_ID, OUTLET_ID, vec, 5);
  assert.equal(queries[0]!.params[0], TENANT_ID);
  assert.equal(queries[0]!.params[1], OUTLET_ID);
  assert.equal(queries[0]!.params[2], JSON.stringify(vec));
  assert.equal(queries[0]!.params[3], 5);
});

test("vectorSearchLeadIds SQL uses cosine distance operator and filters NULL embeddings", async () => {
  const { client, queries } = makeFakeClient([[]]);
  await vectorSearchLeadIds(client, TENANT_ID, OUTLET_ID, [0.0], 3);
  assert.ok(queries[0]!.sql.includes("<=>"), "SQL must use cosine distance operator");
  assert.ok(queries[0]!.sql.includes("embedding IS NOT NULL"), "SQL must filter out null embeddings");
});

// ── fetchLeadsByIds ───────────────────────────────────────────────────────────

test("fetchLeadsByIds returns an empty Map when given an empty ID array", async () => {
  const { client, queries } = makeFakeClient();
  const result = await fetchLeadsByIds(client, TENANT_ID, OUTLET_ID, []);
  assert.equal(result.size, 0);
  assert.equal(queries.length, 0, "No query should be issued for empty IDs");
});

test("fetchLeadsByIds passes tenantId as $1 and outletId as $2", async () => {
  const { client, queries } = makeFakeClient([[{
    id: "lead-x",
    business_name: "Acme",
    customer_name: "Alice",
    mobile: "9876543210",
    stage: "new",
    city: "Mumbai",
    assigned_to_display_name: "Bob",
  }]]);
  const result = await fetchLeadsByIds(client, TENANT_ID, OUTLET_ID, ["lead-x"]);
  assert.equal(result.size, 1);
  assert.ok(result.has("lead-x"));
  assert.equal(queries[0]!.params[0], TENANT_ID);
  assert.equal(queries[0]!.params[1], OUTLET_ID);
});

test("fetchLeadsByIds returns all fields including assigned_to_display_name", async () => {
  const row = {
    id: "lead-y",
    business_name: "SolarCo",
    customer_name: "Raj Kumar",
    mobile: "8888888888",
    stage: "qualified",
    city: "Delhi",
    assigned_to_display_name: "Priya",
  };
  const { client } = makeFakeClient([[row]]);
  const result = await fetchLeadsByIds(client, TENANT_ID, OUTLET_ID, ["lead-y"]);
  const lead = result.get("lead-y")!;
  assert.equal(lead.business_name, "SolarCo");
  assert.equal(lead.assigned_to_display_name, "Priya");
  assert.equal(lead.stage, "qualified");
});

// ── Tenant isolation: query must always scope to tenant + outlet ──────────────

test("all repository queries place tenant_id and outlet_id as the first two parameters", async () => {
  const otherTenantId = "ffffffff-ffff-7fff-afff-ffffffffffff";
  const otherOutletId = "eeeeeeee-eeee-7eee-aeee-eeeeeeeeeeee";

  // Run each function with a "wrong" tenant pair and confirm params[0]/params[1] always match
  for (const [label, fn] of [
    ["exact", async (client: PoolClient) => exactSearchLeadIds(client, otherTenantId, otherOutletId, "test")],
    ["fts",   async (client: PoolClient) => ftsSearchLeadIds(client, otherTenantId, otherOutletId, "test", 5)],
    ["vector", async (client: PoolClient) => vectorSearchLeadIds(client, otherTenantId, otherOutletId, [0.1], 5)],
    ["fetch", async (client: PoolClient) => fetchLeadsByIds(client, otherTenantId, otherOutletId, ["id"])],
  ] as [string, (client: PoolClient) => Promise<unknown>][]) {
    const { client, queries } = makeFakeClient([[]]);
    await fn(client);
    if (queries.length === 0) continue; // fetchLeadsByIds with empty array
    assert.equal(queries[0]!.params[0], otherTenantId, `${label}: params[0] must be tenantId`);
    assert.equal(queries[0]!.params[1], otherOutletId, `${label}: params[1] must be outletId`);
  }
});
