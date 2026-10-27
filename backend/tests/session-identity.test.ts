import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { test } from "node:test";

// createSessionUid was a Firebase UID compatibility helper. It has been removed
// as part of the Firestore → PostgreSQL migration. The session.service.ts file
// no longer exists.

test("Firebase session.service.ts has been removed (migration complete)", async () => {
  await assert.rejects(
    access(new URL("../src/services/session.service.ts", import.meta.url)),
    (err: unknown) => (err as NodeJS.ErrnoException).code === "ENOENT",
  );
});
