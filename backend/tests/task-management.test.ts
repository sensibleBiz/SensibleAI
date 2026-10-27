import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  postgresTaskCreateSchema, postgresTaskListQuerySchema, postgresTaskStatusSchema,
  postgresTaskUpdateSchema,
} from "../src/modules/tasks/postgresTask.validator.js";

const outletId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

test("task validators enforce PostgreSQL scope, versions, and bounded workflow values", () => {
  assert.equal(postgresTaskCreateSchema.safeParse({
    outletId, title: "Follow up", assignedToUserId: userId, taskDate: "2026-09-28",
    dueAt: "2026-09-28T12:00:00.000+05:30",
  }).success, true);
  assert.equal(postgresTaskUpdateSchema.safeParse({ outletId, version: 1 }).success, false);
  assert.equal(postgresTaskStatusSchema.safeParse({
    outletId, version: 1, status: "COMPLETED", progressPercent: 100,
  }).success, true);
  assert.equal(postgresTaskListQuerySchema.safeParse({ outletId, limit: 101 }).success, false);
});

test("task migration defines protected task and immutable history storage", async () => {
  const migration = await readFile(new URL("../migrations/0028_task_management.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE crm\.tasks/);
  assert.match(migration, /CREATE TABLE crm\.task_status_history/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/g);
  assert.match(migration, /tasks\.read/);
  assert.match(migration, /task_status_history_insert/);
  assert.doesNotMatch(migration, /firebase|firestore/i);
});

test("task routes expose CRUD, status transitions, and history", async () => {
  const routes = await readFile(new URL("../src/modules/tasks/postgresTask.routes.ts", import.meta.url), "utf8");
  assert.match(routes, /get\("\/:taskId\/history"/);
  assert.match(routes, /patch\("\/:taskId\/status"/);
  assert.match(routes, /delete\("\/:taskId"/);
  const root = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(root, /apiRouter\.use\("\/tasks", postgresTaskRouter\)/);
});
