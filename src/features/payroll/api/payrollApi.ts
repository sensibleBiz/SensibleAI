import type {
  AttendancePayrollInput,
  EmployeeSalaryStructureDocument,
  LWFRule,
  LWFResult,
  PayrollCalculationResult,
  PayrollEmployee,
  PayrollMonth,
  PayrollRunDocument,
  PTRule,
  ProfessionalTaxResult,
  SalaryStructure,
} from "@/features/payroll/domain";
import { postgresSession } from "@/features/auth";
import { apiRequest } from "@/shared/api/apiClient";

const payrollAuthOptions = () =>
  postgresSession.getAccessToken()
    ? { authMode: "postgres" as const }
    : {};

const withAuth = <T>(path: string, options: Parameters<typeof apiRequest<T>>[1] = {}) =>
  apiRequest<T>(path, { ...options, ...payrollAuthOptions() });

export interface PayrollAdjustments {
  loanDeduction?: number;
  advanceDeduction?: number;
  otherDeduction?: number;
  incentive?: number;
  arrears?: number;
}

export interface PayrollCalculationResponse {
  attendance: AttendancePayrollInput;
  result: PayrollCalculationResult;
}

export interface SalaryStructureResponse extends PayrollCalculationResponse {
  document: EmployeeSalaryStructureDocument;
}

export interface GeneratePayrollResponse extends PayrollCalculationResponse {
  payroll: PayrollRunDocument;
  created: boolean;
}

export interface PayrollEmployeeDataResponse {
  salaryStructure: EmployeeSalaryStructureDocument | null;
  payrollRuns: PayrollRunDocument[];
}

export interface PayrollOverviewRecord {
  employeeId: string;
  salaryStructure: EmployeeSalaryStructureDocument;
  latestPayroll?: PayrollRunDocument;
}

export interface PayrollStatutoryRulesResponse {
  professionalTax: PTRule[];
  labourWelfareFund: LWFRule[];
  professionalTaxPreview?: ProfessionalTaxResult;
  labourWelfareFundPreview?: LWFResult;
}

interface PreviewPayrollInput {
  outletId: string;
  employee: PayrollEmployee;
  salaryStructure?: SalaryStructure;
  month: PayrollMonth;
  year: number;
  adjustments?: PayrollAdjustments;
}

const query = (values: Record<string, string | number | undefined>) => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  }
  return searchParams.toString();
};

export const payrollApi = {
  getEmployeeData(
    outletId: string,
    employeeId: string,
    year?: number,
    signal?: AbortSignal,
  ) {
    return withAuth<PayrollEmployeeDataResponse>(
      `/api/v1/payroll/employee?${query({ outletId, employeeId, year })}`,
      { signal },
    );
  },

  getOverview(outletId: string, signal?: AbortSignal) {
    return withAuth<PayrollOverviewRecord[]>(
      `/api/v1/payroll/overview?${query({ outletId })}`,
      { signal },
    );
  },

  getStatutoryRules(
    outletId: string,
    options: {
      state?: string;
      month?: PayrollMonth;
      grossSalary?: number;
      gender?: "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";
    } = {},
    signal?: AbortSignal,
  ) {
    return withAuth<PayrollStatutoryRulesResponse>(
      `/api/v1/payroll/statutory-rules?${query({ outletId, ...options })}`,
      { signal },
    );
  },

  preview(input: PreviewPayrollInput, signal?: AbortSignal) {
    return withAuth<PayrollCalculationResponse>("/api/v1/payroll/preview", {
      method: "POST",
      body: input,
      signal,
    });
  },

  saveSalaryStructure(
    input: PreviewPayrollInput & { salaryStructure: SalaryStructure; effectiveFrom: string },
  ) {
    return withAuth<SalaryStructureResponse>("/api/v1/payroll/salary-structure", {
      method: "PATCH",
      body: input,
    });
  },

  generate(input: {
    outletId: string;
    employeeId: string;
    month: PayrollMonth;
    year: number;
    adjustments?: PayrollAdjustments;
  }) {
    return withAuth<GeneratePayrollResponse>("/api/v1/payroll/runs", {
      method: "POST",
      body: input,
    });
  },
};
