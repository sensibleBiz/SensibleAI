import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Data Connect smoke module was planned but never implemented.
// Tests below document the expected state: module files do not exist.

test("SQL Connect smoke module is not yet implemented (files absent)", async () => {
  await assert.rejects(
    readFile(new URL("../src/modules/dataConnectSmoke/dataConnectSmoke.routes.ts", import.meta.url), "utf8"),
    (err: unknown) => (err as NodeJS.ErrnoException).code === "ENOENT",
  );
});

test("SQL Connect smoke service is not yet implemented (files absent)", async () => {
  await assert.rejects(
    readFile(new URL("../src/modules/dataConnectSmoke/dataConnectSmoke.service.ts", import.meta.url), "utf8"),
    (err: unknown) => (err as NodeJS.ErrnoException).code === "ENOENT",
  );
});
