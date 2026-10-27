import { AppError } from "../errors/appError.js";
import type {
  ExpenseStatus,
  ExpenseTransitionPermissions,
} from "../types/expenseBudget.types.js";

const MONEY_SCALE = 100;

export const toMinorUnits = (amount: number) => {
  if (!Number.isFinite(amount)) {
    throw new AppError(400, "Amount must be a finite number", "INVALID_AMOUNT");
  }

  return Math.round((amount + Number.EPSILON) * MONEY_SCALE);
};

export const fromMinorUnits = (amount: number) => amount / MONEY_SCALE;

export const normalizeMoney = (amount: number) =>
  fromMinorUnits(toMinorUnits(amount));

export const formatInr = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);

export const calculateBudgetBalance = ({
  allocatedAmount,
  usedAmount,
  usedDelta,
  allowOverspend,
}: {
  allocatedAmount: number;
  usedAmount: number;
  usedDelta: number;
  allowOverspend: boolean;
}) => {
  const allocatedMinor = toMinorUnits(allocatedAmount);
  const currentUsedMinor = toMinorUnits(usedAmount);
  const deltaMinor = toMinorUnits(usedDelta);
  const nextUsedMinor = currentUsedMinor + deltaMinor;
  const nextRemainingMinor = allocatedMinor - nextUsedMinor;

  if (nextUsedMinor < 0) {
    throw new AppError(
      409,
      "Expense budget usage cannot be less than zero",
      "INVALID_BUDGET_REVERSAL",
    );
  }

  if (nextRemainingMinor < 0 && !allowOverspend) {
    const available = fromMinorUnits(
      Math.max(0, allocatedMinor - currentUsedMinor),
    );
    throw new AppError(
      409,
      `Insufficient expense budget. Available: ${formatInr(available)}.`,
      "INSUFFICIENT_EXPENSE_BUDGET",
    );
  }

  return {
    usedAmount: fromMinorUnits(nextUsedMinor),
    remainingAmount: fromMinorUnits(nextRemainingMinor),
  };
};

export const calculateAllocationAdjustment = ({
  allocatedAmount,
  usedAmount,
  allowOverspend,
}: {
  allocatedAmount: number;
  usedAmount: number;
  allowOverspend: boolean;
}) => {
  const allocatedMinor = toMinorUnits(allocatedAmount);
  const usedMinor = toMinorUnits(usedAmount);

  if (allocatedMinor < usedMinor && !allowOverspend) {
    throw new AppError(
      409,
      `Allocated amount cannot be less than used amount (${formatInr(
        fromMinorUnits(usedMinor),
      )}).`,
      "ALLOCATION_BELOW_USED_AMOUNT",
    );
  }

  return {
    allocatedAmount: fromMinorUnits(allocatedMinor),
    remainingAmount: fromMinorUnits(allocatedMinor - usedMinor),
  };
};

export const isSameMoney = (first: number, second: number) =>
  toMinorUnits(first) === toMinorUnits(second);

export const expenseBudgetAllocationId = (
  month: string,
  targetType: string,
  targetId: string,
) => `${month}__${targetType}__${Buffer.from(targetId.trim(), "utf8").toString("base64url")}`;

export const assertExpenseTransitionAllowed = ({
  currentStatus,
  nextStatus,
  permissions,
}: {
  currentStatus: ExpenseStatus;
  nextStatus: Exclude<ExpenseStatus, "PENDING">;
  permissions: ExpenseTransitionPermissions;
}) => {
  if (currentStatus === nextStatus) {
    const permitted =
      nextStatus === "REVIEWED"
        ? permissions.canReview
        : nextStatus === "APPROVED"
          ? permissions.canApprove
          : permissions.canReview || permissions.canApprove;
    if (!permitted) {
      throw new AppError(403, "You cannot change this expense status", "PERMISSION_DENIED");
    }
    return;
  }

  const allowed =
    (currentStatus === "PENDING" &&
      nextStatus === "REVIEWED" &&
      permissions.canReview) ||
    (currentStatus === "PENDING" &&
      nextStatus === "REJECTED" &&
      permissions.canReview) ||
    (currentStatus === "REVIEWED" &&
      ["APPROVED", "REJECTED"].includes(nextStatus) &&
      permissions.canApprove) ||
    (currentStatus === "APPROVED" &&
      nextStatus === "REJECTED" &&
      permissions.canApprove) ||
    (currentStatus === "REJECTED" &&
      nextStatus === "APPROVED" &&
      permissions.canApprove);

  if (!allowed) {
    throw new AppError(
      409,
      `Expense cannot change from ${currentStatus} to ${nextStatus}`,
      "INVALID_EXPENSE_STATUS_TRANSITION",
    );
  }
};
