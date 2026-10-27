import type {
  PayrollAuditRecord,
  PayrollCalculationResult,
  PayrollRunDocument,
  PayrollRunStatus,
} from "./types";

export const ACTIVE_PAYROLL_STATUSES: PayrollRunStatus[] = [
  "DRAFT",
  "GENERATED",
  "CALCULATED",
  "VALIDATED",
  "APPROVED",
  "LOCKED",
  "BANK_FILE_GENERATED",
  "PAID",
];

export const LOCKED_PAYROLL_STATUSES: PayrollRunStatus[] = [
  "APPROVED",
  "LOCKED",
  "BANK_FILE_GENERATED",
  "PAID",
];

export const PAYROLL_STATUS_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  DRAFT: ["GENERATED", "CALCULATED", "CANCELLED"],
  GENERATED: ["CALCULATED", "VALIDATED", "CANCELLED"],
  CALCULATED: ["VALIDATED", "CANCELLED"],
  VALIDATED: ["APPROVED", "CANCELLED"],
  APPROVED: ["LOCKED", "REVERSED"],
  LOCKED: ["BANK_FILE_GENERATED", "REVERSED"],
  BANK_FILE_GENERATED: ["PAID", "REVERSED"],
  PAID: ["REVERSED"],
  REVERSED: ["CORRECTION_RUN"],
  CORRECTION_RUN: ["CALCULATED", "CANCELLED"],
  CANCELLED: [],
};

const safeKeyPart = (value: string | number) =>
  String(value).trim().replace(/[/\s]+/g, "-");

export const buildPayrollKey = ({
  outletId,
  employeeId,
  payrollYear,
  payrollMonth,
}: {
  outletId: string;
  employeeId: string;
  payrollYear: number;
  payrollMonth: number;
}) =>
  `${safeKeyPart(outletId)}_${safeKeyPart(employeeId)}_${payrollYear}_${payrollMonth}`;

export const assertPayrollCanTransition = ({
  currentStatus,
  nextStatus,
  makerUserId,
  checkerUserId,
}: {
  currentStatus: PayrollRunStatus;
  nextStatus: PayrollRunStatus;
  makerUserId?: string;
  checkerUserId?: string;
}) => {
  const allowed = PAYROLL_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(nextStatus)) {
    throw new Error(`Payroll cannot move from ${currentStatus} to ${nextStatus}.`);
  }

  if (
    nextStatus === "APPROVED" &&
    makerUserId &&
    checkerUserId &&
    makerUserId === checkerUserId
  ) {
    throw new Error("Maker and checker must be different users for approval.");
  }
};

export const assertPayrollEditable = (status: PayrollRunStatus) => {
  if (LOCKED_PAYROLL_STATUSES.includes(status)) {
    throw new Error(`Payroll in ${status} status cannot be modified directly.`);
  }
};

export const createPayrollAuditRecord = ({
  action,
  payrollRunId,
  employeeId,
  performedBy,
  previousStatus,
  newStatus,
  reason,
  calculationHash,
  now = Date.now(),
}: Omit<PayrollAuditRecord, "auditId" | "performedAt"> & {
  now?: number;
}): PayrollAuditRecord => ({
  auditId: `${payrollRunId}_${action}_${now}`,
  action,
  payrollRunId,
  employeeId,
  performedBy,
  performedAt: now,
  previousStatus,
  newStatus,
  reason,
  calculationHash,
});

export const createCalculationHash = (
  result: Pick<
    PayrollCalculationResult,
    "employee" | "month" | "year" | "earnings" | "deductions" | "employerContributions" | "statutoryRuleVersions"
  >
) => {
  const stablePayload = JSON.stringify({
    employeeId: result.employee.id,
    month: result.month,
    year: result.year,
    earnings: result.earnings,
    deductions: result.deductions,
    employerContributions: result.employerContributions,
    statutoryRuleVersions: result.statutoryRuleVersions,
  });

  let hash = 0;
  for (let index = 0; index < stablePayload.length; index += 1) {
    hash = (hash * 31 + stablePayload.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
};

export const isDuplicateActivePayroll = ({
  existingPayrolls,
  payrollKey,
}: {
  existingPayrolls: Pick<PayrollRunDocument, "payrollKey" | "status" | "idempotencyKey">[];
  payrollKey: string;
  idempotencyKey?: string;
}) =>
  existingPayrolls.some(
    (payroll) =>
      payroll.payrollKey === payrollKey &&
      ACTIVE_PAYROLL_STATUSES.includes(payroll.status)
  );
