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
} from "../payroll-engine/types.js";

export interface PayrollEmployeeQuery {
  outletId: string;
  employeeId: string;
  year?: number;
}

export interface PayrollOverviewQuery {
  outletId: string;
}

export interface PayrollRulesQuery {
  outletId: string;
  state?: string;
  month?: PayrollMonth;
  grossSalary?: number;
  gender?: "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";
}

export interface PayrollAdjustments {
  loanDeduction?: number;
  advanceDeduction?: number;
  otherDeduction?: number;
  incentive?: number;
  arrears?: number;
}

export interface PayrollPreviewInput {
  outletId: string;
  employee: PayrollEmployee;
  salaryStructure?: SalaryStructure;
  month: PayrollMonth;
  year: number;
  adjustments?: PayrollAdjustments;
}

export interface SaveSalaryStructureInput extends PayrollPreviewInput {
  salaryStructure: SalaryStructure;
  effectiveFrom: string;
}

export interface GeneratePayrollInput {
  outletId: string;
  employeeId: string;
  month: PayrollMonth;
  year: number;
  adjustments?: PayrollAdjustments;
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

export type {
  AttendancePayrollInput,
  EmployeeSalaryStructureDocument,
  PayrollCalculationResult,
  PayrollEmployee,
  PayrollRunDocument,
  SalaryStructure,
};
