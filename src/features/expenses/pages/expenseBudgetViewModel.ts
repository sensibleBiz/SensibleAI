import type { ExpenseBudgetSummaryDTO, ExpenseBudgetTargetType, ExpenseBudgetTransactionDTO } from "../types/types";
import type { TeamTreeDTO } from "@/features/team";

export const EXPENSE_BUDGET_TRANSACTION_LABELS: Record<
  ExpenseBudgetTransactionDTO["type"],
  string
> = {
  ALLOCATION_CREATED: "Allocation created",
  ALLOCATION_ADJUSTED: "Allocation adjusted",
  EXPENSE_APPROVED: "Expense approved",
  EXPENSE_APPROVAL_REVERSED: "Approval reversed",
  EXPENSE_AMOUNT_ADJUSTED: "Approved amount adjusted",
  APPROVED_EXPENSE_DELETED: "Approved expense deleted",
};

export const EXPENSE_BUDGET_TARGET_TYPE_LABELS: Record<
  ExpenseBudgetTargetType,
  string
> = {
  DEPARTMENT: "Department / HR",
  USER: "HR / Manager user",
  MANAGER_TEAM: "Manager team",
};

export const formatExpenseBudgetCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);

export const getExpenseBudgetDisplayMetrics = (
  summary: ExpenseBudgetSummaryDTO | null,
) => summary?.currentAllocation ?? summary?.totals ?? null;

const formatLabel = (value?: string) => {
  const words = String(value ?? "")
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);
  return words
    .map((word) =>
      ["HR", "IT"].includes(word.toUpperCase())
        ? word.toUpperCase()
        : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join(" ");
};

export const getExpenseBudgetTargetOptions = (
  teamTree: TeamTreeDTO[],
  targetType?: ExpenseBudgetTargetType,
) => {
  const activeTeam = teamTree.filter((member) => member.isActive);
  if (targetType === "DEPARTMENT") {
    return [...new Set(
      activeTeam
        .map((member) => member.department?.trim().toUpperCase())
        .filter((value): value is string => Boolean(value)),
    )]
      .sort()
      .map((department) => ({ label: formatLabel(department), value: department }));
  }

  if (targetType === "MANAGER_TEAM") {
    const managerIds = new Set(
      activeTeam
        .map((member) => member.teamHeadProfileId)
        .filter((value): value is string => Boolean(value)),
    );
    return activeTeam
      .filter(
        (member) =>
          managerIds.has(member.userProfileId) || member.roleInZone === "MANAGER",
      )
      .map((member) => ({
        label: `${formatLabel(member.userName) || "Manager"} Team`,
        value: member.userProfileId,
      }));
  }

  return activeTeam
    .slice()
    .sort((first, second) => first.userName.localeCompare(second.userName))
    .map((member) => ({
      label: `${formatLabel(member.userName) || "User"}${
        member.department ? ` · ${formatLabel(member.department)}` : ""
      }`,
      value: member.userProfileId,
    }));
};
