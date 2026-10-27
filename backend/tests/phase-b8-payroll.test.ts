import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { calculatePayroll } from "../src/payroll-engine/calculators.js";
import type { SalaryStructure } from "../src/payroll-engine/types.js";
import { createPayrollService, payrollServiceInternals } from "../src/services/payroll.service.js";

// getRules and payrollServiceInternals are pure; empty deps are safe here
const payrollService = createPayrollService({ payroll: {} as never, attendance: {} as never });

test("B8 PostgreSQL payroll router is mounted; legacy payroll router removed", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.match(routes, /apiRouter\.use\("\/payroll", postgresPayrollRouter\)/);
  assert.doesNotMatch(routes, /apiRouter\.use\("\/payroll", payrollRouter\)/);
});

test("B8 migration defines payroll tables with RLS and permissions", async () => {
  const migration = await readFile(new URL("../migrations/0013_phase_b8_payroll.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE crm\.employee_salary_structures/);
  assert.match(migration, /CREATE TABLE crm\.payroll_runs/);
  assert.match(migration, /CREATE TABLE crm\.payroll_run_summaries/);
  assert.match(migration, /payroll\.read/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.doesNotMatch(migration, /backfill|\betl\b|firestore/i);
});

test("B8 golden payroll calculation matches engine output", () => {
  const salaryStructure: SalaryStructure = {
    salaryType: "MONTHLY",
    grossSalary: 35_000,
    isMetroCity: false,
    earnings: {
      basic: 17_500,
      hra: 7_000,
      da: 0,
      conveyance: 0,
      medical: 0,
      specialAllowance: 10_500,
      incentive: 0,
      overtime: 0,
      bonus: 0,
      arrears: 0,
      otherEarnings: 0,
    },
    deductions: { loan: 0, advance: 0, otherDeductions: 0 },
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
  const attendance = {
    employeeId: "emp-1",
    month: 6 as const,
    year: 2026,
    presentDays: 26,
    paidLeave: 0,
    weeklyOff: 4,
    paidHolidays: 0,
    absentDays: 0,
    unpaidLeave: 0,
    preJoiningDays: 0,
    postExitDays: 0,
    attendanceRecordCount: 22,
    pendingAttendanceDays: 0,
    monthDays: 30,
    otHours: 0,
    workedHours: 176,
    overtimeHours: 0,
    loanDeduction: 0,
    advanceDeduction: 0,
    otherDeduction: 0,
    incentive: 0,
    arrears: 0,
  };
  const result = calculatePayroll({
    employee: {
      id: "emp-1",
      userProfileId: "emp-1",
      name: "Test Employee",
      workLocationState: "Maharashtra",
    },
    salaryStructure,
    attendance,
    payrollMonth: 6,
    payrollYear: 2026,
    state: "Maharashtra",
    esiContributionPeriodCovered: false,
    tdsInput: { remainingMonths: 7 },
  });
  assert.equal(result.earnings.grossEarnings, 35_000);
  assert.equal(result.deductions.professionalTax, 200);
  assert.equal(result.netSalary, 32_975);
  assert.equal(
    payrollServiceInternals.normalizeSalaryStructure(salaryStructure).grossSalary,
    35_000,
  );
});

test("B8 postgres payroll modules do not import Firestore", async () => {
  const files = [
    "../src/modules/payroll/postgresPayroll.repository.ts",
    "../src/modules/payroll/postgresPayroll.service.ts",
    "../src/modules/payroll/postgresPayroll.adapters.ts",
  ];
  for (const file of files) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /firebase-admin|firestore|payroll\.repository/);
  }
});

test("B8 statutory rules remain available via shared payroll service", () => {
  const rules = payrollService.getRules({
    state: "Maharashtra",
    month: 6,
    grossSalary: 35_000,
  });
  assert.equal(rules.professionalTaxPreview?.amount, 200);
});
