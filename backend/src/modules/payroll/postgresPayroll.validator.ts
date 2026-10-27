import { z } from "zod";
import {
  payrollEmployeeQuerySchema,
  payrollGenerateBodySchema,
  payrollOverviewQuerySchema,
  payrollPreviewBodySchema,
  payrollRulesQuerySchema,
  salaryStructureBodySchema,
} from "../../validators/payroll.validator.js";

const uuid = (label: string) => z.string().uuid(`${label} must be a UUID`);

export const postgresPayrollEmployeeQuerySchema = payrollEmployeeQuerySchema.extend({
  outletId: uuid("outletId"),
  employeeId: uuid("employeeId"),
}).strict();

export const postgresPayrollOverviewQuerySchema = payrollOverviewQuerySchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresPayrollRulesQuerySchema = payrollRulesQuerySchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresPayrollPreviewBodySchema = payrollPreviewBodySchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresSalaryStructureBodySchema = salaryStructureBodySchema.extend({
  outletId: uuid("outletId"),
}).strict();

export const postgresPayrollGenerateBodySchema = payrollGenerateBodySchema.extend({
  outletId: uuid("outletId"),
  employeeId: uuid("employeeId"),
}).strict();
