import { z } from "zod";

const identifier = z.string().trim().min(1).max(1_500).regex(/^[^/]+$/, "Invalid identifier");
const outletId = z.string().trim().min(1, "outletId is required").max(1_500);
const money = z.number().finite().min(0).max(1_000_000_000);
const payrollMonth = z.number().int().min(1).max(12);
const payrollYear = z.number().int().min(2000).max(2100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format");

const employeeSchema = z
  .object({
    id: identifier,
    userProfileId: identifier.optional(),
    name: z.string().trim().min(1).max(250),
    empCode: z.string().trim().max(100).optional(),
    designation: z.string().trim().max(250).optional(),
    department: z.string().trim().max(250).optional(),
    workLocationState: z.string().trim().max(100).optional(),
    dateOfJoining: isoDate.optional(),
    dateOfExit: isoDate.optional(),
    employeeRef: identifier.optional(),
    pfApplicable: z.boolean().optional(),
    pfExcludedEmployee: z.boolean().optional(),
    existingPfMember: z.boolean().optional(),
    pfHigherWageOption: z.boolean().optional(),
    employeePfCeiling: money.optional(),
    vpfRate: z.number().finite().min(0).max(100).optional(),
    epsEligible: z.boolean().optional(),
    internationalWorker: z.boolean().optional(),
    esiApplicable: z.boolean().optional(),
    esiRegistrationDate: z.number().int().nonnegative().optional(),
    gratuityOverride: z.boolean().optional(),
    stateMinimumWage: money.optional(),
    gender: z.enum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"]).optional(),
  })
  .strict();

const earningsSchema = z
  .object({
    basic: money,
    hra: money,
    da: money,
    conveyance: money,
    medical: money,
    specialAllowance: money,
    incentive: money,
    overtime: money,
    bonus: money,
    arrears: money,
    reimbursement: money.optional(),
    otherEarnings: money,
  })
  .strict();

const salaryStructureSchema = z
  .object({
    salaryType: z.enum(["MONTHLY", "DAILY", "HOURLY"]).optional(),
    grossSalary: money.optional(),
    isMetroCity: z.boolean().optional(),
    ctc: money.optional(),
    dailyRate: money.optional(),
    hourlyRate: money.optional(),
    overtimeMultiplier: z.number().finite().min(0).max(10).optional(),
    earnings: earningsSchema,
    deductions: z
      .object({
        loan: money.optional(),
        advance: money.optional(),
        otherDeductions: money.optional(),
        tds: money.optional(),
      })
      .strict()
      .optional(),
    payrollOptions: z
      .object({
        pfApplicable: z.boolean().optional(),
        pfCeilingApplicable: z.boolean().optional(),
        esiApplicable: z.boolean().optional(),
        ptApplicable: z.boolean().optional(),
        lwfApplicable: z.boolean().optional(),
        bonusApplicable: z.boolean().optional(),
        gratuityApplicable: z.boolean().optional(),
        tdsApplicable: z.boolean().optional(),
        otApplicable: z.boolean().optional(),
      })
      .strict()
      .optional(),
    attendanceSettings: z
      .object({
        monthDayRule: z.enum(["ACTUAL_DAYS", "DAYS_26", "DAYS_30", "WORKING_DAYS"]).optional(),
        weeklyOffPaid: z.boolean().optional(),
        paidHolidayIncluded: z.boolean().optional(),
        leavePolicyId: z.string().trim().max(1_500).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const adjustmentsSchema = z
  .object({
    loanDeduction: money.optional(),
    advanceDeduction: money.optional(),
    otherDeduction: money.optional(),
    incentive: money.optional(),
    arrears: money.optional(),
  })
  .strict()
  .optional();

export const payrollEmployeeQuerySchema = z
  .object({
    outletId,
    employeeId: identifier,
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .strict();

export const payrollOverviewQuerySchema = z.object({ outletId }).strict();

export const payrollRulesQuerySchema = z
  .object({
    outletId,
    state: z.string().trim().max(100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    grossSalary: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
    gender: z.enum(["FEMALE", "MALE", "OTHER", "UNSPECIFIED"]).optional(),
  })
  .strict();

export const payrollPreviewBodySchema = z
  .object({
    outletId,
    employee: employeeSchema,
    salaryStructure: salaryStructureSchema.optional(),
    month: payrollMonth,
    year: payrollYear,
    adjustments: adjustmentsSchema,
  })
  .strict();

export const salaryStructureBodySchema = payrollPreviewBodySchema.extend({
  salaryStructure: salaryStructureSchema,
  effectiveFrom: isoDate,
});

export const payrollGenerateBodySchema = z
  .object({
    outletId,
    employeeId: identifier,
    month: payrollMonth,
    year: payrollYear,
    adjustments: adjustmentsSchema,
  })
  .strict();
