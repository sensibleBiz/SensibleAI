import assert from "node:assert/strict";
import { test } from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import {
  AiAgentActionsService,
  isValidAiActionTransition,
} from "../src/modules/aiAgentActions/aiAgentActions.service.js";
import type {
  AiAgentActionRecord,
  AiAgentActionsRepository,
  ProposalInsert,
} from "../src/modules/aiAgentActions/aiAgentActions.repository.js";
import { aiAgentActionProposalSchema } from "../src/modules/aiAgentActions/aiAgentActions.validator.js";

const tenantId = "01994abc-0000-7000-8000-000000000001";
const outletId = "01994abc-0000-7000-8000-000000000021";
const leadId = "01994abc-0000-7000-8000-000000000101";
const proposerId = "01994abc-0000-7000-8000-000000000051";
const reviewerId = "01994abc-0000-7000-8000-000000000052";
const actionId = "01994abc-0000-7000-8000-000000000201";
const databaseQueries: string[] = [];
const database = {
  client: {
    query: async (query: string) => {
      databaseQueries.push(query);
      if (query.includes("FROM crm.leads")) {
        return { rows: [{ stage: "NEW", assigned_to_user_id: null }] };
      }
      if (query.includes("FROM crm.business_pipeline_stages")) {
        return { rows: [{ stage_category: "OPEN" }] };
      }
      return { rows: [] };
    },
  },
} as unknown as TransactionDatabase;

const actionRecord = (overrides: Partial<AiAgentActionRecord> = {}): AiAgentActionRecord => ({
  id: actionId,
  tenantId,
  outletId,
  agentId: "sensible-crm-assistant",
  modelId: "gemini-test-model",
  actionType: "lead.stage_change",
  targetType: "lead",
  targetId: leadId,
  contextRefs: [],
  decisionSummary: "Move this lead to follow-up",
  reasonCodes: ["STALE_FOLLOW_UP"],
  proposedPayload: { stage: "FOLLOWUP" },
  status: "PROPOSED",
  createdByUserId: proposerId,
  lastChangedByUserId: proposerId,
  reviewerUserId: null,
  reviewComment: null,
  reviewedAt: null,
  executedByUserId: null,
  executedAt: null,
  failedAt: null,
  cancelledByUserId: null,
  cancelledAt: null,
  executionMode: "mock",
  executionResult: null,
  errorCode: null,
  promptTokens: null,
  completionTokens: null,
  estimatedCost: null,
  idempotencyKey: "request-12345678",
  createdAt: new Date("2026-10-09T00:00:00.000Z"),
  updatedAt: new Date("2026-10-09T00:00:00.000Z"),
  ...overrides,
});

const repository = (
  overrides: Partial<Pick<
    AiAgentActionsRepository,
    "createProposal" | "get" | "list" | "history" | "review" | "finishMockExecution" | "cancel"
  >> = {},
) => ({
  createProposal: async () => ({ action: actionRecord(), created: true, sameRequest: true }),
  get: async () => actionRecord(),
  list: async () => [],
  history: async () => [],
  review: async () => actionRecord({ status: "APPROVED", reviewerUserId: reviewerId }),
  finishMockExecution: async () => actionRecord({
    status: "EXECUTED",
    executedByUserId: reviewerId,
    executionResult: { mode: "mock", simulated: true },
  }),
  cancel: async () => actionRecord({ status: "CANCELLED" }),
  ...overrides,
}) satisfies Pick<
  AiAgentActionsRepository,
  "createProposal" | "get" | "list" | "history" | "review" | "finishMockExecution" | "cancel"
>;

const authorizer = (allowed: string[] = [
  "ai_actions.read", "ai_actions.propose", "ai_actions.review",
  "leads.read", "leads.update", "leads.assign", "customers.read", "whatsapp.messages.send",
]) => ({
  hasOutletPermission: async (
    _database: TransactionDatabase,
    _userId: string,
    _tenantId: string,
    _outletId: string,
    permission: string,
  ) => allowed.includes(permission),
});

const stageChangeProposal = {
  outletId,
  actionType: "lead.stage_change",
  targetType: "lead",
  targetId: leadId,
  decisionSummary: "Move lead; contact ada@example.com",
  reasonCodes: ["STALE_FOLLOW_UP"],
  contextRefs: [{ type: "lead", id: leadId }],
  proposedPayload: { stage: "FOLLOWUP" },
  idempotencyKey: "request-12345678",
} as const;

test("AI action workflow permits only guarded state transitions", () => {
  assert.equal(isValidAiActionTransition("PROPOSED", "APPROVED"), true);
  assert.equal(isValidAiActionTransition("PROPOSED", "REJECTED"), true);
  assert.equal(isValidAiActionTransition("APPROVED", "EXECUTED"), true);
  assert.equal(isValidAiActionTransition("APPROVED", "FAILED"), true);
  assert.equal(isValidAiActionTransition("FAILED", "CANCELLED"), true);
  assert.equal(isValidAiActionTransition("REJECTED", "APPROVED"), false);
  assert.equal(isValidAiActionTransition("EXECUTED", "EXECUTED"), false);
});

test("action proposals accept bounded safe payloads but no message body or chain-of-thought field", () => {
  assert.equal(aiAgentActionProposalSchema.safeParse(stageChangeProposal).success, true);
  assert.equal(aiAgentActionProposalSchema.safeParse({
    ...stageChangeProposal,
    actionType: "customer.message.send",
    targetType: "customer",
    proposedPayload: { channel: "whatsapp", templateKey: "follow_up", body: "send this text" },
  }).success, false);
  assert.equal(aiAgentActionProposalSchema.safeParse({
    ...stageChangeProposal,
    chainOfThought: "private reasoning",
  }).success, false);
});

test("proposal creation enforces permissions, redacts summaries, and binds idempotency to one proposal", async () => {
  const stored: ProposalInsert[] = [];
  const repo = repository({
    createProposal: async (_db, input) => {
      stored.push(input);
      return { action: actionRecord({ decisionSummary: input.decisionSummary }), created: true, sameRequest: true };
    },
  });
  const service = new AiAgentActionsService(repo, authorizer());
  const parsed = aiAgentActionProposalSchema.parse(stageChangeProposal);
  const result = await service.propose(database, tenantId, proposerId, parsed);

  assert.equal(result.action.decisionSummary, "Move lead; contact [redacted]");
  assert.equal(result.action.executionMode, "mock");
  assert.equal(stored[0]?.idempotencyKey, "request-12345678");
  assert.equal("promptTokens" in (stored[0] ?? {}), false);

  const deniedService = new AiAgentActionsService(repo, authorizer(["ai_actions.propose"]));
  await assert.rejects(
    deniedService.propose(database, tenantId, proposerId, parsed),
    (error: unknown) => (error as { code?: string }).code === "PERMISSION_DENIED",
  );
});

test("free-form follow-up proposal text is scrubbed before storage", async () => {
  let storedPayload: Record<string, unknown> | null = null;
  const repo = repository({
    createProposal: async (_db, input) => {
      storedPayload = input.proposedPayload;
      return { action: actionRecord(), created: true, sameRequest: true };
    },
  });
  const service = new AiAgentActionsService(repo, authorizer());
  const proposal = aiAgentActionProposalSchema.parse({
    ...stageChangeProposal,
    actionType: "lead.follow_up_suggestion",
    proposedPayload: { suggestion: "Call 9123456789 or email lead@example.com" },
  });

  await service.propose(database, tenantId, proposerId, proposal);
  assert.deepEqual(storedPayload, { suggestion: "Call [redacted] or email [redacted]" });
});

test("a proposer cannot approve their own proposal", async () => {
  const service = new AiAgentActionsService(repository(), authorizer());
  await assert.rejects(
    service.review(database, tenantId, proposerId, outletId, actionId, "approve"),
    (error: unknown) => (error as { code?: string }).code === "AI_ACTION_SELF_REVIEW_DENIED",
  );
});

test("execution rechecks approval, authorization and target rules and only performs mock reads", async () => {
  databaseQueries.length = 0;
  let finishCount = 0;
  const service = new AiAgentActionsService(repository({
    get: async () => actionRecord({ status: "APPROVED", reviewerUserId: reviewerId }),
    finishMockExecution: async (_db, _tenant, _outlet, _id, status, result) => {
      finishCount++;
      assert.equal(status, "EXECUTED");
      assert.equal(result.mode, "mock");
      assert.equal(result.simulated, true);
      return actionRecord({ status, executedByUserId: reviewerId, executionResult: result });
    },
  }), authorizer());

  const result = await service.executeMock(database, tenantId, reviewerId, outletId, actionId);
  assert.equal(result.action.status, "EXECUTED");
  assert.equal(result.action.executionResult?.simulated, true);
  assert.equal(finishCount, 1);
  assert.equal(databaseQueries.every((query) => query.trimStart().startsWith("SELECT")), true);
});

test("retrying a completed mock execution returns the recorded result without re-executing", async () => {
  let finishCount = 0;
  const service = new AiAgentActionsService(repository({
    get: async () => actionRecord({
      status: "EXECUTED",
      executedByUserId: reviewerId,
      executionResult: { mode: "mock", simulated: true },
    }),
    finishMockExecution: async () => {
      finishCount++;
      return actionRecord({ status: "EXECUTED" });
    },
  }), authorizer());

  const result = await service.executeMock(database, tenantId, reviewerId, outletId, actionId);
  assert.equal(result.replayed, true);
  assert.equal(finishCount, 0);
});
