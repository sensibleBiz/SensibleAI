import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import type { PayrollAttendancePort, PayrollStoragePort } from "../../services/payrollPorts.js";
import { PostgresAttendanceRepository } from "../attendance/postgresAttendance.repository.js";
import { PostgresPayrollRepository } from "./postgresPayroll.repository.js";

export const createPostgresPayrollStoragePort = (
  database: TransactionDatabase,
  tenantId: string,
  repository: PostgresPayrollRepository,
): PayrollStoragePort => ({
  getActivePayrollEmployee: (outletId, employeeId) =>
    repository.getActivePayrollEmployee(database, tenantId, outletId, employeeId),
  getSalaryStructure: (outletId, employeeId) =>
    repository.getSalaryStructure(database, tenantId, outletId, employeeId),
  listPayrollRuns: (outletId, employeeId, year) =>
    repository.listPayrollRuns(database, tenantId, outletId, employeeId, year),
  listSalaryStructures: (outletId) =>
    repository.listSalaryStructures(database, tenantId, outletId),
  listLatestPayrollSummaries: (outletId) =>
    repository.listLatestPayrollSummaries(database, tenantId, outletId),
  listActiveSalarySummaries: (outletId) =>
    repository.listActiveSalarySummaries(database, tenantId, outletId),
  saveSalaryStructure: async (outletId, employeeId, proposed) => {
    const businessId = await repository.resolveOutletBusiness(database, tenantId, outletId);
    if (!businessId) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    return repository.saveSalaryStructure(
      database, tenantId, businessId, outletId, employeeId, proposed,
    );
  },
  savePayrollRun: async (outletId, employeeId, payroll) => {
    const businessId = await repository.resolveOutletBusiness(database, tenantId, outletId);
    if (!businessId) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
    return repository.savePayrollRun(
      database, tenantId, businessId, outletId, employeeId, payroll,
    );
  },
});

export const createPostgresPayrollAttendancePort = (
  database: TransactionDatabase,
  tenantId: string,
  repository: PostgresAttendanceRepository = new PostgresAttendanceRepository(),
): PayrollAttendancePort => ({
  listAttendanceForDays: (outletId, dayIds) =>
    repository.listForDayIds(database, tenantId, outletId, dayIds),
  listLeaveCandidatesForMonth: (outletId, monthStart, monthEnd) =>
    repository.listApprovedLeavesForRange(database, tenantId, outletId, monthStart, monthEnd),
  listActiveHolidaysForYear: (outletId, year) =>
    repository.listHolidaysForYear(database, tenantId, outletId, year),
});
