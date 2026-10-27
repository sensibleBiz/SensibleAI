/**
 * Unit tests for the CRM assistant intent classifier.
 * These tests run with no database or Gemini API — they cover only the
 * deterministic classifyIntent() function.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent, type CrmIntent } from "../../src/modules/assistant/intent/intentClassifier.js";

const assertIntent = (message: string, expected: CrmIntent) => {
  const actual = classifyIntent(message);
  assert.equal(actual, expected, `"${message}" → expected ${expected}, got ${actual}`);
};

// ─── Scenario 1: pure sales advice (no data needed) ─────────────────────────

test('classifyIntent: "How can I improve my sales?" → SALES_ADVICE', () => {
  assertIntent("How can I improve my sales?", "SALES_ADVICE");
});

test('classifyIntent: "What are the best closing techniques?" → SALES_ADVICE', () => {
  assertIntent("What are the best closing techniques?", "SALES_ADVICE");
});

test('classifyIntent: "Give me follow-up tips for leads" → SALES_ADVICE', () => {
  assertIntent("Give me follow-up tips for leads", "SALES_ADVICE");
});

// ─── Scenario 2: CRM data — aggregate count ──────────────────────────────────

test('classifyIntent: "How many leads do I have?" → CRM_DATA', () => {
  assertIntent("How many leads do I have?", "CRM_DATA");
});

test('classifyIntent: "What is the total count of leads?" → CRM_DATA', () => {
  assertIntent("What is the total count of leads?", "CRM_DATA");
});

// ─── Scenario 3: CRM data — stage-specific count ─────────────────────────────

test('classifyIntent: "How many leads are in follow-up?" → CRM_DATA', () => {
  assertIntent("How many leads are in follow-up?", "CRM_DATA");
});

test('classifyIntent: "How many leads are in the FOLLOWUP stage?" → CRM_DATA', () => {
  assertIntent("How many leads are in the FOLLOWUP stage?", "CRM_DATA");
});

// ─── Scenario 4: data + advice — low conversion ──────────────────────────────

test('classifyIntent: "Why is my conversion rate low?" → DATA_PLUS_ADVICE', () => {
  assertIntent("Why is my conversion rate low?", "DATA_PLUS_ADVICE");
});

test('classifyIntent: "Why is my closing ratio so low?" → DATA_PLUS_ADVICE', () => {
  assertIntent("Why is my closing ratio so low?", "DATA_PLUS_ADVICE");
});

// ─── Scenario 5: CRM data — today's leads ────────────────────────────────────

test('classifyIntent: "Show me today\'s leads" → CRM_DATA', () => {
  assertIntent("Show me today's leads", "CRM_DATA");
});

test('classifyIntent: "List leads for today" → CRM_DATA', () => {
  assertIntent("List leads for today", "CRM_DATA");
});

// ─── Scenario 6: CRM data — yesterday's leads ────────────────────────────────

test('classifyIntent: "Show me the leads for yesterday" → CRM_DATA', () => {
  assertIntent("Show me the leads for yesterday", "CRM_DATA");
});

// ─── Scenario 7: unsupported — write/delete operations ───────────────────────

test('classifyIntent: "Delete this lead" → UNSUPPORTED', () => {
  assertIntent("Delete this lead", "UNSUPPORTED");
});

test('classifyIntent: "Remove lead record" → UNSUPPORTED', () => {
  assertIntent("Remove lead record", "UNSUPPORTED");
});

test('classifyIntent: "Send email to customer" → UNSUPPORTED', () => {
  assertIntent("Send email to customer", "UNSUPPORTED");
});

test('classifyIntent: "Create a new lead for Ravi" → UNSUPPORTED', () => {
  assertIntent("Create a new lead for Ravi", "UNSUPPORTED");
});

// ─── Scenario 8: data + advice — closing ratio improvement ───────────────────

test('classifyIntent: "how to increase my current closing ratio" → DATA_PLUS_ADVICE', () => {
  assertIntent("how to increase my current closing ratio", "DATA_PLUS_ADVICE");
});

test('classifyIntent: "how do I improve my conversion rate?" → DATA_PLUS_ADVICE', () => {
  assertIntent("how do I improve my conversion rate?", "DATA_PLUS_ADVICE");
});

// ─── Scenario 9: large history / generic (classifyIntent is stateless) ────────

test('classifyIntent: empty string → GENERAL_CRM', () => {
  assertIntent("", "GENERAL_CRM");
});

test('classifyIntent: "What is CRM?" → GENERAL_CRM', () => {
  assertIntent("What is CRM?", "GENERAL_CRM");
});

// ─── Scenario 10: zero / empty result (no intent change) ─────────────────────

test('classifyIntent: "Do I have any leads?" → CRM_DATA', () => {
  assertIntent("Do I have any leads?", "CRM_DATA");
});

// ─── Scenario 11: mixed — count + advice ─────────────────────────────────────

test('classifyIntent: "How many follow-up leads do I have and how should I handle them?" → DATA_PLUS_ADVICE', () => {
  assertIntent(
    "How many follow-up leads do I have and how should I handle them?",
    "DATA_PLUS_ADVICE",
  );
});

// ─── Scenario 12: funnel analysis ────────────────────────────────────────────

test('classifyIntent: "Analyze my sales funnel and tell me what I should focus on" → DATA_PLUS_ADVICE', () => {
  assertIntent(
    "Analyze my sales funnel and tell me what I should focus on",
    "DATA_PLUS_ADVICE",
  );
});

test('classifyIntent: "Why are so many leads stuck in follow-up?" → DATA_PLUS_ADVICE', () => {
  assertIntent("Why are so many leads stuck in follow-up?", "DATA_PLUS_ADVICE");
});

// ─── Scenario 13: UNSUPPORTED — non-CRM topics (holiday, payroll, expense) ───

test('classifyIntent: "Show me holiday calendar" → UNSUPPORTED', () => {
  assertIntent("Show me holiday calendar", "UNSUPPORTED");
});

test('classifyIntent: "what are the public holidays this month" → UNSUPPORTED', () => {
  assertIntent("what are the public holidays this month", "UNSUPPORTED");
});

test('classifyIntent: "my payroll details" → UNSUPPORTED', () => {
  assertIntent("my payroll details", "UNSUPPORTED");
});

test('classifyIntent: "how to check my leave balance" → UNSUPPORTED', () => {
  assertIntent("how to check my leave balance", "UNSUPPORTED");
});

test('classifyIntent: "today\'s expense" → UNSUPPORTED', () => {
  assertIntent("today's expense", "UNSUPPORTED");
});

test('classifyIntent: "show all expense claims" → UNSUPPORTED', () => {
  assertIntent("show all expense claims", "UNSUPPORTED");
});

test('classifyIntent: "book a meeting with Ravi" → UNSUPPORTED', () => {
  assertIntent("book a meeting with Ravi", "UNSUPPORTED");
});

// ─── Scenario 14: TARGET_WRITE — various phrasings ───────────────────────────

test('classifyIntent: "set 300000 target to all employee" → TARGET_WRITE', () => {
  assertIntent("set 300000 target to all employee", "TARGET_WRITE");
});

test('classifyIntent: "give everyone a 50000 target" → TARGET_WRITE', () => {
  assertIntent("give everyone a 50000 target", "TARGET_WRITE");
});

test('classifyIntent: "set target for all employees in South zone" → TARGET_WRITE', () => {
  assertIntent("set target for all employees in South zone", "TARGET_WRITE");
});

test('classifyIntent: "set Ravi\'s target to 5 lakh" → TARGET_WRITE', () => {
  assertIntent("set Ravi's target to 5 lakh", "TARGET_WRITE");
});

test('classifyIntent: "assign target of 200000 to Arav" → TARGET_WRITE', () => {
  assertIntent("assign target of 200000 to Arav", "TARGET_WRITE");
});

test('classifyIntent: "update the target for south zone" → TARGET_WRITE', () => {
  assertIntent("update the target for south zone", "TARGET_WRITE");
});

test('classifyIntent: "₹500000 target for all staff" → TARGET_WRITE', () => {
  assertIntent("₹500000 target for all staff", "TARGET_WRITE");
});

// ─── Scenario 15: sanitizeAnswer — directive line stripping ──────────────────
// sanitizeAnswer is not exported; we verify the intent here using classifyIntent
// as a lightweight sanity check that the module imports cleanly.

test('classifyIntent does not throw on very long input', () => {
  const longMsg = "How many leads ".repeat(300);
  const result = classifyIntent(longMsg);
  assert.ok(["CRM_DATA", "GENERAL_CRM", "SALES_ADVICE", "DATA_PLUS_ADVICE", "TARGET_WRITE", "UNSUPPORTED"].includes(result));
});

test('classifyIntent is case-insensitive for UNSUPPORTED patterns', () => {
  assertIntent("SEND WHATSAPP TO CUSTOMER", "UNSUPPORTED");
  assertIntent("DELETE LEAD", "UNSUPPORTED");
});

test('classifyIntent is case-insensitive for TARGET_WRITE patterns', () => {
  assertIntent("SET TARGET FOR ALL EMPLOYEES", "TARGET_WRITE");
  assertIntent("GIVE 300000 TARGET TO EVERYONE", "TARGET_WRITE");
});
