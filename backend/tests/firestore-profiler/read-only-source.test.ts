import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("profiler source has no Firestore mutation calls or write-capable imports", async () => {
  const root = path.resolve("tools/firestore-profiler");
  const files = ["index.ts", "profiler.ts", "collection-profiler.ts", "subcollection-profiler.ts", "field-profiler.ts", "type-detector.ts", "relationship-validator.ts", "schema-comparator.ts", "report-writer.ts", "config.ts", "types.ts"];
  const source = (await Promise.all(files.map((file) => readFile(path.join(root, file), "utf8")))).join("\n");
  for (const forbidden of [/\.doc\s*\([^)]*\)\s*\.set\s*\(/s, /\.ref\.set\s*\(/, /\.ref\.update\s*\(/, /\.ref\.delete\s*\(/, /\.doc\s*\([^)]*\)\s*\.create\s*\(/s, /\.batch\s*\(/, /runTransaction\s*\(/, /BulkWriter/, /getBulkWriter\s*\(/, /\b(?:WriteBatch|Transaction)\b/]) {
    assert.equal(forbidden.test(source), false, `forbidden Firestore write capability matched ${forbidden}`);
  }
  assert.doesNotMatch(source, /from ["']\.\.\/\.\.\/src\/repositories/);
});
