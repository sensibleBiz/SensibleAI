import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { createPayrollService } from "../../services/payroll.service.js";
import type {
  GeneratePayrollInput,
  GeneratePayrollResponse,
  PayrollCalculationResponse,
  PayrollEmployeeDataResponse,
  PayrollOverviewRecord,
  PayrollPreviewInput,
  SaveSalaryStructureInput,
  SalaryStructureResponse,
} from "../../types/payroll.types.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import {
  createPostgresPayrollAttendancePort,
  createPostgresPayrollStoragePort,
} from "./postgresPayroll.adapters.js";
import { PostgresPayrollRepository, postgresPayrollRepository } from "./postgresPayroll.repository.js";

export class PostgresPayrollService {
  constructor(
    private readonly repository: PostgresPayrollRepository = postgresPayrollRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  private scopedPayroll(database: TransactionDatabase, tenantId: string) {
    return createPayrollService({
      payroll: createPostgresPayrollStoragePort(database, tenantId, this.repository),
      attendance: createPostgresPayrollAttendancePort(database, tenantId),
    });
  }

  private async requirePermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    permission: string,
  ) {
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  async getEmployeeData(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    employeeId: string,
    year?: number,
  ): Promise<PayrollEmployeeDataResponse> {
    await this.requirePermission(database, tenantId, userId, outletId, "payroll.read");
    return this.scopedPayroll(database, tenantId).getEmployeeData(outletId, employeeId, year);
  }

  async getOverview(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
  ): Promise<PayrollOverviewRecord[]> {
    await this.requirePermission(database, tenantId, userId, outletId, "payroll.read");
    return this.scopedPayroll(database, tenantId).getOverview(outletId);
  }

  async preview(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PayrollPreviewInput,
  ): Promise<PayrollCalculationResponse> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "payroll.read");
    return this.scopedPayroll(database, tenantId).preview(input);
  }

  async saveSalaryStructure(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: SaveSalaryStructureInput,
  ): Promise<SalaryStructureResponse> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "payroll.manage");
    return this.scopedPayroll(database, tenantId).saveSalaryStructure(input, userId);
  }

  async generate(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: GeneratePayrollInput,
  ): Promise<GeneratePayrollResponse> {
    await this.requirePermission(database, tenantId, userId, input.outletId, "payroll.manage");
    return this.scopedPayroll(database, tenantId).generate(input, userId);
  }

  async listActiveSalarySummaries(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "payroll.read");
    return this.repository.listActiveSalarySummaries(database, tenantId, outletId);
  }
}

export const postgresPayrollService = new PostgresPayrollService();
