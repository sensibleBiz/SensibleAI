import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("B5 PostgreSQL activity and access-control routers are mounted; legacy routers removed", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(routes, /apiRouter\.use\("\/", postgresActivityRouter\)/);
  assert.match(routes, /apiRouter\.use\("\/access-control", postgresAccessControlRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/", activityRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/access-control", accessControlRouter\)/);
});

test("B5 PostgreSQL activity routes require the postgres session header gate", async () => {
  const routes = await readFile(
    new URL("../src/modules/activities/postgresActivity.routes.ts", import.meta.url),
    "utf8",
  );
  assert.match(routes, /POSTGRES_SESSION_HEADER/);
  assert.match(routes, /requirePostgresAuth/);
  assert.doesNotMatch(routes, /firebase|firestore/i);
});

test("B5 legacy Firestore activity repository has been removed (migration complete)", async () => {
  await assert.rejects(
    readFile(new URL("../src/modules/activities/legacyFirestoreActivity.repository.ts", import.meta.url), "utf8"),
    (err: unknown) => (err as NodeJS.ErrnoException).code === "ENOENT",
  );
});

test("B5 frontend activity API uses explicit postgres auth mode", async () => {
  const leadApi = await readFile(new URL("../../src/features/leads/api/leadApi.ts", import.meta.url), "utf8");
  assert.match(leadApi, /postgresOwnedAuthOptions/);
  assert.match(leadApi, /getMonthlyActivities[\s\S]*postgresOwnedAuthOptions/);
});

test("B5 Call Later uses a single PostgreSQL activity transaction path", async () => {
  const service = await readFile(
    new URL("../src/modules/activities/postgresActivity.service.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /if \(input\.callLater\)/);
  assert.match(service, /recordAssignment/);
  assert.match(service, /recordStageHistory/);
  assert.match(service, /this\.leads\.update/);
  assert.doesNotMatch(service, /from\s+["'].*firebase|from\s+["'].*firestore/i);
});

test("B5 activities migration enables RLS and does not migrate Firestore data", async () => {
  const migration = await readFile(new URL("../migrations/0004_phase_b3_activities.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE crm\.activities/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /backfill|\betl\b|synchroni[sz]e|firestore/i);
});
