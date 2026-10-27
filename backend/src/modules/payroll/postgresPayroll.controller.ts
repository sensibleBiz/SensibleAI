import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import type {
  GeneratePayrollInput,
  PayrollEmployeeQuery,
  PayrollOverviewQuery,
  PayrollPreviewInput,
  PayrollRulesQuery,
  SaveSalaryStructureInput,
} from "../../types/payroll.types.js";
import { calculateLWF, calculateProfessionalTax } from "../../payroll-engine/calculators.js";
import { LWF_STATE_RULE_MASTER, PT_STATE_SLAB_MASTER } from "../../payroll-engine/rules/index.js";
import { resolvePayrollState } from "../../payroll-engine/utils.js";
import { postgresPayrollService } from "./postgresPayroll.service.js";

const context = (request: Request) => {
  if (!request.postgresAuth || !request.database) {
    throw new AppError(401, "PostgreSQL authentication is required", "AUTHENTICATION_REQUIRED");
  }
  return { auth: request.postgresAuth, database: request.database };
};

export const getPostgresPayrollEmployeeData = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const query = request.validated?.query as PayrollEmployeeQuery;
  const data = await postgresPayrollService.getEmployeeData(
    database,
    auth.tenantId,
    auth.userId,
    query.outletId,
    query.employeeId,
    query.year,
  );
  response.json({ success: true, data });
};

export const getPostgresPayrollOverview = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const query = request.validated?.query as PayrollOverviewQuery;
  const data = await postgresPayrollService.getOverview(
    database,
    auth.tenantId,
    auth.userId,
    query.outletId,
  );
  response.json({ success: true, data });
};

export const getPostgresPayrollRules = (request: Request, response: Response) => {
  context(request);
  const query = request.validated?.query as PayrollRulesQuery;
  response.setHeader("Cache-Control", "private, max-age=3600");
  const normalizedState = query.state ? resolvePayrollState(query.state) : undefined;
  const canPreview = normalizedState && query.month !== undefined && query.grossSalary !== undefined;
  response.json({ success: true, data: {
    professionalTax: PT_STATE_SLAB_MASTER,
    labourWelfareFund: LWF_STATE_RULE_MASTER,
    ...(canPreview ? {
      professionalTaxPreview: calculateProfessionalTax({ state: normalizedState, month: query.month!, grossSalary: query.grossSalary!, annualSalary: query.grossSalary! * 12, ...(query.gender ? { gender: query.gender } : {}) }),
      labourWelfareFundPreview: calculateLWF({ state: normalizedState, month: query.month!, grossSalary: query.grossSalary! }),
    } : {}),
  }});
};

export const previewPostgresPayroll = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const input = request.validated?.body as PayrollPreviewInput;
  const data = await postgresPayrollService.preview(database, auth.tenantId, auth.userId, input);
  response.json({ success: true, data });
};

export const savePostgresSalaryStructure = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const input = request.validated?.body as SaveSalaryStructureInput;
  const data = await postgresPayrollService.saveSalaryStructure(
    database,
    auth.tenantId,
    auth.userId,
    input,
  );
  response.json({ success: true, data });
};

export const generatePostgresPayroll = async (request: Request, response: Response) => {
  const { auth, database } = context(request);
  const input = request.validated?.body as GeneratePayrollInput;
  const data = await postgresPayrollService.generate(database, auth.tenantId, auth.userId, input);
  response.status(data.created ? 201 : 200).json({ success: true, data });
};
