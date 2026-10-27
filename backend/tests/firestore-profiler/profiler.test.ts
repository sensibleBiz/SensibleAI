import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GeoPoint, Timestamp } from "firebase-admin/firestore";
import { CollectionProfiler } from "../../tools/firestore-profiler/collection-profiler.js";
import { assertSafeConfiguration, type ProfilerConfig } from "../../tools/firestore-profiler/config.js";
import { writeReports } from "../../tools/firestore-profiler/report-writer.js";
import { detectFirestoreType } from "../../tools/firestore-profiler/type-detector.js";
import type { FirestoreProfileReport } from "../../tools/firestore-profiler/types.js";

const config: ProfilerConfig = { projectId: "test-project", environment: "test-profiling", profileMode: "READ_ONLY", batchSize: 2, pauseMs: 100, outputDirectory: "unused", largeDocumentBytes: 200, largeArrayLength: 3, orphanSampleLimit: 5 };

test("safety preflight rejects write-capable mode, oversized batches and insufficient throttle", () => {
  assert.throws(() => assertSafeConfiguration({ ...config, profileMode: "READ_WRITE" }), /READ_ONLY/);
  assert.throws(() => assertSafeConfiguration({ ...config, batchSize: 251 }), /between 1 and 250/);
  assert.throws(() => assertSafeConfiguration({ ...config, pauseMs: 99 }), /at least 100/);
  assert.doesNotThrow(() => assertSafeConfiguration(config));
});

test("type detector distinguishes every required Firestore type without conversion", () => {
  assert.equal(detectFirestoreType("x"), "string");
  assert.equal(detectFirestoreType(1), "number");
  assert.equal(detectFirestoreType(true), "boolean");
  assert.equal(detectFirestoreType(null), "null");
  assert.equal(detectFirestoreType(Timestamp.fromMillis(1)), "Timestamp");
  assert.equal(detectFirestoreType(new GeoPoint(1, 2)), "GeoPoint");
  assert.equal(detectFirestoreType({ path: "OUTLET/a", get() {} }), "DocumentReference");
  assert.equal(detectFirestoreType([]), "array");
  assert.equal(detectFirestoreType({}), "map/object");
  assert.equal(detectFirestoreType(Buffer.from("x")), "bytes");
  assert.equal(detectFirestoreType(undefined), "unknown");
});

test("collection profiler reports missing/null/empty/mixed/nested/enum/ID and password counts", async () => {
  const documents = [
    fakeDocument("short", { email: "valid@example.com", password: "never-export-this", createdAt: Timestamp.fromMillis(1_700_000_000_000), roles: [], location: new GeoPoint(1, 2) }),
    fakeDocument("x".repeat(65), { email: "bad-email", password: "", createdAt: 1_700_000_000, roles: ["A", 2, true], outletId: "other" }),
    fakeDocument("third", { email: null, createdAt: "not-a-date", roles: [{ name: "nested" }], settings: {} }),
  ];
  const result = await new CollectionProfiler("USER_PROFILE", config).profile([fakeCollection("OUTLET/parent/USER_PROFILE", documents) as never]);
  assert.deepEqual(result.report.detectedTypesPerField.email, ["null", "string"]);
  assert.equal(result.report.fieldProfiles.roles?.emptyArrayCount, 1);
  assert.deepEqual(result.report.arrayProfiles.roles?.elementTypes, ["boolean", "map/object", "number", "string"]);
  assert.equal(result.report.timestampProfiles.createdAt?.invalidCount, 1);
  assert.equal(result.report.identifierProfile.idsExceeding64Count, 1);
  assert.equal(result.report.tenantOutletInconsistencyCount, 1);
  assert.deepEqual(result.report.legacyPasswordAudit, { present: 2, missing: 1, empty: 1, types: ["string"] });
  assert.equal(result.report.malformedRecordCount, 1);
  assert.equal(result.report.driftClassification, "BLOCKING DRIFT");
  assert.equal(JSON.stringify(result.report).includes("never-export-this"), false);
});

test("report writer emits all three artifacts without credential values", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "firestore-profile-test-"));
  try {
    const collection = (await new CollectionProfiler("USER_PROFILE", config).profile([fakeCollection("USER_PROFILE", [fakeDocument("u1", { password: "top-secret" })]) as never])).report;
    const report: FirestoreProfileReport = { metadata: { generatedAt: new Date(0).toISOString(), projectId: "test", profileMode: "READ_ONLY", environment: "test-profiling", batchSize: 2, pauseMs: 100, credentialValuesExported: false }, inventory: { expectedCollections: ["USER_PROFILE"], discoveredCollections: ["USER_PROFILE"], unexpectedCollections: [] }, collections: [collection], totalRecordsAnalyzed: 1, findings: [], shiftContractProposal: { estimatedRecordVolume: 0, fields: [], statusValues: [], userReferenceFields: [], timestampFields: [], monetaryFields: [], posAndInvoiceFields: [], nestedFields: [], proposedTable: "review", proposedIndexes: [], proposedForeignKeys: [], tenantScoping: "review", risks: ["not found"] } };
    const files = await writeReports(report, directory);
    for (const file of Object.values(files)) assert.equal((await readFile(file, "utf8")).includes("top-secret"), false);
    assert.match(await readFile(files.summary, "utf8"), /## 15\. Recommended contract amendments/);
    assert.match(await readFile(files.findings, "utf8"), /## P0/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function fakeDocument(id: string, data: Record<string, unknown>) {
  return { id, data: () => data, ref: { listCollections: async () => [] } };
}

function fakeCollection(collectionPath: string, documents: ReturnType<typeof fakeDocument>[]) {
  class Query {
    private after?: string;
    private maximum = 250;
    orderBy() { return this; }
    limit(value: number) { this.maximum = value; return this; }
    startAfter(document: { id: string } | string) { this.after = typeof document === "string" ? document : document.id; return this; }
    async get() {
      const start = this.after ? documents.findIndex((document) => document.id === this.after) + 1 : 0;
      const docs = documents.slice(start, start + this.maximum);
      return { docs, size: docs.length };
    }
  }
  return { path: collectionPath, count: () => ({ get: async () => ({ data: () => ({ count: documents.length }) }) }), orderBy: () => new Query() };
}

