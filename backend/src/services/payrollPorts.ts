import type {
  EmployeeSalaryStructureDocument,
  PayrollEmployee,
  PayrollRunDocument,
} from "../payroll-engine/types.js";
import type {
  AttendanceHoliday,
  AttendanceRecordDocument,
  AttendanceSalary,
  LeaveApplicationRecord,
} from "../types/attendance.types.js";

/** Firestore SALARY_MASTER / PAYROLL / TEAM_TREE ↔ PostgreSQL crm.employee_salary_structures / payroll_runs */
export interface PayrollStoragePort {
  getActivePayrollEmployee(outletId: string, employeeId: string): Promise<PayrollEmployee | null>;
  getSalaryStructure(outletId: string, employeeId: string): Promise<EmployeeSalaryStructureDocument | null>;
  listPayrollRuns(outletId: string, employeeId: string, year?: number): Promise<PayrollRunDocument[]>;
  listSalaryStructures(outletId: string): Promise<EmployeeSalaryStructureDocument[]>;
  listLatestPayrollSummaries(outletId: string): Promise<PayrollRunDocument[]>;
  listActiveSalarySummaries(outletId: string): Promise<AttendanceSalary[]>;
  saveSalaryStructure(
    outletId: string,
    employeeId: string,
    proposed: EmployeeSalaryStructureDocument,
  ): Promise<EmployeeSalaryStructureDocument>;
  savePayrollRun(
    outletId: string,
    employeeId: string,
    payroll: PayrollRunDocument,
  ): Promise<{ payroll: PayrollRunDocument; created: boolean }>;
}

export interface PayrollAttendancePort {
  listAttendanceForDays(outletId: string, dayIds: string[]): Promise<AttendanceRecordDocument[]>;
  listLeaveCandidatesForMonth(outletId: string, monthStart: number, monthEnd: number): Promise<LeaveApplicationRecord[]>;
  listActiveHolidaysForYear(outletId: string, year: string): Promise<AttendanceHoliday[]>;
}
