import type {
  ExpenseBudgetAllocation,
  ExpenseBudgetBreakdownRow,
  ExpenseBudgetSummary,
  ExpenseBudgetTeamMember,
  ExpenseDocument,
} from "../types/expenseBudget.types.js";
import { normalizeMoney } from "./expenseBudgetCalculations.js";

const normalizeDepartment = (value?: string) =>
  String(value ?? "").trim().toUpperCase();

const expenseStatus = (expense: ExpenseDocument) =>
  expense.status ?? "PENDING";

const totalForStatuses = (
  expenses: ExpenseDocument[],
  statuses: string[],
) =>
  normalizeMoney(
    expenses
      .filter((expense) => statuses.includes(expenseStatus(expense)))
      .reduce((sum, expense) => sum + expense.amount, 0),
  );

const buildBreakdown = ({
  expenses,
  getKey,
  getLabel,
}: {
  expenses: ExpenseDocument[];
  getKey: (expense: ExpenseDocument) => string;
  getLabel: (expense: ExpenseDocument, key: string) => string;
}): ExpenseBudgetBreakdownRow[] => {
  const grouped = new Map<string, ExpenseBudgetBreakdownRow>();

  for (const expense of expenses) {
    const key = getKey(expense) || "UNASSIGNED";
    const row = grouped.get(key) ?? {
      id: key,
      label: getLabel(expense, key) || "Unassigned",
      approvedAmount: 0,
      pendingAmount: 0,
      rejectedAmount: 0,
      expenseCount: 0,
    };
    const status = expenseStatus(expense);
    if (status === "APPROVED") row.approvedAmount += expense.amount;
    if (status === "PENDING" || status === "REVIEWED") {
      row.pendingAmount += expense.amount;
    }
    if (status === "REJECTED") row.rejectedAmount += expense.amount;
    row.expenseCount += 1;
    grouped.set(key, row);
  }

  return [...grouped.values()]
    .map((row) => ({
      ...row,
      approvedAmount: normalizeMoney(row.approvedAmount),
      pendingAmount: normalizeMoney(row.pendingAmount),
      rejectedAmount: normalizeMoney(row.rejectedAmount),
    }))
    .sort(
      (first, second) =>
        second.approvedAmount - first.approvedAmount ||
        first.label.localeCompare(second.label),
    );
};

const resolveCurrentAllocation = ({
  actorId,
  allocations,
  actorMember,
}: {
  actorId: string;
  allocations: ExpenseBudgetAllocation[];
  actorMember?: ExpenseBudgetTeamMember | undefined;
}) => {
  const managerTeam = allocations.find(
    (allocation) =>
      allocation.targetType === "MANAGER_TEAM" &&
      allocation.targetId === actorId,
  );
  if (managerTeam) return managerTeam;

  const user = allocations.find(
    (allocation) =>
      allocation.targetType === "USER" && allocation.targetId === actorId,
  );
  if (user) return user;

  const department = normalizeDepartment(actorMember?.department);
  return (
    allocations.find(
      (allocation) =>
        allocation.targetType === "DEPARTMENT" &&
        normalizeDepartment(allocation.targetId) === department,
    ) ?? null
  );
};

export const buildExpenseBudgetSummary = ({
  month,
  allocations,
  expenses,
  team,
  categories,
  actorId,
}: {
  month: string;
  allocations: ExpenseBudgetAllocation[];
  expenses: ExpenseDocument[];
  team: ExpenseBudgetTeamMember[];
  categories: Map<string, string>;
  actorId: string;
}): ExpenseBudgetSummary => {
  const teamByUser = new Map(team.map((member) => [member.userProfileId, member]));
  const actorMember = teamByUser.get(actorId);
  const currentAllocation = resolveCurrentAllocation({
    actorId,
    allocations,
    actorMember,
  });
  const allocationTotal = (field: keyof Pick<
    ExpenseBudgetAllocation,
    "allocatedAmount" | "usedAmount" | "remainingAmount"
  >) => normalizeMoney(allocations.reduce((sum, item) => sum + item[field], 0));

  return {
    month,
    allocations: allocations.sort((first, second) =>
      first.targetLabel.localeCompare(second.targetLabel),
    ),
    currentAllocation,
    totals: {
      allocatedAmount: allocationTotal("allocatedAmount"),
      usedAmount: allocationTotal("usedAmount"),
      remainingAmount: allocationTotal("remainingAmount"),
      pendingAmount: totalForStatuses(expenses, ["PENDING", "REVIEWED"]),
      reviewedAmount: totalForStatuses(expenses, ["REVIEWED"]),
      approvedAmount: totalForStatuses(expenses, ["APPROVED"]),
      rejectedAmount: totalForStatuses(expenses, ["REJECTED"]),
      approvedExpenseCount: expenses.filter(
        (expense) => expenseStatus(expense) === "APPROVED",
      ).length,
      pendingExpenseCount: expenses.filter((expense) =>
        ["PENDING", "REVIEWED"].includes(expenseStatus(expense)),
      ).length,
      rejectedExpenseCount: expenses.filter(
        (expense) => expenseStatus(expense) === "REJECTED",
      ).length,
    },
    breakdowns: {
      employees: buildBreakdown({
        expenses,
        getKey: (expense) => expense.userId,
        getLabel: (_expense, key) => teamByUser.get(key)?.userName || key,
      }),
      categories: buildBreakdown({
        expenses,
        getKey: (expense) => String(expense.expCatRefId ?? ""),
        getLabel: (_expense, key) => categories.get(key) || "Uncategorized",
      }),
      approvers: buildBreakdown({
        expenses: expenses.filter((expense) => expenseStatus(expense) === "APPROVED"),
        getKey: (expense) => String(expense.approvedBy ?? ""),
        getLabel: (_expense, key) => teamByUser.get(key)?.userName || key,
      }),
      departments: buildBreakdown({
        expenses,
        getKey: (expense) =>
          normalizeDepartment(teamByUser.get(expense.userId)?.department),
        getLabel: (_expense, key) => key,
      }),
      teams: buildBreakdown({
        expenses,
        getKey: (expense) =>
          teamByUser.get(expense.userId)?.teamHeadProfileId ?? "",
        getLabel: (_expense, key) =>
          key === "UNASSIGNED"
            ? "Unassigned"
            : `${teamByUser.get(key)?.userName || key} Team`,
      }),
    },
  };
};
