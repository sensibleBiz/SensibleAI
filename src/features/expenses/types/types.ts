export interface UserLocation {
  currentlocation?: { latitude: number; longitude: number };
  latitude: number;
  longitude: number;
  address: string;
  name?: string;
  timestamp: {
    seconds: number;
    nanoseconds: number;
  };
}

export interface ExpenseDTO {
  id: string;
  amount: number;
  createdDate: number;
  dateTime: string;
  dayId: string;
  editFlag: boolean;
  image: string;
  invoiceDate: string;
  invoiceImage: string;
  invoiceNo: string;
  journeyFrom?: string;
  journeyTo?: string;
  monthId: string;
  paymentMode?: string;
  purpose?: string;
  totalKm?: string | number;
  travelMode?: string;
  updateDate: number;
  userId: string;
  expCatRefId?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED"| "REVIEWED";
  rejectionReason?: string;
  reviewedBy?: string; //Approved or Rejected by userId
  reviewedAt?: number;
  approvedBy?: string;
  approvedAt?: number;
  rejectedBy?: string;
  rejectedAt?: number;
  statusChangedBy?: string;
  statusChangedAt?: number;
  statusVersion?: number;
  budgetApplied?: boolean;
  budgetAllocationId?: string;
  budgetAppliedAmount?: number;
  budgetVersion?: number;
}

export type ExpenseBudgetTargetType =
  | "DEPARTMENT"
  | "USER"
  | "MANAGER_TEAM";

export interface ExpenseBudgetAllocationDTO {
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
  notes?: string;
  status: "ACTIVE";
  revision: number;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
}

export interface ExpenseBudgetBreakdownDTO {
  id: string;
  label: string;
  approvedAmount: number;
  pendingAmount: number;
  rejectedAmount: number;
  expenseCount: number;
}

export interface ExpenseBudgetSummaryDTO {
  month: string;
  allocations: ExpenseBudgetAllocationDTO[];
  currentAllocation: ExpenseBudgetAllocationDTO | null;
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
    employees: ExpenseBudgetBreakdownDTO[];
    categories: ExpenseBudgetBreakdownDTO[];
    approvers: ExpenseBudgetBreakdownDTO[];
    departments: ExpenseBudgetBreakdownDTO[];
    teams: ExpenseBudgetBreakdownDTO[];
  };
}

export interface ExpenseBudgetTransactionDTO {
  id: string;
  allocationId: string;
  type:
    | "ALLOCATION_CREATED"
    | "ALLOCATION_ADJUSTED"
    | "EXPENSE_APPROVED"
    | "EXPENSE_APPROVAL_REVERSED"
    | "EXPENSE_AMOUNT_ADJUSTED"
    | "APPROVED_EXPENSE_DELETED";
  amount: number;
  balanceAfter: number;
  allocatedAmountAfter: number;
  expenseId?: string;
  employeeId?: string;
  employeeName?: string;
  categoryId?: string;
  category?: string;
  expenseStatus?: ExpenseDTO["status"];
  reason?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: number;
}

export interface ExpenseStatusHistoryDTO {
  id: string;
  fromStatus: NonNullable<ExpenseDTO["status"]>;
  toStatus: NonNullable<ExpenseDTO["status"]>;
  reason?: string;
  allocationId?: string;
  changedBy: string;
  changedAt: number;
}
