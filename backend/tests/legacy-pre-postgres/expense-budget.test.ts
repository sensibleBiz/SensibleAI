import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { AppError } from "../src/errors/appError.js";
import { expenseBudgetAllocationId, expenseBudgetRepository } from "../src/repositories/expenseBudget.repository.js";
import {
  assertExpenseTransitionAllowed,
  calculateAllocationAdjustment,
  calculateBudgetBalance,
  isSameMoney,
  normalizeMoney,
} from "../src/services/expenseBudgetCalculations.js";
import { expenseBudgetService } from "../src/services/expenseBudget.service.js";
import type { ExpenseBudgetAllocation } from "../src/types/expenseBudget.types.js";
import {
  expenseBudgetCreateBodySchema,
  expenseBudgetSummaryQuerySchema,
  expenseStatusBodySchema,
} from "../src/validators/expenseBudget.validator.js";

const originalListMonthAllocations = expenseBudgetRepository.listMonthAllocations;
const originalListMonthExpenses = expenseBudgetRepository.listMonthExpenses;
const originalListTeam = expenseBudgetRepository.listTeam;
const originalListExpenseCategories = expenseBudgetRepository.listExpenseCategories;
const originalResolveAllocationTarget = expenseBudgetRepository.resolveAllocationTarget;
const originalCreateAllocation = expenseBudgetRepository.createAllocation;

afterEach(() => {
  expenseBudgetRepository.listMonthAllocations = originalListMonthAllocations;
  expenseBudgetRepository.listMonthExpenses = originalListMonthExpenses;
  expenseBudgetRepository.listTeam = originalListTeam;
  expenseBudgetRepository.listExpenseCategories = originalListExpenseCategories;
  expenseBudgetRepository.resolveAllocationTarget = originalResolveAllocationTarget;
  expenseBudgetRepository.createAllocation = originalCreateAllocation;
});

const allocation = (overrides: Partial<ExpenseBudgetAllocation> = {}): ExpenseBudgetAllocation => ({
  id: "2026-08__DEPARTMENT__SFI",
  month: "2026-08",
  targetType: "DEPARTMENT",
  targetId: "HR",
  targetLabel: "HR",
  originalAllocatedAmount: 20_000,
  allocatedAmount: 20_000,
  usedAmount: 0,
  remainingAmount: 20_000,
  approvedExpenseCount: 0,
  currency: "INR",
  status: "ACTIVE",
  revision: 1,
  createdBy: "owner-1",
  createdAt: 1,
  updatedBy: "owner-1",
  updatedAt: 1,
  ...overrides,
});

test("budget validation accepts canonical months and deterministic money", () => {
  const value = expenseBudgetCreateBodySchema.parse({
    outletId: "outlet-1",
    month: "2026-08",
    targetType: "DEPARTMENT",
    targetId: "HR",
    allocatedAmount: 20_000.5,
  });
  assert.equal(value.month, "2026-08");
  assert.equal(normalizeMoney(value.allocatedAmount), 20_000.5);
  assert.equal(
    expenseBudgetSummaryQuerySchema.safeParse({
      outletId: "outlet-1",
      month: "08-2026",
    }).success,
    false,
  );
  assert.equal(
    expenseBudgetCreateBodySchema.safeParse({ ...value, allocatedAmount: 0 }).success,
    false,
  );
  assert.equal(
    expenseBudgetCreateBodySchema.safeParse({ ...value, allocatedAmount: 1.005 }).success,
    false,
  );
});

test("allocation IDs enforce one monthly allocation per target", () => {
  const first = expenseBudgetAllocationId("2026-08", "DEPARTMENT", "HR");
  const retry = expenseBudgetAllocationId("2026-08", "DEPARTMENT", "HR");
  const nextMonth = expenseBudgetAllocationId("2026-09", "DEPARTMENT", "HR");
  assert.equal(first, retry);
  assert.notEqual(first, nextMonth);
  assert.equal(first.includes("/"), false);
});

test("the required August scenario deducts only approved expenses", () => {
  let usedAmount = 0;
  let state = calculateBudgetBalance({
    allocatedAmount: 20_000,
    usedAmount,
    usedDelta: 2_000,
    allowOverspend: false,
  });
  usedAmount = state.usedAmount;
  assert.deepEqual(state, { usedAmount: 2_000, remainingAmount: 18_000 });

  // Pending and rejected expenses never call the budget mutation.
  assert.equal(usedAmount, 2_000);

  state = calculateBudgetBalance({
    allocatedAmount: 20_000,
    usedAmount,
    usedDelta: 5_000,
    allowOverspend: false,
  });
  assert.deepEqual(state, { usedAmount: 7_000, remainingAmount: 13_000 });
});

test("approval reversal restores the exact applied amount", () => {
  const approved = calculateBudgetBalance({
    allocatedAmount: 20_000,
    usedAmount: 0,
    usedDelta: 5_000,
    allowOverspend: false,
  });
  const reversed = calculateBudgetBalance({
    allocatedAmount: 20_000,
    usedAmount: approved.usedAmount,
    usedDelta: -5_000,
    allowOverspend: false,
  });
  assert.deepEqual(reversed, { usedAmount: 0, remainingAmount: 20_000 });
  assert.equal(isSameMoney(5_000, 5_000), true);
});

test("over-budget and concurrent approval calculations reject the losing approval", () => {
  const firstApproval = calculateBudgetBalance({
    allocatedAmount: 10_000,
    usedAmount: 0,
    usedDelta: 6_000,
    allowOverspend: false,
  });
  assert.equal(firstApproval.remainingAmount, 4_000);
  assert.throws(
    () =>
      calculateBudgetBalance({
        allocatedAmount: 10_000,
        usedAmount: firstApproval.usedAmount,
        usedDelta: 5_000,
        allowOverspend: false,
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "INSUFFICIENT_EXPENSE_BUDGET" &&
      error.message.includes("₹4,000"),
  );

  const ownerOverride = calculateBudgetBalance({
    allocatedAmount: 10_000,
    usedAmount: firstApproval.usedAmount,
    usedDelta: 5_000,
    allowOverspend: true,
  });
  assert.equal(ownerOverride.remainingAmount, -1_000);
});

test("allocation cannot be reduced below usage without explicit override", () => {
  assert.throws(
    () =>
      calculateAllocationAdjustment({
        allocatedAmount: 7_999,
        usedAmount: 8_000,
        allowOverspend: false,
      }),
    { code: "ALLOCATION_BELOW_USED_AMOUNT" },
  );
  assert.equal(
    calculateAllocationAdjustment({
      allocatedAmount: 7_999,
      usedAmount: 8_000,
      allowOverspend: true,
    }).remainingAmount,
    -1,
  );
});

test("status rules enforce review, approval, reversal, and rejection permissions", () => {
  assert.doesNotThrow(() =>
    assertExpenseTransitionAllowed({
      currentStatus: "PENDING",
      nextStatus: "REVIEWED",
      permissions: { canReview: true, canApprove: false, canOverspend: false },
    }),
  );
  assert.doesNotThrow(() =>
    assertExpenseTransitionAllowed({
      currentStatus: "APPROVED",
      nextStatus: "REJECTED",
      permissions: { canReview: false, canApprove: true, canOverspend: false },
    }),
  );
  assert.doesNotThrow(() =>
    assertExpenseTransitionAllowed({
      currentStatus: "REJECTED",
      nextStatus: "APPROVED",
      permissions: { canReview: false, canApprove: true, canOverspend: false },
    }),
  );
  assert.throws(
    () =>
      assertExpenseTransitionAllowed({
        currentStatus: "PENDING",
        nextStatus: "APPROVED",
        permissions: { canReview: true, canApprove: true, canOverspend: false },
      }),
    { code: "INVALID_EXPENSE_STATUS_TRANSITION" },
  );
  assert.equal(
    expenseStatusBodySchema.safeParse({
      outletId: "outlet-1",
      status: "REJECTED",
    }).success,
    false,
  );
});

test("summary integration reports approved, pending, rejected, and breakdown totals", async () => {
  expenseBudgetRepository.listMonthAllocations = async () => [
    allocation({ usedAmount: 7_000, remainingAmount: 13_000, approvedExpenseCount: 2 }),
  ];
  expenseBudgetRepository.listMonthExpenses = async () => [
    { id: "a", amount: 2_000, createdDate: 1, monthId: "2026-08", userId: "employee-a", expCatRefId: "travel", status: "APPROVED", approvedBy: "hr-1" },
    { id: "b", amount: 3_000, createdDate: 2, monthId: "2026-08", userId: "employee-b", expCatRefId: "petrol", status: "REJECTED" },
    { id: "c", amount: 5_000, createdDate: 3, monthId: "2026-08", userId: "employee-c", expCatRefId: "stay", status: "APPROVED", approvedBy: "hr-1" },
    { id: "d", amount: 1_000, createdDate: 4, monthId: "2026-08", userId: "employee-a", expCatRefId: "travel", status: "PENDING" },
  ];
  expenseBudgetRepository.listTeam = async () => [
    { userProfileId: "hr-1", userName: "HR One", department: "HR", isActive: true },
    { userProfileId: "employee-a", userName: "Employee A", department: "SALES", isActive: true },
    { userProfileId: "employee-b", userName: "Employee B", department: "SALES", isActive: true },
    { userProfileId: "employee-c", userName: "Employee C", department: "SUPPORT", isActive: true },
  ];
  expenseBudgetRepository.listExpenseCategories = async () =>
    new Map([
      ["travel", "Travel"],
      ["petrol", "Petrol"],
      ["stay", "Stay"],
    ]);

  const summary = await expenseBudgetService.getSummary(
    { outletId: "outlet-1", month: "2026-08" },
    "hr-1",
  );
  assert.equal(summary.currentAllocation?.targetId, "HR");
  assert.equal(summary.totals.approvedAmount, 7_000);
  assert.equal(summary.totals.pendingAmount, 1_000);
  assert.equal(summary.totals.rejectedAmount, 3_000);
  assert.equal(summary.breakdowns.categories.find((row) => row.id === "travel")?.expenseCount, 2);
  assert.equal(summary.breakdowns.teams.length, 1);
});

test("create allocation integration validates the target before writing", async () => {
  const calls: string[] = [];
  expenseBudgetRepository.resolveAllocationTarget = async (_outlet, type, id) => {
    calls.push(`resolve:${type}:${id}`);
    return { targetId: "HR", targetLabel: "HR" };
  };
  expenseBudgetRepository.createAllocation = async (input, actorId, target) => {
    calls.push(`create:${input.month}:${actorId}:${target.targetId}`);
    return { allocation: allocation(), created: true };
  };

  const result = await expenseBudgetService.createAllocation(
    {
      outletId: "outlet-1",
      month: "2026-08",
      targetType: "DEPARTMENT",
      targetId: "hr",
      allocatedAmount: 20_000,
    },
    "owner-1",
  );
  assert.equal(result.created, true);
  assert.deepEqual(calls, [
    "resolve:DEPARTMENT:hr",
    "create:2026-08:owner-1:HR",
  ]);
});
