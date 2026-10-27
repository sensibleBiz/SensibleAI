import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useSelector } from "react-redux";
import {
  deriveSalaryComponentsFromGross,
  resolvePayrollState,
  SAMPLE_SALARY_EARNINGS,
} from "@/features/payroll/domain";
import type {
  AttendancePayrollInput,
  EmployeeSalaryStructureDocument,
  PayrollCalculationResult,
  PayrollEmployee,
  PayrollMonth,
  PayrollRunDocument,
  SalaryStructure,
  SalaryStructureRevision,
} from "@/features/payroll/domain";
import type { TeamTreeDTO } from "@/features/team";
import type { RootState } from "@/app/store";
import { useMessageApi } from "@/shared/hooks";
import { STATES_OBJECT } from "@/shared/lib/constants";
import { ApiError } from "@/shared/api/apiClient";
import { payrollApi } from "../api/payrollApi";
import AttendancePayrollInputPage from "./AttendancePayrollInput";
import EmployeeSalaryStructure from "./EmployeeSalaryStructure";
import GenerateSalarySlip, {
  type SalarySlipMonthRow,
} from "./GenerateSalarySlip";
import GeneratePayroll, {
  type PayrollGenerationScope,
} from "./GeneratePayroll";
import PayrollPreview from "./PayrollPreview";
import PayrollReport from "./PayrollReport";
import PayslipView from "./PayslipView";
import EmployeePayrollList from "./EmployeePayrollList";
import { downloadPayslipPdf, type PayslipLogo } from "./payslipPdf";
import { monthOptions } from "./payrollPageUtils";
import {
  normalizeSalaryRevisionDate,
} from "@/features/payroll/domain/salaryStructureRevisions";

const defaultEmployee: PayrollEmployee = {
  id: "EMP-001",
  name: "Sample Employee",
  empCode: "SC-001",
  department: "Operations",
  designation: "Executive",
  workLocationState: "Maharashtra",
  gender: "UNSPECIFIED",
  dateOfJoining: "2018-01-01",
};

const stateValueByKey = new Map(
  STATES_OBJECT.flatMap((state) => [
    [state.value.toLowerCase().replace(/[^a-z0-9]/g, ""), state.value],
    [state.name.toLowerCase().replace(/[^a-z0-9]/g, ""), state.value],
  ])
);

const resolveWorkLocationState = (...candidates: (string | undefined)[]) => {
  for (const candidate of candidates) {
    const resolvedState = resolvePayrollState(candidate);
    const stateKey = resolvedState.toLowerCase().replace(/[^a-z0-9]/g, "");
    const validState = stateValueByKey.get(stateKey);

    if (validState) return validState;
  }

  return defaultEmployee.workLocationState!;
};

const defaultAttendance = (): AttendancePayrollInput => {
  const today = dayjs();

  return {
    employeeId: defaultEmployee.id,
    month: (today.month() + 1) as PayrollMonth,
    year: today.year(),
    presentDays: 22,
    paidLeave: 1,
    weeklyOff: 4,
    paidHolidays: 1,
    absentDays: 1,
    unpaidLeave: 0,
    monthDays: today.daysInMonth(),
    otHours: 6,
    loanDeduction: 0,
    advanceDeduction: 0,
    otherDeduction: 0,
    incentive: 0,
    arrears: 0,
  };
};

const defaultSalaryStructure: SalaryStructure = {
  salaryType: "MONTHLY",
  grossSalary: 35000,
  isMetroCity: false,
  earnings: deriveSalaryComponentsFromGross(35000, {
    isMetroCity: false,
    earnings: SAMPLE_SALARY_EARNINGS,
  }),
  deductions: {
    loan: 0,
    advance: 0,
    otherDeductions: 0,
  },
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
};

const getDefaultSalaryStructure = (): SalaryStructure => ({
  ...defaultSalaryStructure,
  earnings: { ...defaultSalaryStructure.earnings },
  deductions: { ...defaultSalaryStructure.deductions },
  payrollOptions: { ...defaultSalaryStructure.payrollOptions },
  attendanceSettings: { ...defaultSalaryStructure.attendanceSettings },
});

const amountOr = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const normalizeSalaryStructure = (
  salaryStructure?: SalaryStructure
): SalaryStructure => {
  const defaults = getDefaultSalaryStructure();

  return {
    ...defaults,
    ...salaryStructure,
    earnings: {
      ...defaults.earnings,
      ...salaryStructure?.earnings,
    },
    deductions: {
      ...defaults.deductions,
      ...salaryStructure?.deductions,
    },
    payrollOptions: {
      ...defaults.payrollOptions,
      ...salaryStructure?.payrollOptions,
    },
    attendanceSettings: {
      ...defaults.attendanceSettings,
      ...salaryStructure?.attendanceSettings,
    },
  };
};

const mapFlattenedSalaryStructureDocument = (
  document: EmployeeSalaryStructureDocument
): SalaryStructure => {
  const defaults = getDefaultSalaryStructure();

  return normalizeSalaryStructure({
    salaryType: document.salaryType || defaults.salaryType,
    grossSalary: amountOr(
      document.grossSalary,
      amountOr(document.monthlySalary, defaults.grossSalary)
    ),
    isMetroCity: document.isMetroCity ?? defaults.isMetroCity ?? false,
    ctc: amountOr(document.ctc, defaults.ctc),
    earnings: deriveSalaryComponentsFromGross(
      amountOr(
        document.grossSalary,
        amountOr(document.monthlySalary, defaults.grossSalary)
      ),
      {
        isMetroCity: document.isMetroCity ?? defaults.isMetroCity ?? false,
        earnings: {
          basic: amountOr(document.basic, defaults.earnings.basic),
          hra: amountOr(document.hra, defaults.earnings.hra),
          da: amountOr(document.da, defaults.earnings.da),
          conveyance: amountOr(
            document.conveyance,
            defaults.earnings.conveyance
          ),
          medical: amountOr(document.medical, defaults.earnings.medical),
          specialAllowance: amountOr(
            document.specialAllowance,
            defaults.earnings.specialAllowance
          ),
          otherEarnings: amountOr(
            document.otherAllowance,
            defaults.earnings.otherEarnings
          ),
          incentive: amountOr(document.incentive, defaults.earnings.incentive),
          overtime: 0,
          bonus: 0,
          arrears: 0,
        },
      }
    ),
    deductions: { ...defaults.deductions },
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
      leavePolicyId: document.leavePolicyId,
    },
  });
};

const getInitialEffectiveFrom = (document: EmployeeSalaryStructureDocument) =>
  normalizeSalaryRevisionDate(
    document.joiningDate ||
      (document.createdAt ? dayjs(document.createdAt).format("YYYY-MM-DD") : undefined)
  );

const getSalaryStructureRevisions = (
  document: EmployeeSalaryStructureDocument
): SalaryStructureRevision[] => {
  if (document.salaryRevisions?.length) {
    return document.salaryRevisions
      .map((revision) => ({
        ...revision,
        effectiveFrom: normalizeSalaryRevisionDate(revision.effectiveFrom),
        salaryStructure: normalizeSalaryStructure(revision.salaryStructure),
      }))
      .sort((left, right) =>
        left.effectiveFrom.localeCompare(right.effectiveFrom)
      );
  }

  return [
    {
      effectiveFrom: getInitialEffectiveFrom(document),
      salaryStructure: mapFlattenedSalaryStructureDocument(document),
      updatedAt: document.updatedAt || document.createdAt || Date.now(),
      updatedBy: document.createdBy || "system",
    },
  ];
};

const getLatestSalaryStructureRevision = (
  document: EmployeeSalaryStructureDocument
) => {
  const revisions = getSalaryStructureRevisions(document);
  return revisions[revisions.length - 1];
};

const mapSalaryStructureDocument = (
  document: EmployeeSalaryStructureDocument
) => getLatestSalaryStructureRevision(document).salaryStructure;

const mergeSavedEmployeeDetails = (
  employee: PayrollEmployee,
  document: EmployeeSalaryStructureDocument
): PayrollEmployee => {
  const workLocationState = resolveWorkLocationState(
    document.workLocationState,
    employee.workLocationState
  );

  return {
    ...employee,
    name: document.employeeName || document.userName || employee.name,
    empCode: document.empCode || employee.empCode,
    department: document.department || employee.department,
    designation: document.designation || employee.designation,
    workLocationState,
    gender: document.gender || employee.gender,
    dateOfJoining: document.joiningDate || employee.dateOfJoining,
  };
};

const mapTeamMemberToPayrollEmployee = (
  member: TeamTreeDTO,
  fallbackState?: string
): PayrollEmployee => ({
  id: member.empCode || member.code || member.userProfileId,
  userProfileId: member.userProfileId,
  employeeRef: member.userProfileId,
  name: member.userName || member.empCode || member.userProfileId,
  empCode: member.empCode || member.code,
  department: member.department,
  designation: member.designation,
  workLocationState: resolveWorkLocationState(fallbackState),
});

const safeFirestoreIdPart = (value: string | number) =>
  String(value).trim().replace(/\//g, "-");

const isSamePayrollEmployee = (
  employee: PayrollEmployee,
  employeeId?: string
) =>
  Boolean(employeeId) &&
  [
    employee.id,
    employee.empCode,
    employee.userProfileId,
    employee.employeeRef,
  ].includes(
    employeeId
  );

const getEmployeeProfileId = (employee: PayrollEmployee) =>
  employee.userProfileId || employee.employeeRef || employee.id;

const getSalaryStructureSaveKey = (employee: PayrollEmployee) =>
  [
    safeFirestoreIdPart(employee.id),
    safeFirestoreIdPart(getEmployeeProfileId(employee)),
  ].join("|");

const getSalarySlipResultKey = (
  employee: PayrollEmployee,
  month: PayrollMonth,
  year: number
) =>
  [
    getSalaryStructureSaveKey(employee),
    year,
    String(month).padStart(2, "0"),
  ].join("|");

const getSalarySlipLogoStorageKey = (outletId?: string) =>
  `crm-salary-slip-logo:${outletId || "default"}`;

const readStoredSalarySlipLogo = (storageKey: string): PayslipLogo | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawLogo = window.localStorage.getItem(storageKey);
    if (!rawLogo) return null;

    const logo = JSON.parse(rawLogo) as PayslipLogo;
    return logo?.dataUrl ? logo : null;
  } catch {
    return null;
  }
};

const getSavedPayrollCalculationResult = (
  document: PayrollRunDocument,
  employee: PayrollEmployee
): PayrollCalculationResult | undefined => {
  if (
    !document.attendanceSummary ||
    !document.earnings ||
    !document.deductions ||
    !document.employerContributions ||
    !document.ruleBreakup
  ) {
    return undefined;
  }

  const ruleLopDays = amountOr(document.ruleBreakup.lop?.lopDays);
  const lopDays = amountOr(
    document.lopDays,
    ruleLopDays ||
      amountOr(document.attendanceSummary.absentDays) +
        amountOr(document.attendanceSummary.unpaidLeave) +
        amountOr(document.attendanceSummary.preJoiningDays)
  );
  const monthDays = amountOr(document.attendanceSummary.monthDays);
  const payableDays = amountOr(
    document.payableDays,
    Math.max(monthDays - lopDays, 0)
  );
  const grossSalary = amountOr(
    document.grossSalary,
    amountOr(document.earnings.grossEarnings)
  );
  const ctc = amountOr(document.ctc);
  const accountedDays =
    amountOr(document.attendanceSummary.presentDays) +
    amountOr(document.attendanceSummary.paidLeave) +
    amountOr(document.attendanceSummary.weeklyOff) +
    amountOr(document.attendanceSummary.paidHolidays) +
    amountOr(document.attendanceSummary.absentDays) +
    amountOr(document.attendanceSummary.unpaidLeave) +
    amountOr(document.attendanceSummary.preJoiningDays) +
    amountOr(document.attendanceSummary.postExitDays) +
    amountOr(document.attendanceSummary.pendingAttendanceDays);
  const earnings = {
    ...document.earnings,
    scheduledGross: amountOr(document.earnings.scheduledGross, grossSalary),
    lopEligibleGross: amountOr(document.earnings.lopEligibleGross, grossSalary),
    lopDeduction: amountOr(document.earnings.lopDeduction, document.deductions.lop),
    earnedFixedSalary: amountOr(
      document.earnings.earnedFixedSalary,
      grossSalary - amountOr(document.deductions.lop)
    ),
    regularEarnings: amountOr(
      document.earnings.regularEarnings,
      grossSalary - amountOr(document.deductions.lop)
    ),
    oneTimeEarnings: amountOr(document.earnings.oneTimeEarnings),
    earnedGross: amountOr(document.earnings.earnedGross, grossSalary),
    grossEarnings: amountOr(document.earnings.grossEarnings, grossSalary),
  };
  const deductions = {
    ...document.deductions,
    totalEmployeeDeductions: amountOr(
      document.deductions.totalEmployeeDeductions,
      document.deductions.totalDeductions
    ),
  };
  const netSalary = amountOr(document.netSalary);
  const employerContributions = {
    ...document.employerContributions,
    employerEPF: amountOr(
      document.employerContributions.employerEPF,
      document.ruleBreakup.pf.employerEPF
    ),
    employerEPS: amountOr(
      document.employerContributions.employerEPS,
      amountOr(document.ruleBreakup.pf.employerEPS, document.ruleBreakup.pf.eps)
    ),
    employerEDLI: amountOr(
      document.employerContributions.employerEDLI,
      amountOr(document.ruleBreakup.pf.employerEDLI, document.ruleBreakup.pf.edli)
    ),
    epfAdministrativeCharges: amountOr(
      document.employerContributions.epfAdministrativeCharges,
      document.ruleBreakup.pf.administrativeCharges
    ),
    monthlyGratuityProvision: amountOr(
      document.employerContributions.monthlyGratuityProvision,
      document.employerContributions.gratuityProvision
    ),
    estimatedAccruedGratuity: amountOr(
      document.employerContributions.estimatedAccruedGratuity
    ),
    totalEmployerContributions: amountOr(
      document.employerContributions.totalEmployerContributions,
      document.employerContributions.totalEmployerContribution
    ),
  };
  const actualPayrollCost = amountOr(
    document.actualPayrollCost,
    amountOr(earnings.earnedGross, grossSalary) +
      amountOr(employerContributions.totalEmployerContribution)
  );
  const savedEmployee = {
    ...employee,
    gender: document.employeeGender || employee.gender,
  };

  return {
    employee: savedEmployee,
    salaryType: document.salaryType || "MONTHLY",
    state: document.state || employee.workLocationState || "Maharashtra",
    month: document.month,
    year: document.year,
    attendance: {
      monthDays,
      calendarDays: monthDays,
      scheduledWorkingDays: Math.max(
        monthDays -
          amountOr(document.attendanceSummary.weeklyOff) -
          amountOr(document.attendanceSummary.paidHolidays),
        0
      ),
      paidWeeklyOffDays: amountOr(document.attendanceSummary.weeklyOff),
      paidHolidayDays: amountOr(document.attendanceSummary.paidHolidays),
      workedDays: amountOr(document.attendanceSummary.presentDays),
      paidLeaveDays: amountOr(document.attendanceSummary.paidLeave),
      unpaidLeaveDays: amountOr(document.attendanceSummary.unpaidLeave),
      accountedDays,
      payableDays,
      lopDays,
      workedHours: amountOr(document.attendanceSummary.workedHours),
      overtimeHours: amountOr(
        document.attendanceSummary.overtimeHours,
        document.attendanceSummary.otHours
      ),
    },
    earnings,
    deductions,
    employeeDeductions: deductions,
    employerContributions,
    totals: {
      netSalary,
      standardMonthlyCTC: ctc,
      actualPayrollCost,
    },
    netSalary,
    ctc,
    standardMonthlyCTC: ctc,
    actualPayrollCost,
    payableDays,
    lopDays,
    perDaySalary: amountOr(
      document.perDaySalary,
      amountOr(document.ruleBreakup.lop?.perDaySalary)
    ),
    validationErrors: [],
    warnings: [],
    ruleBreakup: document.ruleBreakup,
    statutoryRuleVersions: document.statutoryRuleVersions || {},
  };
};

const buildPayrollDate = (month: PayrollMonth, year: number) =>
  dayjs(`${year}-${String(month).padStart(2, "0")}-01`);

const getPayrollMonthAvailability = (
  employee: PayrollEmployee,
  month: PayrollMonth,
  year: number
) => {
  const payrollDate = buildPayrollDate(month, year);
  const joiningDate = employee.dateOfJoining
    ? dayjs(employee.dateOfJoining).startOf("month")
    : undefined;

  if (joiningDate && payrollDate.isBefore(joiningDate, "month")) {
    return { canGenerate: false, unavailableReason: "BEFORE_JOINING" as const };
  }

  if (payrollDate.isAfter(dayjs().startOf("month"), "month")) {
    return { canGenerate: false, unavailableReason: "UPCOMING" as const };
  }

  return { canGenerate: true };
};

export default function SalaryMasterPage() {
  const messageApi = useMessageApi();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id
  );
  const outletState = useSelector(
    (state: RootState) => state.appState.outletInfo?.state
  );
  const teamTreeData = useSelector(
    (state: RootState) => state.appState.teamTreeData
  );
  const [employee, setEmployee] = useState<PayrollEmployee>(defaultEmployee);
  const [salaryStructure, setSalaryStructure] = useState<SalaryStructure>(
    getDefaultSalaryStructure
  );
  const [attendance, setAttendance] =
    useState<AttendancePayrollInput>(defaultAttendance);
  const [payrollDate, setPayrollDate] = useState<Dayjs>(dayjs());
  const [result, setResult] = useState<PayrollCalculationResult>();
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activePayrollTab, setActivePayrollTab] = useState("salary");
  const [savedSalaryStructureKeys, setSavedSalaryStructureKeys] = useState<
    string[]
  >([]);
  const [salaryEffectiveFrom, setSalaryEffectiveFrom] = useState<Dayjs>(
    dayjs().startOf("month")
  );
  const [salarySlipYear, setSalarySlipYear] = useState<Dayjs>(dayjs());
  const [salarySlipResultsByKey, setSalarySlipResultsByKey] = useState<
    Record<string, PayrollCalculationResult>
  >({});
  const [salarySlipsLoading, setSalarySlipsLoading] = useState(false);
  const [loadedEmployeePayrollKey, setLoadedEmployeePayrollKey] = useState("");
  const salarySlipLogoStorageKey = useMemo(
    () => getSalarySlipLogoStorageKey(outletId),
    [outletId]
  );
  const [loadedSalarySlipLogoKey, setLoadedSalarySlipLogoKey] = useState("");
  const [salarySlipLogo, setSalarySlipLogo] = useState<PayslipLogo | null>(
    null
  );

  const employees = useMemo(() => {
    const payrollEmployees = (teamTreeData || [])
      .filter((member) => member.isActive && member.isOnPayRoll !== false)
      .map((member) => mapTeamMemberToPayrollEmployee(member, outletState));

    return payrollEmployees.length ? payrollEmployees : [defaultEmployee];
  }, [outletState, teamTreeData]);

  useEffect(() => {
    if (employees.some((item) => isSamePayrollEmployee(item, employee.id))) {
      return;
    }
    const firstEmployee = employees[0];
    if (firstEmployee) setEmployee(firstEmployee);
  }, [employee.id, employees]);

  useEffect(() => {
    setSalarySlipLogo(readStoredSalarySlipLogo(salarySlipLogoStorageKey));
    setLoadedSalarySlipLogoKey(salarySlipLogoStorageKey);
  }, [salarySlipLogoStorageKey]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      loadedSalarySlipLogoKey !== salarySlipLogoStorageKey
    ) {
      return;
    }

    try {
      if (salarySlipLogo) {
        window.localStorage.setItem(
          salarySlipLogoStorageKey,
          JSON.stringify(salarySlipLogo)
        );
        return;
      }

      window.localStorage.removeItem(salarySlipLogoStorageKey);
    } catch {
      // Ignore local persistence failures; the uploaded logo still works in memory.
    }
  }, [
    loadedSalarySlipLogoKey,
    salarySlipLogo,
    salarySlipLogoStorageKey,
  ]);
  const employeeProfileId = getEmployeeProfileId(employee);
  const employeeSalaryStructureKey = getSalaryStructureSaveKey(employee);
  const selectedEmployeeRef = useRef(employee);
  selectedEmployeeRef.current = employee;

  useEffect(() => {
    if (!outletId) return;

    const controller = new AbortController();
    const requestedEmployee = selectedEmployeeRef.current;
    let cancelled = false;
    setLoadedEmployeePayrollKey("");
    setSalarySlipsLoading(true);

    payrollApi
      .getEmployeeData(
        outletId,
        employeeProfileId,
        salarySlipYear.year(),
        controller.signal
      )
      .then(({ salaryStructure: savedDocument, payrollRuns }) => {
        if (cancelled) return;

        if (!savedDocument) {
          setSalaryStructure(getDefaultSalaryStructure());
          setSalaryEffectiveFrom(dayjs().startOf("month"));
          setResult(undefined);
          setSavedSalaryStructureKeys((previous) =>
            previous.filter((key) => key !== employeeSalaryStructureKey)
          );
        } else {
          setEmployee((previous) =>
            getSalaryStructureSaveKey(previous) === employeeSalaryStructureKey
              ? mergeSavedEmployeeDetails(previous, savedDocument)
              : previous
          );
          setSalaryStructure(mapSalaryStructureDocument(savedDocument));
          setSalaryEffectiveFrom(
            dayjs(getLatestSalaryStructureRevision(savedDocument).effectiveFrom)
          );
          setResult(savedDocument.preview);
          setSavedSalaryStructureKeys((previous) =>
            previous.includes(employeeSalaryStructureKey)
              ? previous
              : [...previous, employeeSalaryStructureKey]
          );
        }

        const savedResults = payrollRuns.reduce<
          Record<string, PayrollCalculationResult>
        >((results, document) => {
          const savedResult = getSavedPayrollCalculationResult(
            document,
            requestedEmployee,
          );
          if (savedResult) {
            results[
              getSalarySlipResultKey(
                requestedEmployee,
                savedResult.month,
                savedResult.year,
              )
            ] = savedResult;
          }
          return results;
        }, {});

        setSalarySlipResultsByKey((previous) => {
          const employeeKeyPrefix = `${employeeSalaryStructureKey}|`;
          const remainingResults = Object.fromEntries(
            Object.entries(previous).filter(
              ([key]) => !key.startsWith(employeeKeyPrefix)
            )
          );
          return { ...remainingResults, ...savedResults };
        });
        setLoadedEmployeePayrollKey(employeeSalaryStructureKey);
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        console.error("Failed to load payroll employee data", error);
        messageApi.error("Failed to load salary and payroll records");
      })
      .finally(() => {
        if (!cancelled) setSalarySlipsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    employeeProfileId,
    employeeSalaryStructureKey,
    messageApi,
    outletId,
    salarySlipYear,
  ]);

  const requestPayrollPreview = useCallback(
    async (
      targetEmployee: PayrollEmployee = employee,
      targetPayrollDate: Dayjs = payrollDate
    ) => {
      if (!outletId) {
        throw new Error("Select an outlet before calculating payroll");
      }

      const response = await payrollApi.preview({
        outletId,
        employee: targetEmployee,
        salaryStructure,
        month: (targetPayrollDate.month() + 1) as PayrollMonth,
        year: targetPayrollDate.year(),
        adjustments: {
          loanDeduction: attendance.loanDeduction || 0,
          advanceDeduction: attendance.advanceDeduction || 0,
          otherDeduction: attendance.otherDeduction || 0,
          incentive: attendance.incentive || 0,
          arrears: attendance.arrears || 0,
        },
      });

      return {
        generated: response.result,
        payrollAttendance: response.attendance,
      };
    },
    [attendance, employee, outletId, payrollDate, salaryStructure]
  );

  useEffect(() => {
    if (!outletId || loadedEmployeePayrollKey !== employeeSalaryStructureKey) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setAttendanceLoading(true);

    payrollApi
      .preview(
        {
          outletId,
          employee,
          salaryStructure,
          month: (payrollDate.month() + 1) as PayrollMonth,
          year: payrollDate.year(),
          adjustments: {
            loanDeduction: attendance.loanDeduction || 0,
            advanceDeduction: attendance.advanceDeduction || 0,
            otherDeduction: attendance.otherDeduction || 0,
            incentive: attendance.incentive || 0,
            arrears: attendance.arrears || 0,
          },
        },
        controller.signal
      )
      .then((response) => {
        if (cancelled) return;
        setAttendance(response.attendance);
        setResult(response.result);
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        console.error("Failed to load payroll attendance preview", error);
      })
      .finally(() => {
        if (!cancelled) setAttendanceLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // Adjustments are intentionally excluded: editing them should not cause network calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    employeeProfileId,
    employeeSalaryStructureKey,
    loadedEmployeePayrollKey,
    outletId,
    payrollDate,
  ]);

  const autoPreview = attendanceLoading ? undefined : result;
  const salaryStructureSaved = savedSalaryStructureKeys.includes(
    getSalaryStructureSaveKey(employee)
  );
  const salarySlipMonths = useMemo<SalarySlipMonthRow[]>(() => {
    const year = salarySlipYear.year();

    return monthOptions.map((option) => {
      const key = getSalarySlipResultKey(employee, option.value, year);
      const availability = getPayrollMonthAvailability(
        employee,
        option.value,
        year
      );

      return {
        key,
        month: option.value,
        year,
        ...availability,
        result: salarySlipResultsByKey[key],
      };
    });
  }, [employee, salarySlipResultsByKey, salarySlipYear]);

  const handleDateChange = (date: Dayjs) => {
    const month = (date.month() + 1) as PayrollMonth;

    setPayrollDate(date);
    setAttendance((previous) => ({
      ...previous,
      month,
      year: date.year(),
      monthDays: date.daysInMonth(),
    }));
  };

  const handleEmployeeChange = (nextEmployee: PayrollEmployee) => {
    const workLocationState = resolveWorkLocationState(
      nextEmployee.workLocationState,
      outletState
    );

    setEmployee({
      ...nextEmployee,
      workLocationState,
    });
    setLoadedEmployeePayrollKey("");
    setSalaryStructure(getDefaultSalaryStructure());
    setSalaryEffectiveFrom(dayjs().startOf("month"));
    setResult(undefined);
    setAttendance((previous) => ({
      ...previous,
      employeeId: nextEmployee.id,
    }));
  };

  const handleSalaryStructureChange = (nextSalaryStructure: SalaryStructure) => {
    const currentEmployeeKey = getSalaryStructureSaveKey(employee);

    setSalaryStructure(nextSalaryStructure);
    setSavedSalaryStructureKeys((previous) =>
      previous.filter((key) => key !== currentEmployeeKey)
    );
  };

  const handleSalaryEffectiveFromChange = (date: Dayjs) => {
    const currentEmployeeKey = getSalaryStructureSaveKey(employee);

    setSalaryEffectiveFrom(date.startOf("month"));
    setSavedSalaryStructureKeys((previous) =>
      previous.filter((key) => key !== currentEmployeeKey)
    );
  };

  const showPayrollError = (error: unknown, fallback: string) => {
    if (error instanceof ApiError) {
      if (error.code === "PAYROLL_ATTENDANCE_UNAVAILABLE") {
        messageApi.warning(error.message);
      } else {
        messageApi.error(error.message);
      }
      return;
    }

    console.error(fallback, error);
    messageApi.error(fallback);
  };

  const handleCalculatePreview = async () => {
    try {
      const { generated, payrollAttendance } = await requestPayrollPreview();
      setAttendance(payrollAttendance);
      setResult(generated);
      messageApi.success("Payroll preview calculated");
    } catch (error) {
      showPayrollError(error, "Payroll preview failed");
    }
  };

  const handleSaveSalaryStructure = async () => {
    if (!outletId) {
      messageApi.error("Select an outlet before saving salary");
      return;
    }

    setSavingSalary(true);
    try {
      const response = await payrollApi.saveSalaryStructure({
        outletId,
        employee,
        salaryStructure,
        effectiveFrom: salaryEffectiveFrom.format("YYYY-MM-DD"),
        month: (payrollDate.month() + 1) as PayrollMonth,
        year: payrollDate.year(),
        adjustments: {
          loanDeduction: attendance.loanDeduction || 0,
          advanceDeduction: attendance.advanceDeduction || 0,
          otherDeduction: attendance.otherDeduction || 0,
          incentive: attendance.incentive || 0,
          arrears: attendance.arrears || 0,
        },
      });

      setAttendance(response.attendance);
      setResult(response.result);
      setSalaryStructure(mapSalaryStructureDocument(response.document));
      setSavedSalaryStructureKeys((previous) =>
        previous.includes(employeeSalaryStructureKey)
          ? previous
          : [...previous, employeeSalaryStructureKey]
      );
      setSalaryEffectiveFrom(
        dayjs(getLatestSalaryStructureRevision(response.document).effectiveFrom)
      );
      messageApi.success("Salary structure saved successfully");
    } catch (error) {
      showPayrollError(error, "Failed to save salary structure");
    } finally {
      setSavingSalary(false);
    }
  };

  const handleReset = () => {
    setEmployee(employees[0] || defaultEmployee);
    setSalaryStructure(getDefaultSalaryStructure());
    setAttendance(defaultAttendance());
    setPayrollDate(dayjs());
    setResult(undefined);
    setSavedSalaryStructureKeys([]);
    setSalaryEffectiveFrom(dayjs().startOf("month"));
    setSalarySlipYear(dayjs());
    setSalarySlipResultsByKey({});
  };

  const generatePayrollForEmployee = async (
    selectedEmployee: PayrollEmployee,
    targetPayrollDate: Dayjs = payrollDate
  ): Promise<PayrollCalculationResult> => {
    if (!outletId) {
      throw new Error("Select an outlet before generating payroll");
    }

    const response = await payrollApi.generate({
      outletId,
      employeeId: getEmployeeProfileId(selectedEmployee),
      month: (targetPayrollDate.month() + 1) as PayrollMonth,
      year: targetPayrollDate.year(),
      adjustments: {
        loanDeduction: attendance.loanDeduction || 0,
        advanceDeduction: attendance.advanceDeduction || 0,
        otherDeduction: attendance.otherDeduction || 0,
        incentive: attendance.incentive || 0,
        arrears: attendance.arrears || 0,
      },
    });
    const generated = response.result;

    setEmployee(selectedEmployee);
    setAttendance(response.attendance);
    setResult(generated);
    setSalarySlipResultsByKey((previous) => ({
      ...previous,
      [getSalarySlipResultKey(
        selectedEmployee,
        generated.month,
        generated.year
      )]: generated,
    }));

    return generated;
  };

  const handleGenerate = async (scope: PayrollGenerationScope) => {
    if (!salaryStructureSaved) {
      messageApi.warning("Save salary structure before generating payroll");
      return;
    }

    setGenerating(true);

    try {
      const selectedEmployee =
        scope.type === "employee"
          ? employees.find((item) =>
              isSamePayrollEmployee(item, scope.employeeId)
            ) || employee
          : employee;

      await generatePayrollForEmployee(selectedEmployee);
      messageApi.success("Payroll generated successfully");
    } catch (error) {
      showPayrollError(error, "Payroll generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateSalarySlip = async (
    month: PayrollMonth,
    year: number
  ) => {
    if (!salaryStructureSaved) {
      messageApi.warning("Save salary structure before generating salary slip");
      return;
    }

    const resultKey = getSalarySlipResultKey(employee, month, year);
    if (salarySlipResultsByKey[resultKey]) {
      messageApi.info("This salary slip has already been generated");
      return;
    }

    const availability = getPayrollMonthAvailability(employee, month, year);
    if (!availability.canGenerate) {
      messageApi.warning(
        availability.unavailableReason === "BEFORE_JOINING"
          ? "Salary slips cannot be generated before the joining month"
          : "Future month salary slips cannot be generated"
      );
      return;
    }

    setGenerating(true);

    try {
      const slipDate = buildPayrollDate(month, year);
      const generated = await generatePayrollForEmployee(employee, slipDate);

      setSalarySlipResultsByKey((previous) => ({
        ...previous,
        [resultKey]: generated,
      }));
      messageApi.success("Salary slip generated successfully");
    } catch (error) {
      showPayrollError(error, "Salary slip generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadSalarySlipPdf = async (
    month: PayrollMonth,
    year: number
  ) => {
    const resultKey = getSalarySlipResultKey(employee, month, year);
    const savedResult = salarySlipResultsByKey[resultKey];

    if (!savedResult && !salaryStructureSaved) {
      messageApi.warning("Save salary structure before downloading salary slip");
      return;
    }

    const availability = getPayrollMonthAvailability(employee, month, year);
    if (!availability.canGenerate) {
      messageApi.warning(
        availability.unavailableReason === "BEFORE_JOINING"
          ? "Salary slips cannot be downloaded before the joining month"
          : "Future month salary slips cannot be downloaded"
      );
      return;
    }

    setGenerating(true);

    try {
      let generated = savedResult;

      if (!generated) {
        const slipDate = buildPayrollDate(month, year);
        generated = await generatePayrollForEmployee(employee, slipDate);
        setSalarySlipResultsByKey((previous) => ({
          ...previous,
          [resultKey]: generated,
        }));
      }

      downloadPayslipPdf(generated, { logo: salarySlipLogo });
      messageApi.success("Salary slip PDF downloaded");
    } catch (error) {
      showPayrollError(error, "Salary slip PDF download failed");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      {/* <Card style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginTop: 0 }}>
          Payroll and Salary Master
        </Title>
        <Text type="secondary">
          Existing salary reporting is preserved. Statutory payroll rules now run automatically from internal code and master data.
        </Text>
      </Card> */}

      <Tabs
        activeKey={activePayrollTab}
        onChange={setActivePayrollTab}
        destroyInactiveTabPane={false}
        items={[
                  {
                    key: "salary",
                    label: "Employee Salary Structure",
                    children: (
                      <EmployeeSalaryStructure
                        employee={employee}
                        employees={employees}
                        salaryStructure={salaryStructure}
                        previewResult={autoPreview}
                        saving={savingSalary}
                        salaryStructureSaved={salaryStructureSaved}
                        salaryEffectiveFrom={salaryEffectiveFrom}
                        onEmployeeChange={handleEmployeeChange}
                        onSalaryStructureChange={handleSalaryStructureChange}
                        onCalculatePreview={handleCalculatePreview}
                        onSave={handleSaveSalaryStructure}
                        onSalaryEffectiveFromChange={handleSalaryEffectiveFromChange}
                        onReset={handleReset}
                      />
                    ),
                  },
                  {
                    key: "employee-payroll",
                    label: "Employee Payroll",
                    children: <EmployeePayrollList outletId={outletId} employees={employees} />,
                  },
                  {
                    key: "attendance",
                    label: "Attendance Input",
                    children: (
                      <AttendancePayrollInputPage
                        attendance={attendance}
                        employee={employee}
                        employees={employees}
                        payrollDate={payrollDate}
                        attendanceSettings={salaryStructure.attendanceSettings}
                        attendanceLoading={attendanceLoading}
                        onChange={setAttendance}
                        onEmployeeChange={handleEmployeeChange}
                        onDateChange={handleDateChange}
                      />
                    ),
                  },
                  {
                    key: "generate",
                    label: "Generate Payroll",
                    children: (
                      <GeneratePayroll
                        payrollDate={payrollDate}
                        employee={employee}
                        employees={employees}
                        result={result}
                        generating={generating}
                        onDateChange={handleDateChange}
                        onEmployeeChange={handleEmployeeChange}
                        onGenerate={handleGenerate}
                      />
                    ),
                  },
                  {
                    key: "salary-slip",
                    label: "Generate Salary Slip",
                    children: (
                      <GenerateSalarySlip
                        employee={employee}
                        employees={employees}
                        salaryStructureSaved={salaryStructureSaved}
                        salarySlipYear={salarySlipYear}
                        salarySlipMonths={salarySlipMonths}
                        generating={generating || salarySlipsLoading}
                        salarySlipLogo={salarySlipLogo}
                        onEmployeeChange={handleEmployeeChange}
                        onYearChange={setSalarySlipYear}
                        onGenerate={handleGenerateSalarySlip}
                        onDownloadPdf={handleDownloadSalarySlipPdf}
                        onSalarySlipLogoChange={setSalarySlipLogo}
                      />
                    ),
                  },
                  {
                    key: "preview",
                    label: "Payroll Preview",
                    children: <PayrollPreview result={result || autoPreview} />,
                  },
                  {
                    key: "payslip",
                    label: "Payslip View",
                    children: (
                      <PayslipView
                        result={result || autoPreview}
                        salarySlipLogo={salarySlipLogo}
                      />
                    ),
                  },
                  {
                    key: "report",
                    label: "Payroll Report",
                    children: <PayrollReport result={result || autoPreview} />,
                  },
        ]}
      />
    </div>
  );
}
