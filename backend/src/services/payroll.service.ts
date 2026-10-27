import { AppError } from "../errors/appError.js";
import {
  calculateLWF,
  calculatePayroll,
  calculateProfessionalTax,
} from "../payroll-engine/calculators.js";
import {
  createEmployeeSalaryStructureDocument,
  createPayrollRunDocument,
} from "../payroll-engine/firestoreSchema.js";
import {
  LWF_STATE_RULE_MASTER,
  PT_STATE_SLAB_MASTER,
  SAMPLE_SALARY_EARNINGS,
} from "../payroll-engine/rules/index.js";
import type {
  AttendancePayrollInput,
  EmployeeSalaryStructureDocument,
  PayrollEmployee,
  PayrollCalculationResult,
  PayrollRunDocument,
  PayrollMonth,
  SalaryStructure,
  SalaryStructureRevision,
} from "../payroll-engine/types.js";
import {
  deriveSalaryComponentsFromGross,
  getESIContributionPeriod,
  PayrollValidationError,
  resolvePayrollState,
} from "../payroll-engine/utils.js";
import type { PayrollAttendancePort, PayrollStoragePort } from "./payrollPorts.js";
import type {
  GeneratePayrollInput,
  GeneratePayrollResponse,
  PayrollCalculationResponse,
  PayrollEmployeeDataResponse,
  PayrollOverviewRecord,
  PayrollPreviewInput,
  PayrollStatutoryRulesResponse,
  SalaryStructureResponse,
  SaveSalaryStructureInput,
} from "../types/payroll.types.js";
import { createPromiseTtlCache } from "../utils/promiseTtlCache.js";

const salaryStructureCache =
  createPromiseTtlCache<EmployeeSalaryStructureDocument | null>({
    maxEntries: 2_000,
    ttlMs: 10_000,
  });
const payrollRunsCache = createPromiseTtlCache<PayrollRunDocument[]>({
  maxEntries: 2_000,
  ttlMs: 5_000,
});
const attendanceCache = createPromiseTtlCache<AttendancePayrollInput>({
  maxEntries: 2_000,
  ttlMs: 3_000,
});
const overviewCache = createPromiseTtlCache<PayrollOverviewRecord[]>({
  maxEntries: 200,
  ttlMs: 5_000,
});
const employeeCache = createPromiseTtlCache<PayrollEmployee | null>({
  maxEntries: 2_000,
  ttlMs: 15_000,
});

const cacheKey = (...parts: (string | number | undefined)[]) =>
  parts.map((part) => String(part ?? "all")).join(":");

export function createPayrollService(deps: {
  payroll: PayrollStoragePort;
  attendance: PayrollAttendancePort;
}) {
  const payrollRepository = deps.payroll;
  const attendanceRepository = deps.attendance;

const cachedSalaryStructure = (outletId: string, employeeId: string) =>
  salaryStructureCache.get(cacheKey(outletId, employeeId), () =>
    payrollRepository.getSalaryStructure(outletId, employeeId));

const resolveAuthorizedEmployee = async (
  outletId: string,
  requested: PayrollEmployee,
) => {
  const employeeId = profileIdForEmployee(requested);
  const canonical = await employeeCache.get(cacheKey(outletId, employeeId), () =>
    payrollRepository.getActivePayrollEmployee(outletId, employeeId));
  if (!canonical) {
    throw new AppError(
      404,
      "The selected employee is not active on this outlet payroll",
      "PAYROLL_EMPLOYEE_NOT_FOUND",
    );
  }
  return {
    ...requested,
    ...canonical,
  };
};

const cachedPayrollRuns = (
  outletId: string,
  employeeId: string,
  year?: number,
) => payrollRunsCache.get(cacheKey(outletId, employeeId, year), () =>
  payrollRepository.listPayrollRuns(outletId, employeeId, year));

const invalidateEmployeeCache = (outletId: string, employeeId: string) => {
  const employeeKey = cacheKey(outletId, employeeId);
  salaryStructureCache.deleteWhere((key) => key === employeeKey);
  payrollRunsCache.deleteWhere((key) => key.startsWith(`${employeeKey}:`));
  overviewCache.deleteWhere((key) => key === outletId);
};

const defaultSalaryStructure = (): SalaryStructure => ({
  salaryType: "MONTHLY",
  grossSalary: 35_000,
  isMetroCity: false,
  earnings: deriveSalaryComponentsFromGross(35_000, {
    isMetroCity: false,
    earnings: SAMPLE_SALARY_EARNINGS,
  }),
  deductions: { loan: 0, advance: 0, otherDeductions: 0 },
  payrollOptions: {
    pfApplicable: true,
    pfCeilingApplicable: true,
    esiApplicable: true,
    ptApplicable: true,
    lwfApplicable: true,
    bonusApplicable: true,
    gratuityApplicable: true,
    tdsApplicable: true,
    otApplicable: true,
  },
  attendanceSettings: {
    monthDayRule: "ACTUAL_DAYS",
    weeklyOffPaid: true,
    paidHolidayIncluded: true,
  },
});

const finiteAmount = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeSalaryStructure = (salaryStructure?: SalaryStructure): SalaryStructure => {
  const defaults = defaultSalaryStructure();
  return {
    ...defaults,
    ...salaryStructure,
    earnings: { ...defaults.earnings, ...salaryStructure?.earnings },
    deductions: { ...defaults.deductions, ...salaryStructure?.deductions },
    payrollOptions: { ...defaults.payrollOptions, ...salaryStructure?.payrollOptions },
    attendanceSettings: {
      ...defaults.attendanceSettings,
      ...salaryStructure?.attendanceSettings,
    },
  };
};

const flattenedSalaryStructure = (
  document: EmployeeSalaryStructureDocument,
): SalaryStructure => {
  const defaults = defaultSalaryStructure();
  const grossSalary = finiteAmount(
    document.grossSalary,
    finiteAmount(document.monthlySalary, defaults.grossSalary),
  );
  return normalizeSalaryStructure({
    salaryType: document.salaryType || "MONTHLY",
    grossSalary,
    isMetroCity: document.isMetroCity ?? false,
    ctc: finiteAmount(document.ctc, grossSalary),
    earnings: deriveSalaryComponentsFromGross(grossSalary, {
      isMetroCity: document.isMetroCity ?? false,
      earnings: {
        basic: finiteAmount(document.basic),
        hra: finiteAmount(document.hra),
        da: finiteAmount(document.da),
        conveyance: finiteAmount(document.conveyance),
        medical: finiteAmount(document.medical),
        specialAllowance: finiteAmount(document.specialAllowance),
        otherEarnings: finiteAmount(document.otherAllowance),
        incentive: finiteAmount(document.incentive),
        overtime: 0,
        bonus: 0,
        arrears: 0,
      },
    }),
    deductions: { loan: 0, advance: 0, otherDeductions: 0 },
    payrollOptions: {
      pfApplicable: document.pfApplicable,
      pfCeilingApplicable: document.pfCeilingApplicable,
      esiApplicable: document.esiApplicable,
      ptApplicable: document.ptApplicable,
      lwfApplicable: document.lwfApplicable,
      bonusApplicable: document.bonusApplicable,
      gratuityApplicable: document.gratuityApplicable,
      tdsApplicable: document.tdsApplicable,
      otApplicable: document.otApplicable,
    },
    attendanceSettings: {
      monthDayRule: document.monthDayRule,
      weeklyOffPaid: document.weeklyOffPaid,
      paidHolidayIncluded: document.paidHolidayIncluded,
      ...(document.leavePolicyId ? { leavePolicyId: document.leavePolicyId } : {}),
    },
  });
};

const structureForMonth = (
  document: EmployeeSalaryStructureDocument,
  year: number,
  month: PayrollMonth,
) => {
  const target = `${year}-${String(month).padStart(2, "0")}`;
  const revision = [...(document.salaryRevisions ?? [])]
    .filter((item) => item.effectiveFrom.slice(0, 7) <= target)
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
    .at(-1);
  return normalizeSalaryStructure(revision?.salaryStructure ?? flattenedSalaryStructure(document));
};

const employeeFromSalary = (
  document: EmployeeSalaryStructureDocument,
): PayrollEmployee => ({
  id: document.employeeId,
  userProfileId: document.userProfileId || document.userId,
  employeeRef: document.employeeRef || document.userProfileId || document.userId,
  name: document.employeeName || document.userName || document.employeeId,
  ...(document.empCode ? { empCode: document.empCode } : {}),
  ...(document.department ? { department: document.department } : {}),
  ...(document.designation ? { designation: document.designation } : {}),
  ...(document.workLocationState ? { workLocationState: document.workLocationState } : {}),
  ...(document.gender ? { gender: document.gender } : {}),
  ...(document.joiningDate ? { dateOfJoining: document.joiningDate } : {}),
});

const employeeIds = (employee: PayrollEmployee) =>
  new Set(
    [employee.id, employee.userProfileId, employee.employeeRef, employee.empCode]
      .filter((value): value is string => Boolean(value)),
  );

const dateKeyForTimestamp = (timestamp: number) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(new Date(timestamp));

const timestampForDay = (date: string, end = false) =>
  Date.parse(`${date}T${end ? "23:59:59.999" : "00:00:00.000"}+05:30`);

const dateDifference = (later: string, earlier: string) =>
  Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);

const hoursBetween = (checkIn: unknown, checkOut: unknown) => {
  const normalize = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
    return value < 1e12 ? value * 1_000 : value;
  };
  const start = normalize(checkIn);
  const end = normalize(checkOut);
  return start && end > start ? (end - start) / 3_600_000 : 0;
};

const loadAttendanceUncached = async (
  outletId: string,
  employee: PayrollEmployee,
  month: PayrollMonth,
  year: number,
): Promise<AttendancePayrollInput> => {
  const monthText = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthStart = `${monthText}-01`;
  const monthEnd = `${monthText}-${String(daysInMonth).padStart(2, "0")}`;
  const ids = employeeIds(employee);
  const records = await attendanceRepository.listAttendanceForDays(
    outletId,
    Array.from({ length: daysInMonth }, (_, index) =>
      `${String(index + 1).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`,
    ),
  );
  const leaves = await attendanceRepository.listLeaveCandidatesForMonth(
    outletId,
    timestampForDay(monthStart),
    timestampForDay(monthEnd, true),
  );
  const holidays = await attendanceRepository.listActiveHolidaysForYear(outletId, String(year));

  const attendanceByDate = new Map<string, Record<string, unknown>>();
  for (const record of records) {
    const userId = typeof record.data.userId === "string" ? record.data.userId : "";
    if (!ids.has(userId)) continue;
    const rawDayId = typeof record.data.dayId === "string" ? record.data.dayId : "";
    const parts = rawDayId.split("-");
    if (parts.length !== 3) continue;
    const isoDate = parts[0]?.length === 4
      ? rawDayId
      : `${parts[2]}-${parts[1]}-${parts[0]}`;
    attendanceByDate.set(isoDate, record.data);
  }

  const employeeLeaves = leaves.filter((leave) => ids.has(leave.userProfileId));
  const holidaysByDate = new Map(
    holidays.flatMap((holiday) => {
      const rawDate = holiday.dateString ?? holiday.date;
      if (typeof rawDate === "string") return [[rawDate.slice(0, 10), holiday] as const];
      if (typeof rawDate === "number") return [[dateKeyForTimestamp(rawDate), holiday] as const];
      return [];
    }),
  );
  const today = dateKeyForTimestamp(Date.now());
  const yesterday = new Date(timestampForDay(today) - 86_400_000).toISOString().slice(0, 10);
  const employmentStart = employee.dateOfJoining && employee.dateOfJoining > monthStart
    ? employee.dateOfJoining
    : monthStart;
  const employmentEnd = employee.dateOfExit && employee.dateOfExit < monthEnd
    ? employee.dateOfExit
    : monthEnd;
  const calculationEnd = employmentEnd < yesterday ? employmentEnd : yesterday;
  const preJoiningDays = employmentStart > monthStart
    ? Math.min(dateDifference(employmentStart, monthStart), daysInMonth)
    : 0;
  const postExitDays = employmentEnd < monthEnd
    ? Math.min(dateDifference(monthEnd, employmentEnd), daysInMonth)
    : 0;
  let presentDays = 0;
  let paidLeave = 0;
  let weeklyOff = 0;
  let paidHolidays = 0;
  let absentDays = 0;
  let unpaidLeave = 0;
  let workedHours = 0;
  let otHours = 0;

  if (employmentStart <= calculationEnd) {
    for (let day = Number(employmentStart.slice(8, 10)); day <= daysInMonth; day += 1) {
      const date = `${monthText}-${String(day).padStart(2, "0")}`;
      if (date > calculationEnd) break;
      const attendance = attendanceByDate.get(date);
      const holiday = holidaysByDate.get(date);
      const dayStart = timestampForDay(date);
      const dayEnd = timestampForDay(date, true);
      const leave = employeeLeaves.find((item) => item.fromDate <= dayEnd && item.toDate >= dayStart);
      const present = attendance
        ? attendance.isPresent === undefined
          ? Boolean(attendance.checkInTime)
          : attendance.isPresent === true
        : false;

      if (holiday) {
        if (holiday.isPaid !== false) paidHolidays += 1;
        else absentDays += 1;
        continue;
      }
      if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0) {
        weeklyOff += 1;
        continue;
      }
      if (leave) {
        const leaveDays = leave.duration?.toLowerCase().includes("half") ? 0.5 : 1;
        const leaveType = leave.leaveType.toLowerCase();
        const unpaid = ["lwp", "lop"].includes(leaveType) ||
          leaveType.includes("without pay") || leaveType.includes("unpaid");
        if (unpaid) unpaidLeave += leaveDays;
        else paidLeave += leaveDays;
        if (present && leaveDays < 1) presentDays += 1 - leaveDays;
        else if (leaveDays < 1) absentDays += 1 - leaveDays;
      } else if (present) presentDays += 1;
      else absentDays += 1;

      if (present && attendance) {
        const hours = hoursBetween(attendance.checkInTime, attendance.checkOutTime);
        workedHours += hours;
        otHours += Math.max(hours - 8, 0);
      }
    }
  }

  const accounted = presentDays + paidLeave + weeklyOff + paidHolidays +
    absentDays + unpaidLeave + preJoiningDays + postExitDays;
  return {
    employeeId: employee.id,
    month,
    year,
    presentDays,
    paidLeave,
    weeklyOff,
    paidHolidays,
    absentDays,
    unpaidLeave,
    preJoiningDays,
    postExitDays,
    attendanceRecordCount: attendanceByDate.size,
    pendingAttendanceDays: Math.max(daysInMonth - accounted, 0),
    monthDays: daysInMonth,
    otHours: Number(otHours.toFixed(2)),
    workedHours: Number(workedHours.toFixed(2)),
    overtimeHours: Number(otHours.toFixed(2)),
    loanDeduction: 0,
    advanceDeduction: 0,
    otherDeduction: 0,
    incentive: 0,
    arrears: 0,
  };
};

const loadAttendance = (
  outletId: string,
  employee: PayrollEmployee,
  month: PayrollMonth,
  year: number,
) => attendanceCache.get(
  cacheKey(
    outletId,
    profileIdForEmployee(employee),
    year,
    month,
    employee.dateOfJoining,
    employee.dateOfExit,
  ),
  () => loadAttendanceUncached(outletId, employee, month, year),
);

const applyAdjustments = (
  attendance: AttendancePayrollInput,
  adjustments: PayrollPreviewInput["adjustments"],
): AttendancePayrollInput => ({ ...attendance, ...adjustments });

const profileIdForEmployee = (employee: PayrollEmployee) =>
  employee.userProfileId || employee.employeeRef || employee.id;

const hasEsiCoverage = async (
  outletId: string,
  employeeId: string,
  month: PayrollMonth,
  year: number,
  fresh = false,
) => {
  const years = month <= 3 ? [year - 1, year] : [year];
  const histories = await Promise.all(
    years.map((historyYear) => fresh
      ? payrollRepository.listPayrollRuns(outletId, employeeId, historyYear)
      : cachedPayrollRuns(outletId, employeeId, historyYear)),
  );
  const targetPeriod = getESIContributionPeriod(year, month).key;
  const targetIndex = year * 12 + month;
  return histories.flat().some((payroll) =>
    getESIContributionPeriod(payroll.year, payroll.month).key === targetPeriod &&
    payroll.year * 12 + payroll.month <= targetIndex &&
    payroll.ruleBreakup?.esi?.applicable === true,
  );
};

const calculate = async (
  input: PayrollPreviewInput,
  employee: PayrollEmployee,
  salaryStructure: SalaryStructure,
  fresh = false,
): Promise<PayrollCalculationResponse> => {
  const attendance = applyAdjustments(
    await (fresh
      ? loadAttendanceUncached(input.outletId, employee, input.month, input.year)
      : loadAttendance(input.outletId, employee, input.month, input.year)),
    input.adjustments,
  );
  const profileId = profileIdForEmployee(employee);
  const esiContributionPeriodCovered = salaryStructure.payrollOptions?.esiApplicable === false
    ? false
    : await hasEsiCoverage(
        input.outletId,
        profileId,
        input.month,
        input.year,
        fresh,
      );
  let result: PayrollCalculationResult;
  try {
    result = calculatePayroll({
      employee,
      salaryStructure,
      attendance,
      payrollMonth: input.month,
      payrollYear: input.year,
      state: resolvePayrollState(employee.workLocationState),
      esiContributionPeriodCovered,
      tdsInput: { remainingMonths: Math.max(12 - input.month + 1, 1) },
    });
  } catch (error) {
    if (error instanceof PayrollValidationError) {
      throw new AppError(400, error.errors.join(" "), "PAYROLL_VALIDATION_ERROR");
    }
    throw error;
  }
  return { attendance, result };
};

const savedSalaryOrThrow = async (outletId: string, employeeId: string) => {
  const document = await cachedSalaryStructure(outletId, employeeId);
  if (!document) {
    throw new AppError(404, "Save the employee salary structure first", "SALARY_STRUCTURE_NOT_FOUND");
  }
  return document;
};

const service = {
  async getEmployeeData(
    outletId: string,
    employeeId: string,
    year?: number,
  ): Promise<PayrollEmployeeDataResponse> {
    const salaryStructure = await cachedSalaryStructure(outletId, employeeId);
    const payrollRuns = await cachedPayrollRuns(outletId, employeeId, year);
    return { salaryStructure, payrollRuns };
  },

  async getOverview(outletId: string): Promise<PayrollOverviewRecord[]> {
    return overviewCache.get(outletId, async () => {
      const salaryStructures = await payrollRepository.listSalaryStructures(outletId);
      const summaries = await payrollRepository.listLatestPayrollSummaries(outletId);
      const summariesByEmployee = new Map(
        summaries.map((payroll) => [payroll.userProfileId || payroll.employeeRef || payroll.employeeId, payroll]),
      );
      return salaryStructures.map((salaryStructure) => {
        const employeeId = salaryStructure.userProfileId || salaryStructure.userId;
        const latestPayroll = summariesByEmployee.get(employeeId);
        return {
          employeeId,
          salaryStructure,
          ...(latestPayroll ? { latestPayroll } : {}),
        };
      });
    });
  },

  async preview(input: PayrollPreviewInput): Promise<PayrollCalculationResponse> {
    if (input.salaryStructure) {
      const employee = await resolveAuthorizedEmployee(input.outletId, input.employee);
      return calculate(input, employee, normalizeSalaryStructure(input.salaryStructure));
    }
    const profileId = profileIdForEmployee(input.employee);
    const document = await savedSalaryOrThrow(input.outletId, profileId);
    return calculate(input, employeeFromSalary(document), structureForMonth(document, input.year, input.month));
  },

  async saveSalaryStructure(
    input: SaveSalaryStructureInput,
    actorId: string,
  ): Promise<SalaryStructureResponse> {
    const employee = await resolveAuthorizedEmployee(input.outletId, input.employee);
    const salaryStructure = normalizeSalaryStructure(input.salaryStructure);
    const calculated = await calculate(input, employee, salaryStructure);
    const now = Date.now();
    const revision: SalaryStructureRevision = {
      effectiveFrom: input.effectiveFrom,
      salaryStructure,
      updatedAt: now,
      updatedBy: actorId,
    };
    const proposed = {
      ...createEmployeeSalaryStructureDocument({
        employee,
        salaryStructure,
        preview: calculated.result,
        createdBy: actorId,
        now,
      }),
      salaryRevisions: [revision],
    };
    const employeeId = profileIdForEmployee(employee);
    const document = await payrollRepository.saveSalaryStructure(
      input.outletId,
      employeeId,
      proposed,
    );
    invalidateEmployeeCache(input.outletId, employeeId);
    return { ...calculated, document };
  },

  async generate(input: GeneratePayrollInput, actorId: string): Promise<GeneratePayrollResponse> {
    const document = await savedSalaryOrThrow(input.outletId, input.employeeId);
    const employee = employeeFromSalary(document);
    const calculationInput: PayrollPreviewInput = {
      ...input,
      employee,
    };
    const calculated = await calculate(
      calculationInput,
      employee,
      structureForMonth(document, input.year, input.month),
      true,
    );
    if (calculated.attendance.attendanceRecordCount === 0) {
      throw new AppError(
        409,
        "No attendance records are available for this payroll month",
        "PAYROLL_ATTENDANCE_UNAVAILABLE",
      );
    }
    const payroll = createPayrollRunDocument({
      result: calculated.result,
      attendance: calculated.attendance,
      createdBy: actorId,
      outletId: input.outletId,
      now: Date.now(),
    });
    const saved = await payrollRepository.savePayrollRun(
      input.outletId,
      input.employeeId,
      payroll,
    );
    payrollRunsCache.deleteWhere((key) =>
      key.startsWith(`${cacheKey(input.outletId, input.employeeId)}:`),
    );
    overviewCache.deleteWhere((key) => key === input.outletId);
    return { ...calculated, ...saved };
  },

  getRules({
    state,
    month,
    grossSalary,
    gender,
  }: {
    state?: string;
    month?: PayrollMonth;
    grossSalary?: number;
    gender?: "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";
  }): PayrollStatutoryRulesResponse {
    const normalizedState = state ? resolvePayrollState(state) : undefined;
    const canPreview = normalizedState && month !== undefined && grossSalary !== undefined;
    return {
      professionalTax: PT_STATE_SLAB_MASTER,
      labourWelfareFund: LWF_STATE_RULE_MASTER,
      ...(canPreview
        ? {
            professionalTaxPreview: calculateProfessionalTax({
              state: normalizedState,
              month,
              grossSalary,
              annualSalary: grossSalary * 12,
              ...(gender ? { gender } : {}),
            }),
            labourWelfareFundPreview: calculateLWF({
              state: normalizedState,
              month,
              grossSalary,
            }),
          }
        : {}),
    };
  },
};

  payrollServiceInternals = {
    applyAdjustments,
    flattenedSalaryStructure,
    normalizeSalaryStructure,
    structureForMonth,
  };
  return service;
}

export let payrollServiceInternals: {
  applyAdjustments: (
    attendance: AttendancePayrollInput,
    adjustments: PayrollPreviewInput["adjustments"],
  ) => AttendancePayrollInput;
  flattenedSalaryStructure: (document: EmployeeSalaryStructureDocument) => SalaryStructure;
  normalizeSalaryStructure: (salaryStructure?: SalaryStructure) => SalaryStructure;
  structureForMonth: (
    document: EmployeeSalaryStructureDocument,
    year: number,
    month: PayrollMonth,
  ) => SalaryStructure;
};

