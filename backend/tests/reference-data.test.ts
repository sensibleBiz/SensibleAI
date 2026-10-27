import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  referenceCityQuerySchema,
  referenceListQuerySchema,
  referenceStateQuerySchema,
} from "../src/modules/referenceData/postgresReferenceData.validator.js";

test("reference-data queries normalize filters and bound result sizes", () => {
  assert.deepEqual(referenceListQuerySchema.parse({}), { activeOnly: true, q: "", limit: 250 });
  assert.equal(referenceStateQuerySchema.parse({ countryCode: "in" }).countryCode, "IN");
  assert.equal(referenceCityQuerySchema.parse({ stateCode: "mh", limit: "50" }).stateCode, "MH");
  assert.equal(referenceCityQuerySchema.safeParse({ limit: 1001 }).success, false);
});

test("reference geography migration creates read-only PostgreSQL catalogs", async () => {
  const migration = await readFile(new URL("../migrations/0027_reference_geography.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS reference_data/);
  for (const table of ["countries", "states", "cities", "zones"]) {
    assert.match(migration, new RegExp(`CREATE TABLE reference_data\\.${table}`));
  }
  assert.match(migration, /GRANT SELECT ON reference_data\.zones/);
  assert.doesNotMatch(migration, /firebase|firestore/i);
});

test("reference-data router is mounted on the PostgreSQL API", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(routes, /apiRouter\.use\("\/reference-data", postgresReferenceDataRouter\)/);
});
