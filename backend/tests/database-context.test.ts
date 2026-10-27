import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";
import { runWithClientDatabaseContext } from "../src/db/context.js";

const tenantId = "01994abc-1234-7abc-8abc-1234567890ab";
const userId = "01994abc-1234-7abc-8abc-1234567890aa";

const fakeClient = () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, ...(values ? { values } : {}) });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as PoolClient;
  return { client, calls };
};

test("database identity is set locally inside one transaction", async () => {
  const { client, calls } = fakeClient();
  const result = await runWithClientDatabaseContext(client, { tenantId, userId }, async () => "done");
  assert.equal(result, "done");
  assert.equal(calls[0]?.sql, "BEGIN");
  assert.deepEqual(calls[1]?.values, [tenantId]);
  assert.match(calls[1]?.sql ?? "", /current_tenant_id/);
  assert.deepEqual(calls[2]?.values, [userId]);
  assert.match(calls[2]?.sql ?? "", /current_user_id/);
  assert.deepEqual(calls[3]?.values, ["false"]);
  assert.equal(calls.at(-1)?.sql, "COMMIT");
  for (const call of calls.slice(1, 4)) assert.match(call.sql, /set_config\(.+, \$1, true\)/);
});

test("failed request rolls back and does not reuse client state", async () => {
  const first = fakeClient();
  await assert.rejects(
    runWithClientDatabaseContext(first.client, { tenantId, userId }, async () => { throw new Error("operation failed"); }),
    /operation failed/,
  );
  assert.equal(first.calls.at(-1)?.sql, "ROLLBACK");

  const second = fakeClient();
  const secondTenant = "01994abc-1234-7abc-8abc-1234567890ad";
  await runWithClientDatabaseContext(second.client, { tenantId: secondTenant, userId }, async () => undefined);
  assert.deepEqual(second.calls[1]?.values, [secondTenant]);
  assert.equal(second.calls.filter((call) => call.sql.includes("current_tenant_id")).length, 1);
});

test("invalid identity is rejected before a transaction starts", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(runWithClientDatabaseContext(client, { tenantId: "spoofed", userId }, async () => undefined), /valid UUID/);
  assert.equal(calls.length, 0);
});
