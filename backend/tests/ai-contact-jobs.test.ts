import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createAiContactJobSchema, updateAiContactJobSchema } from "../src/modules/aiContacts/postgresAiContact.validator.js";

test("AI contact jobs validate bounded keyword batches", () => {
  const valid = createAiContactJobSchema.safeParse({
    outletId: "018f6b5a-7d21-7c91-8abc-1234567890ab",
    keywords: ["Industrial pumps", "Industrial pumps", "Valves"],
    city: "Pune",
    category: "Manufacturing",
    contactLimit: 200,
  });
  assert.equal(valid.success, true);
  if (valid.success) assert.deepEqual(valid.data.keywords, ["Industrial pumps", "Valves"]);
  assert.equal(updateAiContactJobSchema.safeParse({}).success, false);
  assert.equal(updateAiContactJobSchema.safeParse({ contactLimit: 10_001 }).success, false);
});

test("AI contact migration enforces tenant RLS and application grants", async () => {
  const sql = await readFile(path.resolve(process.cwd(), "migrations/0022_ai_contact_jobs.sql"), "utf8");
  assert.match(sql, /CREATE TABLE crm\.ai_contact_jobs/);
  assert.match(sql, /FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /tenancy\.can_access_outlet\(tenant_id, outlet_id\)/);
  assert.match(sql, /iam\.has_outlet_permission/);
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON crm\.ai_contact_jobs TO sensible_app_role/);
});
