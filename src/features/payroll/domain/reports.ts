import type { PayrollRunDocument } from "./types";
import { roundMoney } from "./utils";

export interface BankExportColumn {
  header: string;
  value: (payroll: PayrollRunDocument) => string | number;
}

export interface BankExportFormat {
  formatId: string;
  delimiter: "," | "|" | "\t";
  columns: BankExportColumn[];
}

export const DEFAULT_BANK_EXPORT_FORMAT: BankExportFormat = {
  formatId: "generic-bank-transfer-v1",
  delimiter: ",",
  columns: [
    { header: "Employee ID", value: (payroll) => payroll.employeeId },
    { header: "Employee Name", value: (payroll) => payroll.employeeName },
    { header: "Net Pay", value: (payroll) => payroll.netSalary },
    { header: "Payroll Key", value: (payroll) => payroll.payrollKey || "" },
  ],
};

export const buildPayrollRegister = (payrolls: PayrollRunDocument[]) =>
  payrolls.map((payroll) => ({
    payrollKey: payroll.payrollKey,
    employeeId: payroll.employeeId,
    employeeName: payroll.employeeName,
    month: payroll.month,
    year: payroll.year,
    scheduledGross: payroll.earnings.scheduledGross,
    earnedGross: payroll.earnings.earnedGross,
    totalDeductions: payroll.deductions.totalEmployeeDeductions,
    netPay: payroll.netSalary,
    employerCost: payroll.actualPayrollCost,
    status: payroll.status,
  }));

export const buildStatutoryReconciliation = (payrolls: PayrollRunDocument[]) =>
  payrolls.reduce(
    (summary, payroll) => ({
      employeePF: roundMoney(summary.employeePF + payroll.deductions.employeePF),
      employerEPF: roundMoney(
        summary.employerEPF + payroll.employerContributions.employerEPF
      ),
      employerEPS: roundMoney(
        summary.employerEPS + payroll.employerContributions.employerEPS
      ),
      employerEDLI: roundMoney(
        summary.employerEDLI + payroll.employerContributions.employerEDLI
      ),
      employeeESI: roundMoney(summary.employeeESI + payroll.deductions.employeeESI),
      employerESI: roundMoney(
        summary.employerESI + payroll.employerContributions.employerESI
      ),
      professionalTax: roundMoney(
        summary.professionalTax + payroll.deductions.professionalTax
      ),
      labourWelfareFund: roundMoney(
        summary.labourWelfareFund + payroll.deductions.employeeLWF
      ),
      tds: roundMoney(summary.tds + payroll.deductions.tds),
    }),
    {
      employeePF: 0,
      employerEPF: 0,
      employerEPS: 0,
      employerEDLI: 0,
      employeeESI: 0,
      employerESI: 0,
      professionalTax: 0,
      labourWelfareFund: 0,
      tds: 0,
    }
  );

export const formatBankTransferExport = (
  payrolls: PayrollRunDocument[],
  format: BankExportFormat = DEFAULT_BANK_EXPORT_FORMAT
) => {
  const header = format.columns.map((column) => column.header).join(format.delimiter);
  const rows = payrolls.map((payroll) =>
    format.columns
      .map((column) => String(column.value(payroll)).replaceAll(format.delimiter, " "))
      .join(format.delimiter)
  );

  return [header, ...rows].join("\n");
};

