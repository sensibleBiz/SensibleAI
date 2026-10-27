import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { AppError } from "../src/errors/appError.js";
import {
  assertExpenseTransitionAllowed,
  calculateBudgetBalance,
} from "../src/services/expenseBudgetCalculations.js";

test("B9 PostgreSQL expense router is mounted; legacy expense router removed", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(routes, /apiRouter\.use\("\/", postgresExpenseRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/", expenseBudgetRouter\)/);
});

test("B9 migration defines expense tables with RLS and permissions", async () => {
  const migration = await readFile(new URL("../migrations/0014_phase_b9_expense_budget.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE crm\.expense_budget_allocations/);
  assert.match(migration, /CREATE TABLE crm\.expenses/);
  assert.match(migration, /CREATE TABLE crm\.expense_status_history/);
  assert.match(migration, /expense\.read/);
  assert.match(migration, /expense\.budget\.allocate/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /backfill|\betl\b|firestore/i);
});

test("B9 golden budget remaining equals allocated minus used", () => {
  const balance = calculateBudgetBalance({
    allocatedAmount: 10_000,
    usedAmount: 0,
    usedDelta: 2_500,
    allowOverspend: false,
  });
  assert.equal(balance.usedAmount, 2_500);
  assert.equal(balance.remainingAmount, 7_500);
  assert.throws(
    () => calculateBudgetBalance({
      allocatedAmount: 10_000,
      usedAmount: 9_000,
      usedDelta: 2_000,
      allowOverspend: false,
    }),
    (error: unknown) => error instanceof AppError && error.code === "INSUFFICIENT_EXPENSE_BUDGET",
  );
});

test("B9 expense workflow rejects invalid status transitions", () => {
  assert.throws(
    () => assertExpenseTransitionAllowed({
      currentStatus: "PENDING",
      nextStatus: "APPROVED",
      permissions: { canReview: true, canApprove: true, canOverspend: false },
    }),
    (error: unknown) => error instanceof AppError && error.code === "INVALID_EXPENSE_STATUS_TRANSITION",
  );
  assert.doesNotThrow(() => assertExpenseTransitionAllowed({
    currentStatus: "PENDING",
    nextStatus: "REVIEWED",
    permissions: { canReview: true, canApprove: false, canOverspend: false },
  }));
});

test("B9 postgres expense modules do not import Firestore", async () => {
  const files = [
    "../src/modules/expense/postgresExpense.repository.ts",
    "../src/modules/expense/postgresExpense.service.ts",
    "../src/modules/expense/postgresExpense.controller.ts",
    "../src/modules/expense/postgresExpense.routes.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /firebase-admin|firestore|expenseBudget\.repository/);
  }
});
