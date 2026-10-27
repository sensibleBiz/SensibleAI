export type ExpenseStatus = "PENDING" | "REVIEWED" | "APPROVED" | "REJECTED";

export type ExpenseBudgetTargetType =
  | "DEPARTMENT"
  | "USER"
  | "MANAGER_TEAM";

export type ExpenseBudgetTransactionType =
  | "ALLOCATION_CREATED"
  | "ALLOCATION_ADJUSTED"
  | "EXPENSE_APPROVED"
  | "EXPENSE_APPROVAL_REVERSED"
  | "EXPENSE_AMOUNT_ADJUSTED"
  | "APPROVED_EXPENSE_DELETED";

export interface ExpenseBudgetAllocation {
  id: string;
  month: string;
  targetType: ExpenseBudgetTargetType;
  targetId: string;
  targetLabel: string;
  originalAllocatedAmount: number;
  allocatedAmount: number;
  usedAmount: number;
  remainingAmount: number;
  approvedExpenseCount: number;
  currency: "INR";
  notes?: string | undefined;
  status: "ACTIVE";
  revision: number;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
}

export interface ExpenseBudgetTransaction {
  id: string;
  allocationId: string;
  type: ExpenseBudgetTransactionType;
  amount: number;
  balanceAfter: number;
  allocatedAmountAfter: number;
  expenseId?: string | undefined;
  employeeId?: string | undefined;
  employeeName?: string | undefined;
  categoryId?: string | undefined;
  category?: string | undefined;
  expenseStatus?: ExpenseStatus | undefined;
  reason?: string | undefined;
  createdBy: string;
  createdByName?: string | undefined;
  createdAt: number;
}

export interface ExpenseStatusHistoryRecord {
  id: string;
  fromStatus: ExpenseStatus;
  toStatus: ExpenseStatus;
  reason?: string | undefined;
  allocationId?: string | undefined;
  changedBy: string;
  changedAt: number;
}

export interface ExpenseDocument {
  id: string;
  amount: number;
  createdDate: number;
  monthId: string;
  userId: string;
  status?: ExpenseStatus;
  expCatRefId?: string | undefined;
  purpose?: string | undefined;
  reviewedBy?: string | undefined;
  reviewedAt?: number | undefined;
  approvedBy?: string | undefined;
  approvedAt?: number | undefined;
  rejectedBy?: string | undefined;
  rejectedAt?: number | undefined;
  rejectionReason?: string | undefined;
  statusChangedBy?: string | undefined;
  statusChangedAt?: number | undefined;
  statusVersion?: number | undefined;
  budgetApplied?: boolean | undefined;
  budgetAllocationId?: string | undefined;
  budgetAppliedAmount?: number | undefined;
  budgetVersion?: number | undefined;
  updateDate?: number | undefined;
  [key: string]: unknown;
}

export interface ExpenseBudgetTeamMember {
  department?: string | undefined;
  isActive?: boolean | undefined;
  roleInZone?: string | undefined;
  teamHeadProfileId?: string | undefined;
  userName?: string | undefined;
  userProfileId: string;
}

export interface CreateExpenseBudgetInput {
  outletId: string;
  month: string;
  targetType: ExpenseBudgetTargetType;
  targetId: string;
  allocatedAmount: number;
  notes?: string | undefined;
}

export interface UpdateExpenseBudgetInput {
  outletId: string;
  allocatedAmount: number;
  notes?: string | undefined;
}

export interface ExpenseBudgetSummaryQuery {
  outletId: string;
  month: string;
}

export interface ExpenseBudgetHistoryQuery {
  outletId: string;
  cursor?: string | undefined;
  limit: number;
}

export type ExpenseStatusHistoryQuery = ExpenseBudgetHistoryQuery;

export interface ExpenseBudgetIdParams {
  allocationId: string;
}

export interface ExpenseIdParams {
  expenseId: string;
}

export interface ExpenseStatusInput {
  outletId: string;
  status: Exclude<ExpenseStatus, "PENDING">;
  rejectionReason?: string | undefined;
}

export interface ExpenseDeleteQuery {
  outletId: string;
}

export interface ExpenseTransitionPermissions {
  canReview: boolean;
  canApprove: boolean;
  canOverspend: boolean;
}

export interface ExpenseBudgetBreakdownRow {
  id: string;
  label: string;
  approvedAmount: number;
  pendingAmount: number;
  rejectedAmount: number;
  expenseCount: number;
}

export interface ExpenseBudgetSummary {
  month: string;
  allocations: ExpenseBudgetAllocation[];
  currentAllocation: ExpenseBudgetAllocation | null;
  totals: {
    allocatedAmount: number;
    usedAmount: number;
    remainingAmount: number;
    pendingAmount: number;
    reviewedAmount: number;
    approvedAmount: number;
    rejectedAmount: number;
    approvedExpenseCount: number;
    pendingExpenseCount: number;
    rejectedExpenseCount: number;
  };
  breakdowns: {
    employees: ExpenseBudgetBreakdownRow[];
    categories: ExpenseBudgetBreakdownRow[];
    approvers: ExpenseBudgetBreakdownRow[];
    departments: ExpenseBudgetBreakdownRow[];
    teams: ExpenseBudgetBreakdownRow[];
  };
}
