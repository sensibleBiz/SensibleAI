import type {
  AttendancePayrollInput,
  LeaveLOPRule,
  PayrollApplicabilityOptions,
  PayrollCalculationInput,
  PayrollMonth,
  PayrollSettings,
  SalaryComponentKey,
  SalaryEarnings,
  SalaryAttendanceSettings,
  PTRule,
  PTSlab,
} from "./types";
import {
  LWF_STATE_RULE_MASTER,
  PAYROLL_RULE_MASTER,
  PT_STATE_SLAB_MASTER,
} from "./rules";
import { addMoney, roundPayrollAmount } from "./rounding";

export const PAYROLL_DAY_TOLERANCE = 0.01;
export const PAYROLL_AMOUNT_TOLERANCE = 1;

export class PayrollValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join("\n"));
    this.name = "PayrollValidationError";
  }
}

export const roundMoney = (value: number): number =>
  roundPayrollAmount(value, "default");

export const roundRupee = (value: number): number =>
  roundPayrollAmount(value, "employeePF");

export const percent = (rate: number): number => rate / 100;

export const toAmount = (value?: number | null): number =>
  Number.isFinite(Number(value)) ? Number(value) : 0;

export const DEFAULT_PAYROLL_OPTIONS: PayrollApplicabilityOptions = {
  pfApplicable: true,
  pfCeilingApplicable: true,
  esiApplicable: true,
  ptApplicable: true,
  lwfApplicable: true,
  bonusApplicable: true,
  gratuityApplicable: true,
  tdsApplicable: true,
  otApplicable: true,
};

export const DEFAULT_ATTENDANCE_SETTINGS: SalaryAttendanceSettings = {
  monthDayRule: "ACTUAL_DAYS",
  weeklyOffPaid: true,
  paidHolidayIncluded: true,
};

export const mergePayrollOptions = (
  options?: Partial<PayrollApplicabilityOptions>
): PayrollApplicabilityOptions => ({
  ...DEFAULT_PAYROLL_OPTIONS,
  ...options,
});

export const mergeAttendanceSettings = (
  settings?: Partial<SalaryAttendanceSettings>
): SalaryAttendanceSettings => ({
  ...DEFAULT_ATTENDANCE_SETTINGS,
  ...settings,
});

export const normalizeState = (state?: string): string =>
  (state || "").trim().toLowerCase().replace(/\s+/g, " ");

const rawStateLookupKey = (state?: string): string =>
  normalizeState(state).replace(/[^a-z0-9]/g, "");

const PAYROLL_STATE_ALIASES: Record<string, string> = {
  an: "Andaman and Nicobar Islands",
  ap: "Andhra Pradesh",
  ar: "Arunachal Pradesh",
  as: "Assam",
  br: "Bihar",
  cg: "Chhattisgarh",
  ch: "Chandigarh",
  dd: "Daman and Diu",
  dl: "Delhi",
  dn: "Dadra and Nagar Haveli",
  ga: "Goa",
  gj: "Gujarat",
  hp: "Himachal Pradesh",
  hr: "Haryana",
  jh: "Jharkhand",
  jk: "Jammu and Kashmir",
  ka: "Karnataka",
  kl: "Kerala",
  la: "Ladakh",
  ld: "Lakshadweep",
  mh: "Maharashtra",
  maharastra: "Maharashtra",
  ml: "Meghalaya",
  mn: "Manipur",
  mp: "Madhya Pradesh",
  mz: "Mizoram",
  nl: "Nagaland",
  od: "Odisha",
  or: "Odisha",
  pb: "Punjab",
  py: "Puducherry",
  rj: "Rajasthan",
  sk: "Sikkim",
  tg: "Telangana",
  tn: "Tamil Nadu",
  tr: "Tripura",
  ts: "Telangana",
  ua: "Uttarakhand",
  uk: "Uttarakhand",
  up: "Uttar Pradesh",
  wb: "West Bengal",
};

const stateLookupKey = (state?: string): string => {
  const lookupKey = rawStateLookupKey(state);
  const canonicalState = PAYROLL_STATE_ALIASES[lookupKey];

  return canonicalState ? rawStateLookupKey(canonicalState) : lookupKey;
};

export const findRuleByState = <T extends { state: string; stateCode?: string }>(
  rules: T[],
  state: string
): T | undefined => {
  const lookupKey = stateLookupKey(state);

  if (!lookupKey) return undefined;

  return rules.find(
    (rule) =>
      stateLookupKey(rule.state) === lookupKey ||
      stateLookupKey(rule.stateCode) === lookupKey
  );
};

/** Resolves saved state codes and formatting variants to a payroll state name. */
export const resolvePayrollState = (state?: string): string => {
  const savedState = (state || "").trim();
  if (!savedState) return "";

  const aliasedState = PAYROLL_STATE_ALIASES[rawStateLookupKey(savedState)];
  if (aliasedState) return aliasedState;

  const rule = findRuleByState(
    [...PT_STATE_SLAB_MASTER, ...LWF_STATE_RULE_MASTER],
    savedState
  );

  return rule?.state || savedState;
};

export const findSalarySlab = (slabs: PTSlab[], salary: number): PTSlab =>
  slabs.find(
    (slab) => salary >= slab.min && (slab.max === null || salary <= slab.max)
  ) || slabs[0];

export const shouldApplyInMonth = (
  payableMonths: number[] | undefined,
  month: number
): boolean => !payableMonths?.length || payableMonths.includes(month);

export interface ESIContributionPeriod {
  key: string;
  startYear: number;
  startMonth: PayrollMonth;
  endYear: number;
  endMonth: PayrollMonth;
}

export const getESIContributionPeriod = (
  payrollYear: number,
  payrollMonth: PayrollMonth
): ESIContributionPeriod => {
  if (payrollMonth >= 4 && payrollMonth <= 9) {
    return {
      key: `${payrollYear}-04-${payrollYear}-09`,
      startYear: payrollYear,
      startMonth: 4,
      endYear: payrollYear,
      endMonth: 9,
    };
  }

  if (payrollMonth >= 10) {
    return {
      key: `${payrollYear}-10-${payrollYear + 1}-03`,
      startYear: payrollYear,
      startMonth: 10,
      endYear: payrollYear + 1,
      endMonth: 3,
    };
  }

  return {
    key: `${payrollYear - 1}-10-${payrollYear}-03`,
    startYear: payrollYear - 1,
    startMonth: 10,
    endYear: payrollYear,
    endMonth: 3,
  };
};

export const getMonthDaysForRule = ({
  payrollYear,
  payrollMonth,
  actualMonthDays,
  attendanceSettings,
}: {
  payrollYear: number;
  payrollMonth: PayrollMonth;
  actualMonthDays: number;
  attendanceSettings?: Partial<SalaryAttendanceSettings>;
}): number => {
  const settings = mergeAttendanceSettings(attendanceSettings);

  if (settings.monthDayRule === "DAYS_26") {
    return 26;
  }

  if (settings.monthDayRule === "DAYS_30") {
    return 30;
  }

  return (
    toAmount(actualMonthDays) ||
    new Date(payrollYear, payrollMonth, 0).getDate()
  );
};

export const getAttendanceMonthDays = ({
  payrollYear,
  payrollMonth,
  actualMonthDays,
}: {
  payrollYear: number;
  payrollMonth: PayrollMonth;
  actualMonthDays: number;
}): number =>
  toAmount(actualMonthDays) || new Date(payrollYear, payrollMonth, 0).getDate();

export const getSalaryDivisor = ({
  payrollYear,
  payrollMonth,
  attendance,
  attendanceSettings,
}: {
  payrollYear: number;
  payrollMonth: PayrollMonth;
  attendance: AttendancePayrollInput;
  attendanceSettings?: Partial<SalaryAttendanceSettings>;
}): number => {
  const settings = mergeAttendanceSettings(attendanceSettings);
  const monthDays = getAttendanceMonthDays({
    payrollYear,
    payrollMonth,
    actualMonthDays: attendance.monthDays,
  });

  if (settings.monthDayRule === "DAYS_26") {
    return 26;
  }

  if (settings.monthDayRule === "DAYS_30") {
    return 30;
  }

  if (settings.monthDayRule === "WORKING_DAYS") {
    return Math.max(
      monthDays - toAmount(attendance.weeklyOff) - toAmount(attendance.paidHolidays),
      1
    );
  }

  return monthDays;
};

export const getProfessionalTaxSalaryBasis = (
  rule: PTRule,
  grossSalary: number,
  annualSalary?: number
): number => {
  if (rule.salaryBasis === "annual") {
    return annualSalary || grossSalary * 12;
  }

  if (rule.salaryBasis === "half-yearly") {
    return (annualSalary || grossSalary * 12) / 2;
  }

  return grossSalary;
};

export const mergePayrollSettings = (
  settings?: Partial<PayrollSettings>
): PayrollSettings => ({
  ...PAYROLL_RULE_MASTER,
  ...settings,
  pf: { ...PAYROLL_RULE_MASTER.pf, ...settings?.pf },
  esi: { ...PAYROLL_RULE_MASTER.esi, ...settings?.esi },
  bonus: { ...PAYROLL_RULE_MASTER.bonus, ...settings?.bonus },
  gratuity: { ...PAYROLL_RULE_MASTER.gratuity, ...settings?.gratuity },
  ot: { ...PAYROLL_RULE_MASTER.ot, ...settings?.ot },
  leave: { ...PAYROLL_RULE_MASTER.leave, ...settings?.leave },
  salaryComponents:
    settings?.salaryComponents || PAYROLL_RULE_MASTER.salaryComponents,
  tds: { ...PAYROLL_RULE_MASTER.tds, ...settings?.tds },
});

export const sumValues = (record: object): number =>
  addMoney(
    ...Object.values(record as Record<string, unknown>).map((value) =>
      toAmount(value as number)
    )
  );

const monthlyFixedSalaryComponentKeys: SalaryComponentKey[] = [
  "basic",
  "hra",
  "da",
  "conveyance",
  "medical",
  "specialAllowance",
];

export const SALARY_STRUCTURE_RULES = {
  BASIC_PERCENT_OF_GROSS: 0.5,
  HRA_METRO_PERCENT_OF_BASIC: 0.5,
  HRA_NON_METRO_PERCENT_OF_BASIC: 0.4,
  CONVEYANCE_ALLOWANCE: 1600,
  MEDICAL_ALLOWANCE: 1250,
} as const;

export interface DeriveSalaryComponentsOptions {
  isMetroCity?: boolean;
  da?: number;
  earnings?: Partial<SalaryEarnings>;
}

export const deriveSalaryComponentsFromGross = (
  grossSalary: number,
  options: DeriveSalaryComponentsOptions = {}
): SalaryEarnings => {
  const targetGross = roundMoney(Math.max(toAmount(grossSalary), 0));
  const isMetroCity = options.isMetroCity ?? false;
  const da = roundMoney(toAmount(options.da ?? 0));
  const preserved = options.earnings || {};

  const basic = roundMoney(
    targetGross * SALARY_STRUCTURE_RULES.BASIC_PERCENT_OF_GROSS
  );
  const hraRate = isMetroCity
    ? SALARY_STRUCTURE_RULES.HRA_METRO_PERCENT_OF_BASIC
    : SALARY_STRUCTURE_RULES.HRA_NON_METRO_PERCENT_OF_BASIC;
  const hra = roundMoney(basic * hraRate);
  const conveyance = SALARY_STRUCTURE_RULES.CONVEYANCE_ALLOWANCE;
  const medical = SALARY_STRUCTURE_RULES.MEDICAL_ALLOWANCE;
  const allocated = addMoney(basic, hra, da, conveyance, medical);
  const specialAllowance = roundMoney(Math.max(targetGross - allocated, 0));

  return {
    basic,
    hra,
    da,
    conveyance,
    medical,
    specialAllowance,
    incentive: toAmount(preserved.incentive),
    overtime: toAmount(preserved.overtime),
    bonus: toAmount(preserved.bonus),
    arrears: toAmount(preserved.arrears),
    reimbursement: toAmount(preserved.reimbursement),
    otherEarnings: toAmount(preserved.otherEarnings),
  };
};

export const resolveSalaryEarningsFromStructure = (salaryStructure: {
  grossSalary?: number;
  earnings: SalaryEarnings;
  isMetroCity?: boolean;
}): SalaryEarnings => {
  const grossTarget = roundMoney(
    toAmount(salaryStructure.grossSalary) ||
      calculateMonthlyFixedGross(salaryStructure.earnings)
  );

  return deriveSalaryComponentsFromGross(grossTarget, {
    isMetroCity: salaryStructure.isMetroCity,
    da: 0,
    earnings: salaryStructure.earnings,
  });
};

export const calculateMonthlyFixedGross = (
  earnings: SalaryEarnings
): number =>
  addMoney(
    ...monthlyFixedSalaryComponentKeys.map((key) =>
      toAmount(earnings[key])
    )
  );

export const balanceEarningsToGross = (
  earnings: SalaryEarnings,
  grossSalary: number
): SalaryEarnings => {
  const targetGross = roundMoney(Math.max(toAmount(grossSalary), 0));
  const nonSpecialComponentKeys = monthlyFixedSalaryComponentKeys.filter(
    (key) => key !== "specialAllowance"
  );
  const nonSpecialTotal = addMoney(
    ...nonSpecialComponentKeys.map((key) => toAmount(earnings[key]))
  );

  if (targetGross >= nonSpecialTotal) {
    return {
      ...earnings,
      specialAllowance: roundMoney(targetGross - nonSpecialTotal),
    };
  }

  const positiveComponentKeys = nonSpecialComponentKeys.filter(
    (key) => toAmount(earnings[key]) > 0
  );

  if (!positiveComponentKeys.length) {
    return {
      ...earnings,
      specialAllowance: targetGross,
    };
  }

  const balancedEarnings: SalaryEarnings = {
    ...earnings,
    specialAllowance: 0,
  };
  let remainingGross = targetGross;

  positiveComponentKeys.forEach((key, index) => {
    const isLastComponent = index === positiveComponentKeys.length - 1;
    const componentAmount = isLastComponent
      ? remainingGross
      : Math.min(
          roundMoney(
            (toAmount(earnings[key]) / nonSpecialTotal) * targetGross
          ),
          remainingGross
        );

    balancedEarnings[key] = componentAmount;
    remainingGross = roundMoney(remainingGross - componentAmount);
  });

  return balancedEarnings;
};

export const calculatePayableDays = (
  attendance: AttendancePayrollInput,
  attendanceSettings?: Partial<SalaryAttendanceSettings>,
  leaveSettings?: Partial<LeaveLOPRule>
): number => {
  const monthDays = getAttendanceMonthDays({
    payrollYear: attendance.year || 0,
    payrollMonth: attendance.month || 1,
    actualMonthDays: attendance.monthDays,
  });
  const lopDays = calculateLopDays(attendance, attendanceSettings, leaveSettings);

  return roundMoney(Math.max(monthDays - lopDays, 0));
};

export const calculateLopDays = (
  attendance: AttendancePayrollInput,
  attendanceSettings?: Partial<SalaryAttendanceSettings>,
  leaveSettings?: Partial<LeaveLOPRule>
): number => {
  const settings = mergeAttendanceSettings(attendanceSettings);
  const leave = {
    ...PAYROLL_RULE_MASTER.leave,
    ...leaveSettings,
  };

  if (!leave.lopApplicable) {
    return 0;
  }

  const monthDays = getAttendanceMonthDays({
    payrollYear: attendance.year || 0,
    payrollMonth: attendance.month || 1,
    actualMonthDays: attendance.monthDays,
  });
  const weeklyOffPaid =
    settings.weeklyOffPaid && leave.includeWeeklyOffInPayableDays;
  const paidHolidayIncluded =
    settings.paidHolidayIncluded && leave.includePaidHolidaysInPayableDays;
  const calculatedLopDays =
    toAmount(attendance.absentDays) +
    toAmount(attendance.unpaidLeave) +
    toAmount(attendance.preJoiningDays) +
    toAmount(attendance.postExitDays) +
    (weeklyOffPaid ? 0 : toAmount(attendance.weeklyOff)) +
    (paidHolidayIncluded ? 0 : toAmount(attendance.paidHolidays));

  return roundMoney(Math.max(0, Math.min(calculatedLopDays, monthDays)));
};

export const calculateAccountedDays = (
  attendance: AttendancePayrollInput
): number =>
  roundMoney(
    toAmount(attendance.presentDays) +
      toAmount(attendance.paidLeave) +
      toAmount(attendance.weeklyOff) +
      toAmount(attendance.paidHolidays) +
      toAmount(attendance.absentDays) +
      toAmount(attendance.unpaidLeave) +
      toAmount(attendance.preJoiningDays) +
      toAmount(attendance.postExitDays) +
      toAmount(attendance.pendingAttendanceDays)
  );

export const getCompletedServiceYears = (
  dateOfJoining?: string,
  asOfDate = new Date(),
  roundUpAfterMonths = 6
): { completedYears: number; roundedYears: number; remainingMonths: number } => {
  if (!dateOfJoining) {
    return { completedYears: 0, roundedYears: 0, remainingMonths: 0 };
  }

  const joiningDate = new Date(dateOfJoining);
  if (Number.isNaN(joiningDate.getTime()) || joiningDate > asOfDate) {
    return { completedYears: 0, roundedYears: 0, remainingMonths: 0 };
  }

  let totalMonths =
    (asOfDate.getFullYear() - joiningDate.getFullYear()) * 12 +
    (asOfDate.getMonth() - joiningDate.getMonth());

  if (asOfDate.getDate() < joiningDate.getDate()) {
    totalMonths -= 1;
  }

  const completedYears = Math.floor(totalMonths / 12);
  const remainingMonths = totalMonths % 12;
  const roundedYears =
    completedYears + (remainingMonths >= roundUpAfterMonths ? 1 : 0);

  return { completedYears, roundedYears, remainingMonths };
};

export const validatePayrollInput = (input: PayrollCalculationInput): void => {
  const errors: string[] = [];
  const earnings = input.salaryStructure.earnings;
  const deductions = input.salaryStructure.deductions || {};
  const attendance = input.attendance;
  const attendanceSettings = input.salaryStructure.attendanceSettings;
  const leaveSettings = mergePayrollSettings(input.settings).leave;
  const effectiveMonthDays = getAttendanceMonthDays({
    payrollYear: input.payrollYear,
    payrollMonth: input.payrollMonth,
    actualMonthDays: attendance.monthDays,
  });

  Object.entries({ ...earnings, ...deductions }).forEach(([key, value]) => {
    if (toAmount(value) < 0) {
      errors.push(`${key} cannot be negative.`);
    }
  });

  Object.entries({
    monthDays: attendance.monthDays,
    presentDays: attendance.presentDays,
    paidLeaveDays: attendance.paidLeave,
    weeklyOffDays: attendance.weeklyOff,
    paidHolidayDays: attendance.paidHolidays,
    absentDays: attendance.absentDays,
    unpaidLeaveDays: attendance.unpaidLeave,
    preJoiningDays: attendance.preJoiningDays,
    postExitDays: attendance.postExitDays,
    pendingAttendanceDays: attendance.pendingAttendanceDays,
    workedHours: attendance.workedHours,
    overtimeHours: attendance.overtimeHours,
    approvedOvertimeAmount: attendance.approvedOvertimeAmount,
    manualOvertimeAdjustment: attendance.manualOvertimeAdjustment,
    otHours: attendance.otHours,
    loanDeduction: attendance.loanDeduction,
    advanceDeduction: attendance.advanceDeduction,
    otherDeduction: attendance.otherDeduction,
    incentive: attendance.incentive,
    fixedIncentive: attendance.fixedIncentive,
    attendanceIncentive: attendance.attendanceIncentive,
    performanceIncentive: attendance.performanceIncentive,
    salesIncentive: attendance.salesIncentive,
    manualIncentiveAdjustment: attendance.manualIncentiveAdjustment,
    arrears: attendance.arrears,
  }).forEach(([key, value]) => {
    if (toAmount(value) < 0) {
      errors.push(`${key} cannot be negative.`);
    }
  });

  if (effectiveMonthDays <= 0) {
    errors.push("Month days must be greater than zero.");
  }

  const accountedDays = calculateAccountedDays(attendance);
  if (Math.abs(accountedDays - effectiveMonthDays) > PAYROLL_DAY_TOLERANCE) {
    errors.push(
      `Attendance mismatch: ${accountedDays} days entered for a ${effectiveMonthDays}-day payroll month.`
    );
  }

  const payableDays = calculatePayableDays(
    attendance,
    attendanceSettings,
    leaveSettings
  );
  const lopDays = calculateLopDays(attendance, attendanceSettings, leaveSettings);
  if (payableDays < 0) {
    errors.push("payableDays cannot be negative.");
  }

  if (payableDays > effectiveMonthDays) {
    errors.push("Payable days cannot exceed month days.");
  }

  if (lopDays < 0) {
    errors.push("LOP days cannot be negative.");
  }

  if (
    Math.abs(payableDays + lopDays - effectiveMonthDays) >
    PAYROLL_DAY_TOLERANCE
  ) {
    errors.push(
      `Payable days plus LOP days must equal month days. Got ${roundMoney(
        payableDays + lopDays
      )} for ${effectiveMonthDays}.`
    );
  }

  const salaryType = input.salaryStructure.salaryType || "MONTHLY";
  if (salaryType === "DAILY" && toAmount(input.salaryStructure.dailyRate) <= 0) {
    errors.push("dailyRate must be greater than zero for daily wage employees.");
  }

  if (salaryType === "HOURLY" && toAmount(input.salaryStructure.hourlyRate) <= 0) {
    errors.push("hourlyRate must be greater than zero for hourly wage employees.");
  }

  if ((input.tdsInput?.alreadyDeductedTDS || 0) < 0) {
    errors.push("Already deducted TDS cannot be negative.");
  }

  if (errors.length) {
    throw new PayrollValidationError(errors);
  }
};
