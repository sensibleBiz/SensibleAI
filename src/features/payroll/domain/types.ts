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
  reimbursement?: number;
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
  tds?: number;
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
  userProfileId?: string;
  name: string;
  empCode?: string;
  designation?: string;
  department?: string;
  workLocationState?: string;
  dateOfJoining?: string;
  dateOfExit?: string;
  employeeRef?: string;
  pfApplicable?: boolean;
  pfExcludedEmployee?: boolean;
  existingPfMember?: boolean;
  pfHigherWageOption?: boolean;
  employeePfCeiling?: number;
  vpfRate?: number;
  epsEligible?: boolean;
  internationalWorker?: boolean;
  esiApplicable?: boolean;
  esiRegistrationDate?: number;
  gratuityOverride?: boolean;
  stateMinimumWage?: number;
  /** Used for state-specific statutory rules, such as Maharashtra PT. */
  gender?: PayrollGender;
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
  leavePolicyId?: string;
}

export interface SalaryStructure {
  salaryType?: SalaryType;
  grossSalary?: number;
  /** When true, HRA is 50% of Basic; otherwise 40% (non-metro). */
  isMetroCity?: boolean;
  ctc?: number;
  dailyRate?: number;
  hourlyRate?: number;
  overtimeMultiplier?: number;
  earnings: SalaryEarnings;
  deductions?: Partial<SalaryDeductionsInput>;
  payrollOptions?: Partial<PayrollApplicabilityOptions>;
  attendanceSettings?: Partial<SalaryAttendanceSettings>;
}

export interface SalaryStructureRevision {
  revisionId?: string;
  employeeId?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  salaryStructure: SalaryStructure;
  components?: Record<string, number>;
  reason?: string;
  approvedBy?: string;
  approvedAt?: number;
  previousRevisionId?: string;
  updatedAt: number;
  updatedBy: string;
}

export interface AttendancePayrollInput {
  employeeId?: string;
  month?: PayrollMonth;
  year?: number;
  presentDays: number;
  paidLeave: number;
  weeklyOff: number;
  paidHolidays: number;
  absentDays: number;
  unpaidLeave: number;
  /** Days before the employee's joining date in their first payroll month. */
  preJoiningDays?: number;
  /** Days after the employee's exit date in their final payroll month. */
  postExitDays?: number;
  /** Number of saved attendance records used to calculate this payroll month. */
  attendanceRecordCount?: number;
  /** Days in an in-progress payroll month that are not yet ready for attendance. */
  pendingAttendanceDays?: number;
  monthDays: number;
  otHours: number;
  workedHours?: number;
  overtimeHours?: number;
  approvedOvertimeAmount?: number;
  manualOvertimeAdjustment?: number;
  loanDeduction?: number;
  advanceDeduction?: number;
  otherDeduction?: number;
  incentive?: number;
  fixedIncentive?: number;
  attendanceIncentive?: number;
  performanceIncentive?: number;
  salesIncentive?: number;
  manualIncentiveAdjustment?: number;
  arrears?: number;
}

export interface PFRule {
  ruleId: string;
  version: string;
  effectiveFrom: number;
  effectiveTo?: number;
  notificationReference?: string;
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
  effectiveTo?: number;
  notificationReference?: string;
  esiApplicable: boolean;
  esiWageLimit: number;
  employeeEsiRate: number;
  employerEsiRate: number;
}

export interface BonusRule {
  ruleId: string;
  version: string;
  effectiveFrom: number;
  effectiveTo?: number;
  notificationReference?: string;
  bonusApplicable: boolean;
  eligibilityWageLimit: number;
  bonusEligibilityWageLimit: number;
  statutoryWageCeiling: number;
  statutoryCalculationCeiling: number;
  applicableMinimumWage?: number;
  minimumBonusRate: number;
  maximumBonusRate: number;
  bonusRate: number;
  daysInAccountingYear: number;
}

export interface GratuityRule {
  ruleId: string;
  version: string;
  effectiveFrom: number;
  effectiveTo?: number;
  notificationReference?: string;
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
  ruleId?: string;
  key: SalaryComponentKey;
  displayName?: string;
  label: string;
  earningType: "FIXED" | "VARIABLE" | "REIMBURSEMENT" | "STATUTORY" | "ADJUSTMENT";
  taxable: boolean;
  pfWage: boolean;
  esiContributionWage: boolean;
  esiCoverageWage: boolean;
  bonusWage: boolean;
  gratuityWage: boolean;
  /** @deprecated Use esiContributionWage and esiCoverageWage separately. */
  esiWage?: boolean;
  grossEarning: boolean;
  lopApplicable: boolean;
  overtimeApplicable: boolean;
  includeInGross?: boolean;
  includeInCTC?: boolean;
  defaultPercentOfBasic?: number;
  effectiveFrom?: number;
  effectiveTo?: number;
  version?: string;
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
  effectiveTo?: number;
  notificationReference?: string;
  tdsApplicable: boolean;
  /** @deprecated Use standardDeductionByRegime for statutory calculations. */
  standardDeduction?: number;
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
  dateOfBirth?: number;
  residentStatus?: "RESIDENT" | "NON_RESIDENT";
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
  projectedVariableSalary?: number;
  expectedBonus?: number;
  arrears?: number;
  taxablePerquisites?: number;
  previousEmployerIncome?: number;
  otherDeclaredIncome?: number;
  housePropertyIncome?: number;
  exemptions?: number;
  approvedDeductions?: number;
  standardDeduction?: number;
  employeeTaxProfile?: EmployeeTaxProfile;
  taxDeclarationItems?: TaxDeclarationItem[];
  proofCutoffMonth?: PayrollMonth;
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
  slabsByGender?: Partial<Record<PayrollGender, PTSlab[]>>;
  maxYearlyAmount?: number;
  payableMonths?: PayrollMonth[];
  specialMonthAmounts?: Partial<Record<PayrollMonth, number>>;
  exemptionNote?: string;
  ruleApplied: string;
}

export interface LWFRule {
  state: string;
  stateCode: string;
  hasLWF: boolean;
  frequency: PayrollFrequency;
  employeeShare: number;
  employerShare: number;
  payableMonths?: PayrollMonth[];
  salaryMin?: number;
  salaryMax?: number;
  ruleApplied: string;
}

export interface ProfessionalTaxInput {
  state: string;
  grossSalary: number;
  month: PayrollMonth;
  annualSalary?: number;
  gender?: PayrollGender;
}

export interface ProfessionalTaxResult {
  amount: number;
  state: string;
  ruleApplied: string;
  frequency: PayrollFrequency;
  gender?: PayrollGender;
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
  declarationAmount?: number;
  proofVerifiedAmount?: number;
  taxDeclarationItems?: TaxDeclarationItem[];
  standardDeduction?: number;
  taxSlabs?: TdsTaxSlab[];
  rebateRule?: TDSRebateRule;
  surchargeSlabs?: TDSSurchargeSlab[];
  rebateEligible?: boolean;
  cessRate?: number;
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
  esiContributionPeriodCovered?: boolean;
  esiCoveragePeriod?: EsiCoveragePeriod;
  settings?: Partial<PayrollSettings>;
  tdsInput?: Partial<Omit<TDSInput, "annualGross" | "professionalTax">>;
  taxProfile?: EmployeeTaxProfile;
  taxDeclarationItems?: TaxDeclarationItem[];
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
  coveragePeriod?: EsiCoveragePeriod;
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
  workedHours?: number;
  overtimeHours?: number;
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
  financialYear?: string;
  stateCode?: string;
  effectiveFrom: number;
  effectiveTo?: number;
  version: string;
  notificationReference?: string;
  createdAt: number;
  createdBy: string;
  approvedAt?: number;
  approvedBy?: string;
}

export interface MinimumWageRule extends StatutoryRuleMetadata {
  ruleType: "MINIMUM_WAGE";
  stateCode: string;
  scheduledEmployment: string;
  industry?: string;
  skillCategory: string;
  zone?: string;
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
  employeeId?: string;
  performedBy: string;
  performedAt: number;
  previousStatus?: string;
  newStatus?: string;
  reason?: string;
  calculationHash?: string;
}

export interface EmployeeStatutoryProfile {
  employeeId: string;
  panEncrypted?: string;
  panMasked?: string;
  uanEncrypted?: string;
  uanMasked?: string;
  pfMemberId?: string;
  esicNumberEncrypted?: string;
  esicNumberMasked?: string;
  pfApplicable: boolean;
  pfExcludedEmployee: boolean;
  existingPfMember: boolean;
  pfHigherWageOption: boolean;
  vpfRate?: number;
  epsEligible: boolean;
  esiApplicable: boolean;
  esiRegistrationDate?: number;
  taxRegime: "OLD" | "NEW";
  residentStatus: "RESIDENT" | "NON_RESIDENT";
  dateOfBirth?: number;
  gender?: string;
  bankAccountEncrypted?: string;
  bankAccountMasked?: string;
  bankIfsc?: string;
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
  userName?: string;
  employeeId: string;
  userProfileId?: string;
  employeeRef?: string;
  employeeName: string;
  empCode?: string;
  department?: string;
  designation?: string;
  workLocationState?: string;
  gender?: PayrollGender;
  joiningDate?: string;
  salaryType: SalaryType;
  grossSalary: number;
  monthlySalary: number;
  isMetroCity?: boolean;
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
  leavePolicyId?: string;
  salaryRevisions?: SalaryStructureRevision[];
  preview?: PayrollCalculationResult;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
  status: "ACTIVE" | "INACTIVE";
  isActive: boolean;
}

export interface PayrollRunDocument {
  runId?: string;
  payrollKey?: string;
  month: PayrollMonth;
  year: number;
  financialYear?: string;
  salaryType?: SalaryType;
  employeeId: string;
  userProfileId?: string;
  employeeRef?: string;
  employeeName: string;
  employeeGender?: PayrollGender;
  state: string;
  attendanceSummary: AttendancePayrollInput;
  earnings: PayrollEarnings;
  deductions: PayrollDeductions;
  employerContributions: EmployerContributions;
  grossSalary: number;
  netSalary: number;
  ctc: number;
  standardMonthlyCTC?: number;
  actualPayrollCost?: number;
  payableDays?: number;
  lopDays?: number;
  perDaySalary?: number;
  ruleBreakup: PayrollRuleBreakup;
  statutoryRuleVersions?: Record<string, string>;
  status: PayrollRunStatus;
  idempotencyKey?: string;
  sourcePayrollRunId?: string;
  calculationHash?: string;
  createdAt: number;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: number;
  lockedBy?: string;
  lockedAt?: number;
  paidBy?: string;
  paidAt?: number;
}
