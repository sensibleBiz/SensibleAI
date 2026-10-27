import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  EmployeeSalaryStructureDocument,
  SalaryStructure,
} from "../src/payroll-engine/types.js";
import {
  createPayrollService,
  payrollServiceInternals,
} from "../src/services/payroll.service.js";

// getRules is a pure statutory-rules lookup; empty deps are safe here
const payrollService = createPayrollService({ payroll: {} as never, attendance: {} as never });
import {
  payrollGenerateBodySchema,
  payrollPreviewBodySchema,
  salaryStructureBodySchema,
} from "../src/validators/payroll.validator.js";

const salaryStructure = (grossSalary: number): SalaryStructure => ({
  salaryType: "MONTHLY",
  grossSalary,
  earnings: {
    basic: grossSalary * 0.5,
    hra: grossSalary * 0.2,
    da: 0,
    conveyance: 0,
    medical: 0,
    specialAllowance: grossSalary * 0.3,
    incentive: 0,
    overtime: 0,
    bonus: 0,
    arrears: 0,
    otherEarnings: 0,
  },
});

const previewPayload = {
  outletId: "outlet-1",
  employee: {
    id: "EMP-1",
    userProfileId: "profile-1",
    name: "Payroll Employee",
    workLocationState: "Maharashtra",
  },
  salaryStructure: salaryStructure(35_000),
  month: 2,
  year: 2026,
};

test("payroll request validation accepts canonical input and rejects unsafe values", () => {
  assert.equal(payrollPreviewBodySchema.safeParse(previewPayload).success, true);
  assert.equal(
    salaryStructureBodySchema.safeParse({
      ...previewPayload,
      effectiveFrom: "2026-02-01",
    }).success,
    true,
  );
  assert.equal(
    payrollGenerateBodySchema.safeParse({
      outletId: "outlet-1",
      employeeId: "profile-1",
      month: 13,
      year: 2026,
    }).success,
    false,
  );
  assert.equal(
    payrollPreviewBodySchema.safeParse({
      ...previewPayload,
      salaryStructure: salaryStructure(-1),
    }).success,
    false,
  );
  assert.equal(
    payrollPreviewBodySchema.safeParse({
      ...previewPayload,
      unexpectedClientField: true,
    }).success,
    false,
  );
});

test("salary revisions are selected by payroll month on the backend", () => {
  const oldStructure = salaryStructure(30_000);
  const revisedStructure = salaryStructure(40_000);
  const document = {
    salaryRevisions: [
      {
        effectiveFrom: "2026-01-01",
        salaryStructure: oldStructure,
        updatedAt: 1,
        updatedBy: "admin",
      },
      {
        effectiveFrom: "2026-07-01",
        salaryStructure: revisedStructure,
        updatedAt: 2,
        updatedBy: "admin",
      },
    ],
  } as EmployeeSalaryStructureDocument;

  assert.equal(
    payrollServiceInternals.structureForMonth(document, 2026, 6).grossSalary,
    30_000,
  );
  assert.equal(
    payrollServiceInternals.structureForMonth(document, 2026, 7).grossSalary,
    40_000,
  );
});

test("PT and LWF previews use backend statutory rules", () => {
  const rules = payrollService.getRules({
    state: "Maharashtra",
    month: 6,
    grossSalary: 35_000,
  });
  assert.equal(rules.professionalTaxPreview?.amount, 200);
  assert.equal(rules.labourWelfareFundPreview?.employeeContribution, 25);
  assert.equal(rules.labourWelfareFundPreview?.employerContribution, 75);
  assert.ok(rules.professionalTax.length > 10);
  assert.ok(rules.labourWelfareFund.length > 5);
});

// resolvePayrollWriteAction and safeDocumentId removed from codebase (were in deleted Firestore
// payroll.repository.ts). Tests removed pending PostgreSQL-native replacements.
