import type {
  PayrollCalculationInput,
  PayrollCalculationResult,
  SalaryStructure,
} from "./types";
import { calculateGratuity, calculatePayroll } from "./calculators";
import { calculateStatutoryWage } from "./componentRules";
import { mergePayrollSettings, roundMoney, toAmount } from "./utils";

export interface FullAndFinalSettlementInput
  extends Omit<PayrollCalculationInput, "salaryStructure"> {
  salaryStructure: SalaryStructure;
  lastWorkingDate: string;
  noticePayRecovery?: number;
  noticePayPayment?: number;
  leaveEncashment?: number;
  incentive?: number;
  arrears?: number;
  pendingReimbursement?: number;
  loanRecovery?: number;
  salaryAdvanceRecovery?: number;
  assetRecovery?: number;
  severance?: number;
  retrenchmentCompensation?: number;
}

export interface FullAndFinalSettlementResult {
  monthlyPayroll: PayrollCalculationResult;
  salaryUntilLastWorkingDate: number;
  noticePayRecovery: number;
  noticePayPayment: number;
  leaveEncashment: number;
  gratuity: ReturnType<typeof calculateGratuity>;
  incentive: number;
  arrears: number;
  pendingReimbursement: number;
  loanRecovery: number;
  salaryAdvanceRecovery: number;
  assetRecovery: number;
  severance: number;
  retrenchmentCompensation: number;
  finalTDS: number;
  finalPayableAmount: number;
}

export const calculateFullAndFinalSettlement = ({
  lastWorkingDate,
  noticePayRecovery = 0,
  noticePayPayment = 0,
  leaveEncashment = 0,
  incentive = 0,
  arrears = 0,
  pendingReimbursement = 0,
  loanRecovery = 0,
  salaryAdvanceRecovery = 0,
  assetRecovery = 0,
  severance = 0,
  retrenchmentCompensation = 0,
  ...payrollInput
}: FullAndFinalSettlementInput): FullAndFinalSettlementResult => {
  const settings = mergePayrollSettings(payrollInput.settings);
  const monthlyPayroll = calculatePayroll({
    ...payrollInput,
    employee: {
      ...payrollInput.employee,
      dateOfExit: lastWorkingDate,
    },
  });
  const gratuityWage = calculateStatutoryWage({
    earnings: payrollInput.salaryStructure.earnings,
    rules: settings.salaryComponents,
    wageType: "gratuityWage",
  });
  const gratuity = calculateGratuity({
    basic: gratuityWage,
    da: 0,
    gratuityWage,
    dateOfJoining: payrollInput.employee.dateOfJoining,
    asOfDate: new Date(lastWorkingDate),
    override: payrollInput.employee.gratuityOverride,
    finalSettlement: true,
    rule: settings.gratuity,
  });
  const grossAdditions = roundMoney(
    toAmount(noticePayPayment) +
      toAmount(leaveEncashment) +
      toAmount(incentive) +
      toAmount(arrears) +
      toAmount(pendingReimbursement) +
      toAmount(severance) +
      toAmount(retrenchmentCompensation) +
      Number(gratuity.payableGratuity)
  );
  const recoveries = roundMoney(
    toAmount(noticePayRecovery) +
      toAmount(loanRecovery) +
      toAmount(salaryAdvanceRecovery) +
      toAmount(assetRecovery)
  );
  const finalTDS = monthlyPayroll.deductions.tds;

  return {
    monthlyPayroll,
    salaryUntilLastWorkingDate: monthlyPayroll.earnings.earnedFixedSalary,
    noticePayRecovery: roundMoney(noticePayRecovery),
    noticePayPayment: roundMoney(noticePayPayment),
    leaveEncashment: roundMoney(leaveEncashment),
    gratuity,
    incentive: roundMoney(incentive),
    arrears: roundMoney(arrears),
    pendingReimbursement: roundMoney(pendingReimbursement),
    loanRecovery: roundMoney(loanRecovery),
    salaryAdvanceRecovery: roundMoney(salaryAdvanceRecovery),
    assetRecovery: roundMoney(assetRecovery),
    severance: roundMoney(severance),
    retrenchmentCompensation: roundMoney(retrenchmentCompensation),
    finalTDS,
    finalPayableAmount: roundMoney(
      monthlyPayroll.netSalary + grossAdditions - recoveries
    ),
  };
};
