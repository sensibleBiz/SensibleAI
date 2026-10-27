import type {
  AttendancePayrollInput,
  EmployeeSalaryStructureDocument,
  PayrollCalculationResult,
  PayrollEmployee,
  PayrollRunDocument,
  PayrollRunStatus,
  SalaryStructure,
} from "./types.js";
import {
  buildPayrollKey,
  createCalculationHash,
} from "./payrollWorkflow.js";
import {
  mergeAttendanceSettings,
  mergePayrollOptions,
  resolveSalaryEarningsFromStructure,
  roundMoney,
  sumValues,
} from "./utils.js";

export const PAYROLL_FIRESTORE_COLLECTIONS = {
  EMPLOYEE_STATUTORY_PROFILE: "EMPLOYEE_STATUTORY_PROFILES",
  EMPLOYEE_SALARY_STRUCTURE: "SALARY_MASTER",
  SALARY_STRUCTURE_REVISION: "SALARY_STRUCTURES/{employeeId}/REVISIONS",
  PAYROLL_RUN: "PAYROLL",
  EMPLOYEE_PAYROLL: "PAYROLL_RUNS/{runId}/EMPLOYEE_PAYROLLS",
  PAYROLL_AUDIT_LOG: "PAYROLL_RUNS/{runId}/AUDIT_LOGS",
  ATTENDANCE_PERIOD: "ATTENDANCE_PERIODS",
  LEAVE_BALANCE: "LEAVE_BALANCES",
  OVERTIME_REQUEST: "OVERTIME_REQUESTS",
  REIMBURSEMENT: "REIMBURSEMENTS",
  LOAN: "LOANS",
  LOAN_REPAYMENT: "LOANS/{loanId}/REPAYMENTS",
  FULL_AND_FINAL_SETTLEMENT: "FULL_AND_FINAL_SETTLEMENTS",
  STATUTORY_RULE: "STATUTORY_RULES",
  TAX_DECLARATION: "TAX_DECLARATIONS",
  PAYSLIP: "PAYSLIPS",
} as const;

export const EMPLOYEE_SALARY_STRUCTURE_FIELDS = [
  "userId",
  "userName",
  "employeeId",
  "userProfileId",
  "employeeRef",
  "employeeName",
  "empCode",
  "department",
  "designation",
  "workLocationState",
  "gender",
  "joiningDate",
  "salaryType",
  "grossSalary",
  "monthlySalary",
  "isMetroCity",
  "ctc",
  "basic",
  "hra",
  "da",
  "conveyance",
  "medical",
  "specialAllowance",
  "otherAllowance",
  "incentive",
  "pfApplicable",
  "pfCeilingApplicable",
  "esiApplicable",
  "ptApplicable",
  "lwfApplicable",
  "bonusApplicable",
  "gratuityApplicable",
  "tdsApplicable",
  "otApplicable",
  "monthDayRule",
  "weeklyOffPaid",
  "paidHolidayIncluded",
  "createdAt",
  "updatedAt",
  "createdBy",
  "status",
  "isActive",
];

export const PAYROLL_RUN_FIRESTORE_FIELDS = [
  "month",
  "year",
  "employeeId",
  "userProfileId",
  "employeeRef",
  "employeeName",
  "employeeGender",
  "salaryType",
  "state",
  "attendanceSummary",
  "earnings",
  "deductions",
  "employerContributions",
  "payrollKey",
  "runId",
  "financialYear",
  "grossSalary",
  "netSalary",
  "ctc",
  "standardMonthlyCTC",
  "actualPayrollCost",
  "payableDays",
  "lopDays",
  "perDaySalary",
  "ruleBreakup",
  "statutoryRuleVersions",
  "idempotencyKey",
  "sourcePayrollRunId",
  "calculationHash",
  "status",
  "approvedBy",
  "approvedAt",
  "lockedBy",
  "lockedAt",
  "paidBy",
  "paidAt",
  "createdAt",
  "createdBy",
];

export const PAYROLL_SCHEMA_NOTE =
  "Payroll must be calculated and written by trusted backend code for production. The UI helpers keep compatibility with OUTLET/{outletId}/SALARY_MASTER and OUTLET/{outletId}/PAYROLL, while the professional target schema is OUTLETS/{outletId}/PAYROLL_RUNS/{runId}/EMPLOYEE_PAYROLLS/{employeeId} with audit logs and immutable rule versions.";

export const createEmployeeSalaryStructureDocument = ({
  employee,
  salaryStructure,
  preview,
  createdBy,
  now = Date.now(),
}: {
  employee: PayrollEmployee;
  salaryStructure: SalaryStructure;
  preview?: PayrollCalculationResult | undefined;
  createdBy: string;
  now?: number | undefined;
}): EmployeeSalaryStructureDocument => {
  const options = mergePayrollOptions(salaryStructure.payrollOptions);
  const attendanceSettings = mergeAttendanceSettings(
    salaryStructure.attendanceSettings
  );
  const resolvedEarnings = resolveSalaryEarningsFromStructure(salaryStructure);
  const grossSalary =
    salaryStructure.grossSalary ||
    roundMoney(sumValues(resolvedEarnings));
  const userProfileId =
    employee.userProfileId || employee.employeeRef || employee.id;

  return {
    userId: userProfileId,
    userName: employee.name,
    employeeId: employee.id,
    userProfileId,
    employeeRef: employee.employeeRef || userProfileId,
    employeeName: employee.name,
    empCode: employee.empCode,
    department: employee.department,
    designation: employee.designation,
    workLocationState: employee.workLocationState,
    gender: employee.gender,
    joiningDate: employee.dateOfJoining,
    salaryType: salaryStructure.salaryType || "MONTHLY",
    grossSalary,
    monthlySalary: grossSalary,
    isMetroCity: salaryStructure.isMetroCity ?? false,
    ctc: preview?.ctc ?? salaryStructure.ctc ?? grossSalary,
    basic: resolvedEarnings.basic,
    hra: resolvedEarnings.hra,
    da: resolvedEarnings.da,
    conveyance: resolvedEarnings.conveyance,
    medical: resolvedEarnings.medical,
    specialAllowance: resolvedEarnings.specialAllowance,
    otherAllowance: resolvedEarnings.otherEarnings,
    incentive: resolvedEarnings.incentive,
    pfApplicable: options.pfApplicable,
    pfCeilingApplicable: options.pfCeilingApplicable,
    esiApplicable: options.esiApplicable,
    ptApplicable: options.ptApplicable,
    lwfApplicable: options.lwfApplicable,
    bonusApplicable: options.bonusApplicable,
    gratuityApplicable: options.gratuityApplicable,
    tdsApplicable: options.tdsApplicable,
    otApplicable: options.otApplicable,
    monthDayRule: attendanceSettings.monthDayRule,
    weeklyOffPaid: attendanceSettings.weeklyOffPaid,
    paidHolidayIncluded: attendanceSettings.paidHolidayIncluded,
    leavePolicyId: attendanceSettings.leavePolicyId,
    preview,
    createdAt: now,
    updatedAt: now,
    createdBy,
    status: "ACTIVE",
    isActive: true,
  };
};

export const createPayrollRunDocument = ({
  result,
  attendance,
  createdBy,
  status = "GENERATED",
  outletId = "default",
  idempotencyKey,
  sourcePayrollRunId,
  now = Date.now(),
}: {
  result: PayrollCalculationResult;
  attendance: AttendancePayrollInput;
  createdBy: string;
  status?: PayrollRunStatus | undefined;
  outletId?: string | undefined;
  idempotencyKey?: string | undefined;
  sourcePayrollRunId?: string | undefined;
  now?: number | undefined;
}): PayrollRunDocument => {
  const payrollKey = buildPayrollKey({
    outletId,
    employeeId: result.employee.id,
    payrollYear: result.year,
    payrollMonth: result.month,
  });
  const calculationHash = createCalculationHash(result);

  return {
  runId: payrollKey,
  payrollKey,
  month: result.month,
  year: result.year,
  financialYear:
    result.month >= 4
      ? `${result.year}-${String(result.year + 1).slice(-2)}`
      : `${result.year - 1}-${String(result.year).slice(-2)}`,
  employeeId: result.employee.id,
  userProfileId:
    result.employee.userProfileId ||
    result.employee.employeeRef ||
    result.employee.id,
  employeeRef:
    result.employee.employeeRef ||
    result.employee.userProfileId ||
    result.employee.id,
  employeeName: result.employee.name,
  employeeGender: result.employee.gender,
  salaryType: result.salaryType,
  state: result.state,
  attendanceSummary: attendance,
  earnings: result.earnings,
  deductions: result.deductions,
  employerContributions: result.employerContributions,
  grossSalary: result.earnings.grossEarnings,
  netSalary: result.netSalary,
  ctc: result.ctc,
  standardMonthlyCTC: result.standardMonthlyCTC,
  actualPayrollCost: result.actualPayrollCost,
  payableDays: result.payableDays,
  lopDays: result.lopDays,
  perDaySalary: result.perDaySalary,
  ruleBreakup: result.ruleBreakup,
  statutoryRuleVersions: result.statutoryRuleVersions,
  status,
  idempotencyKey,
  sourcePayrollRunId,
  calculationHash,
  createdAt: now,
  createdBy,
  };
};

export const createPayrollRunSummary = ({
  runId,
  outletId,
  payrollMonth,
  payrollYear,
  results,
  generatedBy,
  now = Date.now(),
}: {
  runId: string;
  outletId: string;
  payrollMonth: number;
  payrollYear: number;
  results: PayrollCalculationResult[];
  generatedBy: string;
  now?: number | undefined;
}) => {
  const totals = results.reduce(
    (summary, result) => ({
      totalScheduledGross:
        summary.totalScheduledGross + result.earnings.scheduledGross,
      totalEarnedGross: summary.totalEarnedGross + result.earnings.earnedGross,
      totalEmployeeDeductions:
        summary.totalEmployeeDeductions +
        result.deductions.totalEmployeeDeductions,
      totalNetPay: summary.totalNetPay + result.netSalary,
      totalEmployeePF: summary.totalEmployeePF + result.deductions.employeePF,
      totalEmployerEPF:
        summary.totalEmployerEPF + result.employerContributions.employerEPF,
      totalEmployerEPS:
        summary.totalEmployerEPS + result.employerContributions.employerEPS,
      totalEmployerEDLI:
        summary.totalEmployerEDLI + result.employerContributions.employerEDLI,
      totalEmployeeESI:
        summary.totalEmployeeESI + result.deductions.employeeESI,
      totalEmployerESI:
        summary.totalEmployerESI + result.employerContributions.employerESI,
      totalPT: summary.totalPT + result.deductions.professionalTax,
      totalLWF: summary.totalLWF + result.deductions.employeeLWF,
      totalTDS: summary.totalTDS + (result.deductions.tds ?? 0),
      totalEmployerCost:
        summary.totalEmployerCost + result.actualPayrollCost,
    }),
    {
      totalScheduledGross: 0,
      totalEarnedGross: 0,
      totalEmployeeDeductions: 0,
      totalNetPay: 0,
      totalEmployeePF: 0,
      totalEmployerEPF: 0,
      totalEmployerEPS: 0,
      totalEmployerEDLI: 0,
      totalEmployeeESI: 0,
      totalEmployerESI: 0,
      totalPT: 0,
      totalLWF: 0,
      totalTDS: 0,
      totalEmployerCost: 0,
    }
  );

  return {
    runId,
    outletId,
    payrollMonth,
    payrollYear,
    financialYear:
      payrollMonth >= 4
        ? `${payrollYear}-${String(payrollYear + 1).slice(-2)}`
        : `${payrollYear - 1}-${String(payrollYear).slice(-2)}`,
    status: "CALCULATED" as PayrollRunStatus,
    employeeCount: results.length,
    ...Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, roundMoney(value)])
    ),
    calculationVersion: "payroll-engine-2026.1",
    statutoryRuleVersions: results[0]?.statutoryRuleVersions || {},
    generatedBy,
    generatedAt: now,
  };
};
