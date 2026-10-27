export type PayrollFrequency =
  | "monthly"
  | "annual"
  | "half-yearly"
  | "quarterly"
  | "not-applicable";

export type PayrollRegime = "old" | "new";

export type PayrollGender = "FEMALE" | "MALE" | "OTHER" | "UNSPECIFIED";

export type OtBase = "BASIC_DA" | "GROSS";

export type SalaryType = "MONTHLY" | "DAILY" | "HOURLY";

export type MonthDayRule =
  | "ACTUAL_DAYS"
  | "DAYS_26"
  | "DAYS_30"
  | "WORKING_DAYS";

export type PayrollRunStatus =
  | "DRAFT"
  | "GENERATED"
  | "CALCULATED"
  | "VALIDATED"
  | "APPROVED"
  | "LOCKED"
  | "BANK_FILE_GENERATED"
  | "PAID"
  | "REVERSED"
  | "CORRECTION_RUN"
  | "CANCELLED";

export type PayrollMonth =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12;

export type SalaryComponentKey =
  | "basic"
  | "hra"
  | "da"
  | "conveyance"
  | "medical"
  | "specialAllowance"
  | "incentive"
  | "overtime"
  | "bonus"
  | "arrears"
  | "reimbursement"
  | "otherEarnings";

export type DeductionComponentKey =
  | "employeePF"
  | "employeeESI"
  | "professionalTax"
  | "employeeLWF"
  | "tds"
  | "loan"
  | "advance"
  | "lop"
  | "otherDeductions";

export interface SalaryEarnings {
  basic: number;
  hra: number;
  da: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  incentive: number;
  overtime: number;
  bonus: number;
  arrears: number;
  reimbursement?: number | undefined;
  otherEarnings: number;
}

export interface PayrollEarnings extends SalaryEarnings {
  scheduledGross: number;
  lopEligibleGross: number;
  lopDeduction: number;
  earnedFixedSalary: number;
  regularEarnings: number;
  oneTimeEarnings: number;
  earnedGross: number;
  grossEarnings: number;
}

export interface SalaryDeductionsInput {
  loan: number;
  advance: number;
  otherDeductions: number;
  tds?: number | undefined;
}

export interface PayrollDeductions extends Required<SalaryDeductionsInput> {
  lop: number;
  employeePF: number;
  employeeESI: number;
  professionalTax: number;
  employeeLWF: number;
  totalDeductions: number;
  totalEmployeeDeductions: number;
}

export interface EmployerContributions {
  employerPF: number;
  employerEPF: number;
  employerEPS: number;
  employerEDLI: number;
  epfAdministrativeCharges: number;
  employerESI: number;
  employerLWF: number;
  gratuityProvision: number;
  monthlyGratuityProvision: number;
  estimatedAccruedGratuity: number;
  bonusProvision: number;
  totalEmployerContribution: number;
  totalEmployerContributions: number;
}

export interface PayrollEmployee {
  id: string;
  userProfileId?: string | undefined;
  name: string;
  empCode?: string | undefined;
  designation?: string | undefined;
  department?: string | undefined;
  workLocationState?: string | undefined;
  dateOfJoining?: string | undefined;
  dateOfExit?: string | undefined;
  employeeRef?: string | undefined;
  pfApplicable?: boolean | undefined;
  pfExcludedEmployee?: boolean | undefined;
  existingPfMember?: boolean | undefined;
  pfHigherWageOption?: boolean | undefined;
  employeePfCeiling?: number | undefined;
  vpfRate?: number | undefined;
  epsEligible?: boolean | undefined;
  internationalWorker?: boolean | undefined;
  esiApplicable?: boolean | undefined;
  esiRegistrationDate?: number | undefined;
  gratuityOverride?: boolean | undefined;
  stateMinimumWage?: number | undefined;
  /** Used for state-specific statutory rules, such as Maharashtra PT. */
  gender?: PayrollGender | undefined;
}

export interface PayrollApplicabilityOptions {
  pfApplicable: boolean;
  pfCeilingApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
  lwfApplicable: boolean;
  bonusApplicable: boolean;
  gratuityApplicable: boolean;
  tdsApplicable: boolean;
  otApplicable: boolean;
}

export interface SalaryAttendanceSettings {
  monthDayRule: MonthDayRule;
  weeklyOffPaid: boolean;
  paidHolidayIncluded: boolean;
  leavePolicyId?: string | undefined;
}

export interface SalaryStructure {
  salaryType?: SalaryType | undefined;
  grossSalary?: number | undefined;
  /** When true, HRA is 50% of Basic; otherwise 40% (non-metro). */
  isMetroCity?: boolean | undefined;
  ctc?: number | undefined;
  dailyRate?: number | undefined;
  hourlyRate?: number | undefined;
  overtimeMultiplier?: number | undefined;
  earnings: SalaryEarnings;
  deductions?: Partial<SalaryDeductionsInput> | undefined;
  payrollOptions?: Partial<PayrollApplicabilityOptions> | undefined;
  attendanceSettings?: Partial<SalaryAttendanceSettings> | undefined;
}

export interface SalaryStructureRevision {
  revisionId?: string | undefined;
  employeeId?: string | undefined;
  effectiveFrom: string;
  effectiveTo?: string | undefined;
  salaryStructure: SalaryStructure;
  components?: Record<string, number> | undefined;
  reason?: string | undefined;
  approvedBy?: string | undefined;
  approvedAt?: number | undefined;
  previousRevisionId?: string | undefined;
  updatedAt: number;
  updatedBy: string;
}

export interface AttendancePayrollInput {
  employeeId?: string | undefined;
  month?: PayrollMonth | undefined;
  year?: number | undefined;
  presentDays: number;
  paidLeave: number;
  weeklyOff: number;
  paidHolidays: number;
  absentDays: number;
  unpaidLeave: number;
  /** Days before the employee's joining date in their first payroll month. */
  preJoiningDays?: number | undefined;
  /** Days after the employee's exit date in their final payroll month. */
  postExitDays?: number | undefined;
  /** Number of saved attendance records used to calculate this payroll month. */
  attendanceRecordCount?: number | undefined;
  /** Days in an in-progress payroll month that are not yet ready for attendance. */
  pendingAttendanceDays?: number | undefined;
  monthDays: number;
  otHours: number;
  workedHours?: number | undefined;
  overtimeHours?: number | undefined;
  approvedOvertimeAmount?: number | undefined;
  manualOvertimeAdjustment?: number | undefined;
  loanDeduction?: number | undefined;
  advanceDeduction?: number | undefined;
  otherDeduction?: number | undefined;
  incentive?: number | undefined;
  fixedIncentive?: number | undefined;
  attendanceIncentive?: number | undefined;
  performanceIncentive?: number | undefined;
  salesIncentive?: number | undefined;
  manualIncentiveAdjustment?: number | undefined;
  arrears?: number | undefined;
}

export interface PFRule {
  ruleId: string;
  version: string;
  effectiveFrom: number;
  effectiveTo?: number | undefined;
  notificationReference?: string | undefined;
  pfApplicable: boolean;
  pfCeilingApplicable: boolean;
  pfCeilingAmount: number;
  employeePfRate: number;
  employerPfRate: number;
  epsRate: number;
  edliRate: number;
  edliWageCeiling: number;
  epfAdministrativeChargeRate: number;
}

export interface ESIRule {
  ruleId: string;
  version: string;
  effectiveFrom: number;
  effectiveTo?: number | undefined;
  notificationReference?: string | undefined;
  esiApplicable: boolean;
  esiWageLimit: number;
  employeeEsiRate: number;
  employerEsiRate: number;
}

export interface BonusRule {
  ruleId: string;
  version: string;
  effectiveFrom: number;
  effectiveTo?: number | undefined;
  notificationReference?: string | undefined;
  bonusApplicable: boolean;
  eligibilityWageLimit: number;
  bonusEligibilityWageLimit: number;
  statutoryWageCeiling: number;
  statutoryCalculationCeiling: number;
  applicableMinimumWage?: number | undefined;
  minimumBonusRate: number;
  maximumBonusRate: number;
  bonusRate: number;
  daysInAccountingYear: number;
}

export interface GratuityRule {
  ruleId: string;
  version: string;
  effectiveFrom: number;
  effectiveTo?: number | undefined;
  notificationReference?: string | undefined;
  gratuityApplicable: boolean;
  eligibleAfterYears: number;
  payableDays: number;
  serviceMonthRoundUpAfter: number;
  daysInMonthForFormula: number;
  taxExemptionLimit: number;
}

export interface OTRule {
  otApplicable: boolean;
  otMultiplier: number;
  otBase: OtBase;
  workingDays: number;
  workingHoursPerDay: number;
}

export interface LeaveLOPRule {
  lopApplicable: boolean;
  includeWeeklyOffInPayableDays: boolean;
  includePaidHolidaysInPayableDays: boolean;
}

export interface SalaryComponentRule {
  ruleId?: string | undefined;
  key: SalaryComponentKey;
  displayName?: string | undefined;
  label: string;
  earningType: "FIXED" | "VARIABLE" | "REIMBURSEMENT" | "STATUTORY" | "ADJUSTMENT";
  taxable: boolean;
  pfWage: boolean;
  esiContributionWage: boolean;
  esiCoverageWage: boolean;
  bonusWage: boolean;
  gratuityWage: boolean;
  /** @deprecated Use esiContributionWage and esiCoverageWage separately. */
  esiWage?: boolean | undefined;
  grossEarning: boolean;
  lopApplicable: boolean;
  overtimeApplicable: boolean;
  includeInGross?: boolean | undefined;
  includeInCTC?: boolean | undefined;
  defaultPercentOfBasic?: number | undefined;
  effectiveFrom?: number | undefined;
  effectiveTo?: number | undefined;
  version?: string | undefined;
}

export interface TdsTaxSlab {
  upto: number | null;
  rate: number;
}

export interface TDSRebateRule {
  taxableIncomeLimit: number;
  maximumRebate: number;
}

export interface TDSSurchargeSlab {
  threshold: number;
  rate: number;
}

export interface TDSRule {
  ruleId: string;
  version: string;
  effectiveFrom: number;
  effectiveTo?: number | undefined;
  notificationReference?: string | undefined;
  tdsApplicable: boolean;
  /** @deprecated Use standardDeductionByRegime for statutory calculations. */
  standardDeduction?: number | undefined;
  standardDeductionByRegime: Record<PayrollRegime, number>;
  defaultRegime: PayrollRegime;
  taxSlabsByRegime: Record<PayrollRegime, TdsTaxSlab[]>;
  rebateByRegime: Record<PayrollRegime, TDSRebateRule>;
  surchargeSlabsByRegime: Record<PayrollRegime, TDSSurchargeSlab[]>;
  cessRate: number;
}

export interface EmployeeTaxProfile {
  financialYear: string;
  taxRegime: "OLD" | "NEW";
  dateOfBirth?: number | undefined;
  residentStatus?: "RESIDENT" | "NON_RESIDENT" | undefined;
  previousEmployerIncome: number;
  previousEmployerTDS: number;
  taxablePerquisites: number;
  otherIncome: number;
  housePropertyIncome: number;
  yearToDateTaxableSalary: number;
  yearToDateTDS: number;
  projectedBonus: number;
  projectedVariableIncome: number;
}

export interface TaxDeclarationItem {
  sectionCode: string;
  declaredAmount: number;
  proofSubmittedAmount: number;
  approvedAmount: number;
  statutoryLimit: number;
  status: "DECLARED" | "PROOF_SUBMITTED" | "APPROVED" | "REJECTED";
}

export interface TDSProjectionInput {
  financialYear: string;
  payrollMonth: PayrollMonth;
  payrollYear: number;
  currentMonthTaxableSalary: number;
  projectedRemainingFixedSalary: number;
  projectedVariableSalary?: number | undefined;
  expectedBonus?: number | undefined;
  arrears?: number | undefined;
  taxablePerquisites?: number | undefined;
  previousEmployerIncome?: number | undefined;
  otherDeclaredIncome?: number | undefined;
  housePropertyIncome?: number | undefined;
  exemptions?: number | undefined;
  approvedDeductions?: number | undefined;
  standardDeduction?: number | undefined;
  employeeTaxProfile?: EmployeeTaxProfile | undefined;
  taxDeclarationItems?: TaxDeclarationItem[] | undefined;
  proofCutoffMonth?: PayrollMonth | undefined;
}

export interface TDSProjectionResult {
  financialYear: string;
  annualGrossIncome: number;
  annualTaxableSalary: number;
  declarationDeduction: number;
  previousEmployerTDS: number;
  yearToDateTDS: number;
  remainingTDS: number;
  remainingPayrollMonths: number;
  warnings: string[];
}

export interface PayrollSettings {
  pf: PFRule;
  esi: ESIRule;
  bonus: BonusRule;
  gratuity: GratuityRule;
  ot: OTRule;
  leave: LeaveLOPRule;
  salaryComponents: SalaryComponentRule[];
  tds: TDSRule;
}

export interface PTSlab {
  min: number;
  max: number | null;
  amount: number;
}

export interface PTRule {
  state: string;
  stateCode: string;
  hasPT: boolean;
  frequency: PayrollFrequency;
  salaryBasis: "monthly" | "annual" | "half-yearly";
  slabs: PTSlab[];
  slabsByGender?: Partial<Record<PayrollGender, PTSlab[]>> | undefined;
  maxYearlyAmount?: number | undefined;
  payableMonths?: PayrollMonth[] | undefined;
  specialMonthAmounts?: Partial<Record<PayrollMonth, number>> | undefined;
  exemptionNote?: string | undefined;
  ruleApplied: string;
}

export interface LWFRule {
  state: string;
  stateCode: string;
  hasLWF: boolean;
  frequency: PayrollFrequency;
  employeeShare: number;
  employerShare: number;
  payableMonths?: PayrollMonth[] | undefined;
  salaryMin?: number | undefined;
  salaryMax?: number | undefined;
  ruleApplied: string;
}

export interface ProfessionalTaxInput {
  state: string;
  grossSalary: number;
  month: PayrollMonth;
  annualSalary?: number | undefined;
  gender?: PayrollGender | undefined;
}

export interface ProfessionalTaxResult {
  amount: number;
  state: string;
  ruleApplied: string;
  frequency: PayrollFrequency;
  gender?: PayrollGender | undefined;
}

export interface LWFInput {
  state: string;
  month: PayrollMonth;
  grossSalary: number;
}

export interface LWFResult {
  employeeContribution: number;
  employerContribution: number;
  totalContribution: number;
  frequency: PayrollFrequency;
  ruleApplied: string;
}

export interface TDSInput {
  annualGross: number;
  deductions: number;
  regime: PayrollRegime;
  professionalTax: number;
  alreadyDeductedTDS: number;
  remainingMonths: number;
  declarationAmount?: number | undefined;
  proofVerifiedAmount?: number | undefined;
  taxDeclarationItems?: TaxDeclarationItem[] | undefined;
  standardDeduction?: number | undefined;
  taxSlabs?: TdsTaxSlab[] | undefined;
  rebateRule?: TDSRebateRule | undefined;
  surchargeSlabs?: TDSSurchargeSlab[] | undefined;
  rebateEligible?: boolean | undefined;
  cessRate?: number | undefined;
}

export interface TDSResult {
  monthlyTDS: number;
  annualTaxableIncome: number;
  annualTax: number;
  balanceTax: number;
  baseTax: number;
  rebate87A: number;
  surcharge: number;
  marginalRelief: number;
  cess: number;
  regime: PayrollRegime;
  ruleApplied: string;
}

export interface PayrollCalculationInput {
  employee: PayrollEmployee;
  salaryStructure: SalaryStructure;
  attendance: AttendancePayrollInput;
  payrollMonth: PayrollMonth;
  payrollYear: number;
  state: string;
  /** True when this employee was ESI-covered earlier in the same contribution period. */
  esiContributionPeriodCovered?: boolean | undefined;
  esiCoveragePeriod?: EsiCoveragePeriod | undefined;
  settings?: Partial<PayrollSettings> | undefined;
  tdsInput?: Partial<Omit<TDSInput, "annualGross" | "professionalTax">> | undefined;
  taxProfile?: EmployeeTaxProfile | undefined;
  taxDeclarationItems?: TaxDeclarationItem[] | undefined;
}

export interface PfCalculationResult {
  applicable: boolean;
  statutoryWage: number;
  pfWage: number;
  cappedPfWage: number;
  employeePF: number;
  voluntaryPF: number;
  employerPF: number;
  employerEPF: number;
  employerEPS: number;
  employerEDLI: number;
  administrativeCharges: number;
  eps: number;
  edli: number;
  totalEmployeeContribution: number;
  totalEmployerContribution: number;
  ruleApplied: string;
  ruleId: string;
  ruleVersion: string;
  warnings: string[];
}

export interface EsiCoveragePeriod {
  periodKey: string;
  startDate: number;
  endDate: number;
  covered: boolean;
  entryEligibilityWage: number;
  reason: string;
}

export interface EsiCalculationResult {
  applicable: boolean;
  continuedDueToContributionPeriod: boolean;
  eligibilityWage: number;
  contributionWage: number;
  esiGross: number;
  coverageWage: number;
  employeeESI: number;
  employerESI: number;
  contributionPeriodKey: string;
  contributionPeriod: string;
  coveragePeriod?: EsiCoveragePeriod | undefined;
  ruleApplied: string;
  ruleId: string;
  ruleVersion: string;
  warnings: string[];
}

export interface PayrollRuleBreakup {
  pf: PfCalculationResult;
  esi: EsiCalculationResult;
  professionalTax: ProfessionalTaxResult;
  lwf: LWFResult;
  bonus: Record<string, number | string | boolean>;
  gratuity: Record<string, number | string | boolean>;
  overtime: Record<string, number | string | boolean>;
  incentives: Record<string, number | string | boolean>;
  lop: Record<string, number | string | boolean>;
  tds: TDSResult;
}

export interface PayrollCalculationAttendanceResult {
  monthDays: number;
  calendarDays: number;
  scheduledWorkingDays: number;
  paidWeeklyOffDays: number;
  paidHolidayDays: number;
  workedDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  accountedDays: number;
  payableDays: number;
  lopDays: number;
  workedHours?: number | undefined;
  overtimeHours?: number | undefined;
}

export interface PayrollCalculationTotals {
  netSalary: number;
  standardMonthlyCTC: number;
  actualPayrollCost: number;
}

export interface PayrollCalculationResult {
  employee: PayrollEmployee;
  salaryType: SalaryType;
  state: string;
  month: PayrollMonth;
  year: number;
  attendance: PayrollCalculationAttendanceResult;
  earnings: PayrollEarnings;
  deductions: PayrollDeductions;
  employeeDeductions: PayrollDeductions;
  employerContributions: EmployerContributions;
  totals: PayrollCalculationTotals;
  netSalary: number;
  ctc: number;
  standardMonthlyCTC: number;
  actualPayrollCost: number;
  payableDays: number;
  lopDays: number;
  perDaySalary: number;
  validationErrors: string[];
  warnings: string[];
  ruleBreakup: PayrollRuleBreakup;
  statutoryRuleVersions: Record<string, string>;
}

export type StatutoryRuleType =
  | "TDS"
  | "PF"
  | "ESI"
  | "BONUS"
  | "GRATUITY"
  | "PT"
  | "LWF"
  | "MINIMUM_WAGE";

export interface StatutoryRuleMetadata {
  ruleId: string;
  ruleType: StatutoryRuleType;
  financialYear?: string | undefined;
  stateCode?: string | undefined;
  effectiveFrom: number;
  effectiveTo?: number | undefined;
  version: string;
  notificationReference?: string | undefined;
  createdAt: number;
  createdBy: string;
  approvedAt?: number | undefined;
  approvedBy?: string | undefined;
}

export interface MinimumWageRule extends StatutoryRuleMetadata {
  ruleType: "MINIMUM_WAGE";
  stateCode: string;
  scheduledEmployment: string;
  industry?: string | undefined;
  skillCategory: string;
  zone?: string | undefined;
  monthlyMinimumWage: number;
}

export interface PayrollAuditRecord {
  auditId: string;
  action:
    | "GENERATED"
    | "RECALCULATED"
    | "VALIDATED"
    | "APPROVED"
    | "LOCKED"
    | "BANK_FILE_GENERATED"
    | "PAID"
    | "REVERSED";
  payrollRunId: string;
  employeeId?: string | undefined;
  performedBy: string;
  performedAt: number;
  previousStatus?: string | undefined;
  newStatus?: string | undefined;
  reason?: string | undefined;
  calculationHash?: string | undefined;
}

export interface EmployeeStatutoryProfile {
  employeeId: string;
  panEncrypted?: string | undefined;
  panMasked?: string | undefined;
  uanEncrypted?: string | undefined;
  uanMasked?: string | undefined;
  pfMemberId?: string | undefined;
  esicNumberEncrypted?: string | undefined;
  esicNumberMasked?: string | undefined;
  pfApplicable: boolean;
  pfExcludedEmployee: boolean;
  existingPfMember: boolean;
  pfHigherWageOption: boolean;
  vpfRate?: number | undefined;
  epsEligible: boolean;
  esiApplicable: boolean;
  esiRegistrationDate?: number | undefined;
  taxRegime: "OLD" | "NEW";
  residentStatus: "RESIDENT" | "NON_RESIDENT";
  dateOfBirth?: number | undefined;
  gender?: string | undefined;
  bankAccountEncrypted?: string | undefined;
  bankAccountMasked?: string | undefined;
  bankIfsc?: string | undefined;
}

export interface PayslipDocument extends PayrollCalculationResult {
  employeeId: string;
  employeeName: string;
  attendanceSummary: AttendancePayrollInput;
  createdAt: number;
  createdBy: string;
  status: PayrollRunStatus;
}

export interface EmployeeSalaryStructureDocument {
  userId: string;
  userName?: string | undefined;
  employeeId: string;
  userProfileId?: string | undefined;
  employeeRef?: string | undefined;
  employeeName: string;
  empCode?: string | undefined;
  department?: string | undefined;
  designation?: string | undefined;
  workLocationState?: string | undefined;
  gender?: PayrollGender | undefined;
  joiningDate?: string | undefined;
  salaryType: SalaryType;
  grossSalary: number;
  monthlySalary: number;
  isMetroCity?: boolean | undefined;
  ctc: number;
  basic: number;
  hra: number;
  da: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  otherAllowance: number;
  incentive: number;
  pfApplicable: boolean;
  pfCeilingApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
  lwfApplicable: boolean;
  bonusApplicable: boolean;
  gratuityApplicable: boolean;
  tdsApplicable: boolean;
  otApplicable: boolean;
  monthDayRule: MonthDayRule;
  weeklyOffPaid: boolean;
  paidHolidayIncluded: boolean;
  leavePolicyId?: string | undefined;
  salaryRevisions?: SalaryStructureRevision[] | undefined;
  preview?: PayrollCalculationResult | undefined;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  status: "ACTIVE" | "INACTIVE";
  isActive: boolean;
}

export interface PayrollRunDocument {
  runId?: string | undefined;
  payrollKey?: string | undefined;
  month: PayrollMonth;
  year: number;
  financialYear?: string | undefined;
  salaryType?: SalaryType | undefined;
  employeeId: string;
  userProfileId?: string | undefined;
  employeeRef?: string | undefined;
  employeeName: string;
  employeeGender?: PayrollGender | undefined;
  state: string;
  attendanceSummary: AttendancePayrollInput;
  earnings: PayrollEarnings;
  deductions: PayrollDeductions;
  employerContributions: EmployerContributions;
  grossSalary: number;
  netSalary: number;
  ctc: number;
  standardMonthlyCTC?: number | undefined;
  actualPayrollCost?: number | undefined;
  payableDays?: number | undefined;
  lopDays?: number | undefined;
  perDaySalary?: number | undefined;
  ruleBreakup: PayrollRuleBreakup;
  statutoryRuleVersions?: Record<string, string> | undefined;
  status: PayrollRunStatus;
  idempotencyKey?: string | undefined;
  sourcePayrollRunId?: string | undefined;
  calculationHash?: string | undefined;
  createdAt: number;
  createdBy: string;
  approvedBy?: string | undefined;
  approvedAt?: number | undefined;
  lockedBy?: string | undefined;
  lockedAt?: number | undefined;
  paidBy?: string | undefined;
  paidAt?: number | undefined;
}
