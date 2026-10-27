import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import { AiDossierService } from "../src/modules/aiDossiers/aiDossier.service.js";
import { dossierRetryPlan } from "../src/modules/aiDossiers/aiDossier.retry.js";
import {
  assertEvidenceReferences,
  parseDossierSynthesis,
} from "../src/modules/aiDossiers/aiDossier.synthesis.js";
import type { AiCustomerDossier } from "../src/modules/aiDossiers/aiDossier.types.js";

const database = {} as TransactionDatabase;
const tenantId = "01994abc-0000-7000-8000-000000000001";
const outletId = "01994abc-0000-7000-8000-000000000002";
const subjectId = "01994abc-0000-7000-8000-000000000003";
const userId = "01994abc-0000-7000-8000-000000000004";

const pendingDossier: AiCustomerDossier = {
  id: "01994abc-0000-7000-8000-000000000005",
  outletId,
  subjectType: "lead",
  subjectId,
  status: "pending",
  attemptCount: 0,
  sourceVersion: null,
  sourceWatermark: {},
  factualSummary: "",
  summaryEvidence: [],
  facts: [],
  statedNeeds: [],
  explicitBudget: null,
  decisionMakers: [],
  risks: [],
  suggestedNextActions: [],
  estimates: {
    winProbability: null,
    churnRisk: null,
    calibrated: false,
    caveat: "uncalibrated",
  },
  synthesis: { provider: null, model: null, modelVersion: null, synthesizedAt: null, durationMs: null },
  usage: { inputTokens: 0, outputTokens: 0, estimatedCostMicros: 0 },
  lastErrorCode: null,
  retainUntil: null,
  updatedAt: "2026-10-09T00:00:00.000Z",
};

test("dossier generation is denied before source lookup when permission is missing", async () => {
  let sourceRead = false;
  let featureRead = false;
  const service = new AiDossierService({
    hasOutletFeature: async () => { featureRead = true; return true; },
    subjectExists: async () => { sourceRead = true; return true; },
    get: async () => pendingDossier,
    request: async () => {},
    recordFeedback: async () => {},
  }, { hasOutletPermission: async () => false }, () => true);

  await assert.rejects(
    service.request(database, tenantId, userId, outletId, "lead", subjectId),
    (error: unknown) => (error as { code?: string }).code === "PERMISSION_DENIED",
  );
  assert.equal(featureRead, false);
  assert.equal(sourceRead, false);
});

test("dossier generation requires the outlet preview flag and remains asynchronous", async () => {
  let requested = false;
  const disabled = new AiDossierService({
    hasOutletFeature: async () => false,
    subjectExists: async () => { throw new Error("should not read source"); },
    get: async () => null,
    request: async () => { requested = true; },
    recordFeedback: async () => {},
  }, { hasOutletPermission: async () => true }, () => true);
  await assert.rejects(
    disabled.request(database, tenantId, userId, outletId, "lead", subjectId),
    (error: unknown) => (error as { code?: string }).code === "AI_DOSSIER_NOT_AVAILABLE",
  );
  assert.equal(requested, false);

  const enabled = new AiDossierService({
    hasOutletFeature: async () => true,
    subjectExists: async () => true,
    get: async () => pendingDossier,
    request: async () => { requested = true; },
    recordFeedback: async () => {},
  }, { hasOutletPermission: async () => true }, () => true);
  const dossier = await enabled.request(database, tenantId, userId, outletId, "lead", subjectId);
  assert.equal(requested, true);
  assert.equal(dossier.status, "pending");
});

test("retry policy uses bounded exponential backoff and eventually fails", () => {
  assert.deepEqual(dossierRetryPlan(1), { status: "pending", delaySeconds: 60 });
  assert.deepEqual(dossierRetryPlan(4), { status: "pending", delaySeconds: 480 });
  assert.deepEqual(dossierRetryPlan(8), { status: "failed", delaySeconds: 3_600 });
  assert.deepEqual(dossierRetryPlan(20), { status: "failed", delaySeconds: 3_600 });
});

test("model output separates cited facts from explicitly uncalibrated estimates", () => {
  const synthesis = parseDossierSynthesis(JSON.stringify({
    factualSummary: "The lead requested a demo.",
    summaryEvidence: [{ sourceType: "lead", sourceId: subjectId }],
    facts: [{ statement: "The stage is FOLLOWUP.", evidence: [{ sourceType: "lead", sourceId: subjectId }] }],
    statedNeeds: [{ statement: "The customer requested a demo.", evidence: [{ sourceType: "lead", sourceId: subjectId }] }],
    explicitBudget: null,
    decisionMakers: [],
    risks: [{ statement: "The deal may slip.", classification: "estimate", evidence: [], rationale: "No recent completed activity." }],
    suggestedNextActions: [{ action: "Schedule the demo.", rationale: "The customer explicitly requested it." }],
    estimates: { winProbability: 0.5, churnRisk: null, calibrated: false },
  }));
  assert.equal(synthesis.estimates.calibrated, false);
  assert.doesNotThrow(() => assertEvidenceReferences(synthesis, [{ sourceType: "lead", sourceId: subjectId }]));
  assert.throws(
    () => assertEvidenceReferences(synthesis, [{ sourceType: "lead", sourceId: userId }]),
    /INVALID_EVIDENCE/,
  );
});

test("seller quotations alone cannot be presented as an explicit customer budget", () => {
  assert.throws(() => parseDossierSynthesis(JSON.stringify({
    factualSummary: "",
    summaryEvidence: [],
    facts: [],
    statedNeeds: [],
    explicitBudget: {
      amount: 100000,
      currency: "INR",
      statement: "Budget is INR 100,000.",
      evidence: [{ sourceType: "quotation", sourceId: subjectId }],
    },
    decisionMakers: [], risks: [], suggestedNextActions: [],
    estimates: { winProbability: null, churnRisk: null, calibrated: false },
  })), /INVALID_SCHEMA/);
});

test("migration makes staleness idempotent and enforces authorization, quotas, and retention", async () => {
  const migration = await readFile(path.resolve(process.cwd(), "migrations/0042_ai_customer_dossiers.sql"), "utf8");
  const worker = await readFile(path.resolve(process.cwd(), "scripts/synthesize-ai-customer-dossiers.ts"), "utf8");
  const backendFeatures = await readFile(path.resolve(process.cwd(), "src/utils/outletFeatureCatalog.ts"), "utf8");
  const frontendFeatures = await readFile(path.resolve(process.cwd(), "../src/features/outlets/utils/outletFeatures.ts"), "utf8");

  assert.match(migration, /UNIQUE \(tenant_id, outlet_id, subject_type, subject_id\)/);
  assert.match(migration, /status IN \('pending', 'synthesizing', 'ready', 'stale', 'failed'\)/);
  assert.match(migration, /timeline_ai_dossier_stale[\s\S]+AFTER INSERT OR UPDATE OR DELETE ON crm\.timeline_events/);
  assert.match(migration, /status = CASE WHEN dossier\.synthesized_at IS NULL THEN 'pending' ELSE 'stale' END/);
  assert.match(migration, /feature\.feature_key = 'ai_customer_dossiers' AND feature\.enabled/);
  assert.match(migration, /subject_type = 'lead' AND iam\.has_outlet_permission\(tenant_id, outlet_id, 'leads\.read'\)/);
  assert.match(migration, /subject_type = 'customer' AND iam\.has_outlet_permission\(tenant_id, outlet_id, 'customers\.read'\)/);
  assert.match(migration, /CHECK \(estimates_calibrated = false\)/);
  assert.match(migration, /CREATE TABLE crm\.ai_dossier_feedback/);
  assert.match(migration, /UNIQUE \(dossier_id, user_id\)/);
  assert.match(migration, /synthesis_duration_ms integer/);
  assert.doesNotMatch(migration, /GRANT (?:INSERT|UPDATE|DELETE).*ai_customer_dossiers.*sensible_app_role/);

  assert.match(worker, /FOR UPDATE SKIP LOCKED/);
  assert.match(worker, /WHERE crm\.ai_dossier_usage_daily\.request_count < \$3/);
  assert.match(worker, /retain_until = now\(\) \+ \(\$22 \* interval '1 day'\)/);
  assert.match(worker, /DELETE FROM crm\.ai_customer_dossiers[\s\S]+retain_until IS NOT NULL AND retain_until < now\(\)/);
  assert.match(worker, /WHERE id = \$1 AND lease_token = \$2 AND status = 'synthesizing'/);
  assert.match(worker, /assertEvidenceReferences\(result\.dossier, snapshot\.allowedEvidence\)/);
  assert.doesNotMatch(worker, /UPDATE crm\.(?:leads|customers)\b/);
  assert.match(backendFeatures, /DEFAULT_OUTLET_FEATURE_KEYS = FEATURE_KEYS\.filter\(\(key\) => key !== "ai_customer_dossiers"\)/);
  assert.match(frontendFeatures, /key !== OUTLET_FEATURE_KEYS\.AI_CUSTOMER_DOSSIERS/);
  assert.match(frontendFeatures, /ALL_OUTLET_FEATURE_KEYS\.filter\(\(key\) => selected\.has\(key\)\)/);
});
