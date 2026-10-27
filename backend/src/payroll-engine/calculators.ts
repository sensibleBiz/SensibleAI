import {
  LWF_STATE_RULE_MASTER,
  NON_PT_STATES,
  PT_STATE_SLAB_MASTER,
} from "./rules/index.js";
import type {
  AttendancePayrollInput,
  BonusRule,
  ESIRule,
  GratuityRule,
  LWFInput,
  LWFResult,
  OTRule,
  PFRule,
  PayrollCalculationInput,
  PayrollCalculationResult,
  PayrollDeductions,
  PayrollEarnings,
  PayrollMonth,
  ProfessionalTaxInput,
  ProfessionalTaxResult,
  EsiCalculationResult,
  PfCalculationResult,
  SalaryComponentKey,
  SalaryComponentRule,
  SalaryEarnings,
  SalaryType,
  TDSInput,
  TDSResult,
  TDSProjectionInput,
  TDSProjectionResult,
} from "./types.js";
import { calculateStatutoryWage } from "./componentRules.js";
import {
  calculateAccountedDays,
  calculateLopDays,
  calculatePayableDays,
  findRuleByState,
  findSalarySlab,
  getCompletedServiceYears,
  getAttendanceMonthDays,
  getESIContributionPeriod,
  getProfessionalTaxSalaryBasis,
  getSalaryDivisor,
  mergeAttendanceSettings,
  mergePayrollSettings,
  mergePayrollOptions,
  PAYROLL_AMOUNT_TOLERANCE,
  PayrollValidationError,
  normalizeState,
  percent,
  resolvePayrollState,
  resolveSalaryEarningsFromStructure,
  roundMoney,
  roundRupee,
  shouldApplyInMonth,
  sumValues,
  toAmount,
  validatePayrollInput,
} from "./utils.js";

const salaryComponentKeys: SalaryComponentKey[] = [
  "basic",
  "hra",
  "da",
  "conveyance",
  "medical",
  "specialAllowance",
  "incentive",
  "overtime",
  "bonus",
  "arrears",
  "reimbursement",
  "otherEarnings",
];

const normalizeEarnings = (earnings: SalaryEarnings): Required<SalaryEarnings> =>
  salaryComponentKeys.reduce<Required<SalaryEarnings>>(
    (normalized, key) => ({
      ...normalized,
      [key]: toAmount(earnings[key]),
    }),
    {
      basic: 0,
      hra: 0,
      da: 0,
      conveyance: 0,
      medical: 0,
      specialAllowance: 0,
      incentive: 0,
      overtime: 0,
      bonus: 0,
      arrears: 0,
      reimbursement: 0,
      otherEarnings: 0,
    }
  );

const getComponentRule = (
  rules: SalaryComponentRule[],
  key: SalaryComponentKey
): SalaryComponentRule | undefined => rules.find((rule) => rule.key === key);

const isFixedComponent = (
  rules: SalaryComponentRule[],
  key: SalaryComponentKey
) => (getComponentRule(rules, key)?.earningType || "FIXED") === "FIXED";

const shouldIncludeInGross = (
  rules: SalaryComponentRule[],
  key: SalaryComponentKey
) => {
  const rule = getComponentRule(rules, key);
  return rule?.includeInGross ?? rule?.grossEarning ?? true;
};

const shouldApplyLop = (
  rules: SalaryComponentRule[],
  key: SalaryComponentKey
) => Boolean(getComponentRule(rules, key)?.lopApplicable);

const sumEarningComponents = (
  earnings: Required<SalaryEarnings>,
  predicate: (key: SalaryComponentKey) => boolean
) =>
  salaryComponentKeys.reduce(
    (total, key) => total + (predicate(key) ? toAmount(earnings[key]) : 0),
    0
  );

export const calculateGrossEarnings = (earnings: SalaryEarnings): number =>
  roundMoney(sumValues(earnings));

export const calculateLOPDeduction = ({
  monthlyGross,
  monthDays,
  lopDays,
}: {
  monthlyGross: number;
  monthDays: number;
  lopDays: number;
}): { perDaySalary: number; lopDeduction: number } => {
  const perDaySalary = monthDays > 0 ? monthlyGross / monthDays : 0;

  return {
    perDaySalary: roundMoney(perDaySalary),
    lopDeduction: roundMoney(perDaySalary * Math.max(lopDays, 0)),
  };
};

export const calculatePF = ({
  basic,
  da,
  pfWage,
  rule,
  employeeApplicable = true,
  pfExcludedEmployee = false,
  existingPfMember = true,
  pfHigherWageOption = false,
  employeePfCeiling,
  vpfRate = 0,
  epsEligible = true,
  internationalWorker = false,
}: {
  basic: number;
  da: number;
  pfWage?: number | undefined;
  rule: PFRule;
  employeeApplicable?: boolean | undefined;
  pfExcludedEmployee?: boolean | undefined;
  existingPfMember?: boolean | undefined;
  pfHigherWageOption?: boolean | undefined;
  employeePfCeiling?: number | undefined;
  vpfRate?: number | undefined;
  epsEligible?: boolean | undefined;
  internationalWorker?: boolean | undefined;
}): PfCalculationResult => {
  const warnings: string[] = [];
  const statutoryWage = pfWage ?? toAmount(basic) + toAmount(da);
  const normalizedPfWage = toAmount(statutoryWage);
  const configuredCeiling = toAmount(employeePfCeiling) || rule.pfCeilingAmount;
  const shouldCapWage =
    rule.pfCeilingApplicable &&
    configuredCeiling > 0 &&
    !pfHigherWageOption &&
    !internationalWorker;
  const cappedPfWage = shouldCapWage
    ? Math.min(normalizedPfWage, configuredCeiling)
    : normalizedPfWage;

  if (pfExcludedEmployee && !existingPfMember) {
    warnings.push("Employee is marked as PF-excluded and has no existing PF membership.");
  }

  if (pfHigherWageOption && normalizedPfWage > rule.pfCeilingAmount) {
    warnings.push("PF higher-wage option applied above the statutory wage ceiling.");
  }

  if (
    !rule.pfApplicable ||
    !employeeApplicable ||
    (pfExcludedEmployee && !existingPfMember) ||
    cappedPfWage <= 0
  ) {
    return {
      applicable: false,
      statutoryWage: roundMoney(statutoryWage),
      pfWage: roundMoney(normalizedPfWage),
      cappedPfWage: 0,
      employeePF: 0,
      voluntaryPF: 0,
      employerPF: 0,
      employerEPF: 0,
      employerEPS: 0,
      employerEDLI: 0,
      administrativeCharges: 0,
      eps: 0,
      edli: 0,
      totalEmployeeContribution: 0,
      totalEmployerContribution: 0,
      ruleApplied: "PF not applicable.",
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      warnings,
    };
  }

  const employeePF = roundRupee(cappedPfWage * percent(rule.employeePfRate));
  const voluntaryPF = roundRupee(cappedPfWage * percent(Math.max(vpfRate, 0)));
  const employerPfShare = roundRupee(cappedPfWage * percent(rule.employerPfRate));
  const epsWage = epsEligible
    ? Math.min(cappedPfWage, rule.pfCeilingAmount)
    : 0;
  const eps = roundRupee(epsWage * percent(rule.epsRate));
  const employerEPF = roundRupee(Math.max(employerPfShare - eps, 0));
  const edliWage = rule.edliWageCeiling > 0
    ? Math.min(normalizedPfWage, rule.edliWageCeiling)
    : normalizedPfWage;
  const edli = roundRupee(edliWage * percent(rule.edliRate));
  const administrativeCharges = roundRupee(
    cappedPfWage * percent(rule.epfAdministrativeChargeRate)
  );
  const totalEmployeeContribution = roundMoney(employeePF + voluntaryPF);
  const totalEmployerContribution = roundMoney(
    employerEPF + eps + edli + administrativeCharges
  );

  return {
    applicable: true,
    statutoryWage: roundMoney(statutoryWage),
    pfWage: roundMoney(normalizedPfWage),
    cappedPfWage: roundMoney(cappedPfWage),
    employeePF,
    voluntaryPF,
    employerPF: totalEmployerContribution,
    eps,
    employerEPF,
    edli,
    employerEPS: eps,
    employerEDLI: edli,
    administrativeCharges,
    totalEmployeeContribution,
    totalEmployerContribution,
    ruleApplied: rule.pfCeilingApplicable
      ? `PF calculated on configured PF wage with ceiling ${configuredCeiling}.`
      : "PF calculated on configured PF wage without ceiling.",
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    warnings,
  };
};

export const calculateESI = ({
  esiGross,
  contributionWage,
  rule,
  employeeApplicable = true,
  coverageWage = esiGross,
  contributionPeriodCovered = false,
  coveragePeriod,
  payrollMonth,
  payrollYear,
}: {
  esiGross: number;
  contributionWage?: number | undefined;
  rule: ESIRule;
  employeeApplicable?: boolean | undefined;
  /** Excludes overtime when testing the ESI coverage threshold. */
  coverageWage?: number | undefined;
  /** Coverage established earlier in the same Apr–Sep or Oct–Mar period. */
  contributionPeriodCovered?: boolean | undefined;
  coveragePeriod?: EsiCalculationResult["coveragePeriod"] | undefined;
  payrollMonth?: PayrollMonth | undefined;
  payrollYear?: number | undefined;
}): EsiCalculationResult => {
  const warnings: string[] = [];
  const normalizedContributionWage = toAmount(contributionWage ?? esiGross);
  const normalizedCoverageWage = toAmount(coverageWage);
  const coveredByWageLimit = normalizedCoverageWage <= rule.esiWageLimit;
  const contributionPeriod =
    payrollMonth && payrollYear
      ? getESIContributionPeriod(payrollYear, payrollMonth).key
      : undefined;
  const continuedDueToContributionPeriod =
    !coveredByWageLimit && contributionPeriodCovered;
  const applicable =
    rule.esiApplicable &&
    employeeApplicable &&
    normalizedContributionWage > 0 &&
    (coveredByWageLimit || contributionPeriodCovered);

  if (normalizedContributionWage !== toAmount(esiGross)) {
    warnings.push("ESI contribution wage was calculated from component rules, not total gross.");
  }

  if (!applicable) {
    return {
      applicable: false,
      continuedDueToContributionPeriod: false,
      eligibilityWage: roundMoney(normalizedCoverageWage),
      contributionWage: roundMoney(normalizedContributionWage),
      esiGross: roundMoney(normalizedContributionWage),
      coverageWage: roundMoney(normalizedCoverageWage),
      contributionPeriodKey: contributionPeriod || "Not specified",
      contributionPeriod: contributionPeriod || "Not specified",
      coveragePeriod,
      employeeESI: 0,
      employerESI: 0,
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      warnings,
      ruleApplied: "ESI not applicable or coverage wage exceeds the limit at the start of the contribution period.",
    };
  }

  return {
    applicable: true,
    continuedDueToContributionPeriod,
    eligibilityWage: roundMoney(normalizedCoverageWage),
    contributionWage: roundMoney(normalizedContributionWage),
    esiGross: roundMoney(normalizedContributionWage),
    coverageWage: roundMoney(normalizedCoverageWage),
    contributionPeriodKey: contributionPeriod || "Not specified",
    contributionPeriod: contributionPeriod || "Not specified",
    coveragePeriod,
    employeeESI: roundRupee(
      normalizedContributionWage * percent(rule.employeeEsiRate)
    ),
    employerESI: roundRupee(
      normalizedContributionWage * percent(rule.employerEsiRate)
    ),
    ruleApplied: continuedDueToContributionPeriod
      ? "ESI continued because coverage was established earlier in this contribution period."
      : `ESI calculated because coverage wage is within ${rule.esiWageLimit}.`,
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    warnings,
  };
};

export const calculateBonus = ({
  basic,
  da,
  rule,
  applicableMinimumWage,
  daysWorked,
  employeeEligibility = true,
  disqualificationReason,
  bonusPaidThisMonth = 0,
  bonusArrears = 0,
}: {
  basic: number;
  da: number;
  rule: BonusRule;
  applicableMinimumWage?: number | undefined;
  daysWorked?: number | undefined;
  employeeEligibility?: boolean | undefined;
  disqualificationReason?: string | undefined;
  bonusPaidThisMonth?: number | undefined;
  bonusArrears?: number | undefined;
}) => {
  const basicDa = toAmount(basic) + toAmount(da);
  const eligibilityLimit =
    rule.bonusEligibilityWageLimit || rule.eligibilityWageLimit;
  const statutoryCalculationCeiling =
    rule.statutoryCalculationCeiling || rule.statutoryWageCeiling;
  const effectiveMinimumWage = Math.max(
    toAmount(applicableMinimumWage ?? rule.applicableMinimumWage),
    0
  );
  const calculationCeiling = Math.max(
    statutoryCalculationCeiling,
    effectiveMinimumWage
  );
  const bonusWage = Math.min(basicDa, calculationCeiling);
  const accountingYearDays = rule.daysInAccountingYear || 365;
  const workedDayFactor =
    daysWorked === undefined
      ? 1
      : Math.max(Math.min(toAmount(daysWorked), accountingYearDays), 0) /
        accountingYearDays;

  if (!rule.bonusApplicable || bonusWage <= 0 || !employeeEligibility) {
    return {
      applicable: false,
      eligibleByWage: false,
      employeeEligibility,
      disqualificationReason:
        disqualificationReason || "Bonus not applicable.",
      basicDa: roundMoney(basicDa),
      bonusWage: 0,
      minimumBonus: 0,
      maximumBonus: 0,
      bonusAmount: 0,
      annualStatutoryBonus: 0,
      monthlyBonusProvision: 0,
      bonusPaidThisMonth: roundMoney(bonusPaidThisMonth),
      bonusArrears: roundMoney(bonusArrears),
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      ruleApplied: "Bonus not applicable.",
    };
  }

  if (basicDa > eligibilityLimit) {
    return {
      applicable: false,
      eligibleByWage: false,
      employeeEligibility,
      disqualificationReason:
        disqualificationReason ||
        `Bonus wage exceeds eligibility limit of ${eligibilityLimit}.`,
      basicDa: roundMoney(basicDa),
      bonusWage: 0,
      minimumBonus: 0,
      maximumBonus: 0,
      bonusAmount: 0,
      annualStatutoryBonus: 0,
      monthlyBonusProvision: 0,
      bonusPaidThisMonth: roundMoney(bonusPaidThisMonth),
      bonusArrears: roundMoney(bonusArrears),
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      ruleApplied: `Statutory bonus is not applicable because bonus wage exceeds the eligibility limit of ${eligibilityLimit}.`,
    };
  }

  const annualBonusWage = bonusWage * 12 * workedDayFactor;
  const annualStatutoryBonus = annualBonusWage * percent(rule.bonusRate);
  const monthlyBonusProvision = annualStatutoryBonus / 12;

  return {
    applicable: true,
    eligibleByWage: true,
    employeeEligibility,
    disqualificationReason: "",
    basicDa: roundMoney(basicDa),
    bonusWage: roundMoney(bonusWage),
    applicableMinimumWage: roundMoney(effectiveMinimumWage),
    statutoryCalculationCeiling: roundMoney(statutoryCalculationCeiling),
    calculationCeiling: roundMoney(calculationCeiling),
    daysWorked: daysWorked === undefined ? accountingYearDays : roundMoney(daysWorked),
    minimumBonus: roundMoney(annualBonusWage * percent(rule.minimumBonusRate)),
    maximumBonus: roundMoney(annualBonusWage * percent(rule.maximumBonusRate)),
    bonusAmount: roundMoney(monthlyBonusProvision),
    annualStatutoryBonus: roundMoney(annualStatutoryBonus),
    monthlyBonusProvision: roundMoney(monthlyBonusProvision),
    bonusPaidThisMonth: roundMoney(bonusPaidThisMonth),
    bonusArrears: roundMoney(bonusArrears),
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    ruleApplied: `Bonus uses eligibility limit ${eligibilityLimit} and calculation ceiling ${calculationCeiling}.`,
  };
};

export const calculateGratuity = ({
  basic,
  da,
  gratuityWage,
  dateOfJoining,
  asOfDate,
  override = false,
  deathOrDisablement = false,
  finalSettlement = false,
  rule,
}: {
  basic: number;
  da: number;
  gratuityWage?: number | undefined;
  dateOfJoining?: string | undefined;
  asOfDate: Date;
  override?: boolean | undefined;
  deathOrDisablement?: boolean | undefined;
  finalSettlement?: boolean | undefined;
  rule: GratuityRule;
}) => {
  const basicDa = toAmount(gratuityWage ?? toAmount(basic) + toAmount(da));
  const service = getCompletedServiceYears(
    dateOfJoining,
    asOfDate,
    rule.serviceMonthRoundUpAfter
  );
  const eligible =
    rule.gratuityApplicable &&
    basicDa > 0 &&
    (override ||
      deathOrDisablement ||
      service.roundedYears >= rule.eligibleAfterYears);
  const amount = eligible
    ? (basicDa * rule.payableDays * service.roundedYears) /
      rule.daysInMonthForFormula
    : 0;
  const monthlyProvision =
    rule.gratuityApplicable && basicDa > 0
      ? (basicDa * rule.payableDays) / rule.daysInMonthForFormula / 12
      : 0;
  const payableGratuity = finalSettlement ? amount : 0;
  const taxExemptGratuity = Math.min(payableGratuity, rule.taxExemptionLimit);
  const taxableGratuity = Math.max(payableGratuity - taxExemptGratuity, 0);

  return {
    applicable: eligible,
    basicDa: roundMoney(basicDa),
    completedYears: service.completedYears,
    roundedYears: service.roundedYears,
    remainingMonths: service.remainingMonths,
    gratuityAmount: roundMoney(amount),
    accruedGratuityLiability: roundMoney(amount),
    estimatedAccruedGratuity: roundMoney(amount),
    monthlyGratuityProvision: roundMoney(monthlyProvision),
    payableGratuity: roundMoney(payableGratuity),
    taxExemptGratuity: roundMoney(taxExemptGratuity),
    taxableGratuity: roundMoney(taxableGratuity),
    calculationDate: asOfDate.getTime(),
    ruleId: rule.ruleId,
    ruleVersion: rule.version,
    ruleApplied: eligible
      ? "Gratuity = (Basic + DA) x 15 x completed service years / 26."
      : "Gratuity not applicable until eligibility is met.",
  };
};

export const calculateOvertime = ({
  basic,
  da,
  gross,
  otHours,
  rule,
}: {
  basic: number;
  da: number;
  gross: number;
  otHours: number;
  rule: OTRule;
}) => {
  const baseAmount = rule.otBase === "GROSS" ? gross : toAmount(basic) + toAmount(da);
  const hourlyRate =
    rule.workingDays > 0 && rule.workingHoursPerDay > 0
      ? baseAmount / rule.workingDays / rule.workingHoursPerDay
      : 0;
  const otAmount =
    rule.otApplicable && otHours > 0
      ? otHours * hourlyRate * rule.otMultiplier
      : 0;

  return {
    applicable: rule.otApplicable && otHours > 0,
    otBase: rule.otBase,
    baseAmount: roundMoney(baseAmount),
    hourlyRate: roundMoney(hourlyRate),
    otHours: roundMoney(otHours),
    calculatedOvertimeAmount: roundMoney(otAmount),
    approvedOvertimeAmount: roundMoney(otAmount),
    manualOvertimeAdjustment: 0,
    otAmount: roundMoney(otAmount),
    ruleApplied: "OT Amount = OT Hours x Hourly Rate x OT Multiplier.",
  };
};

export const calculateProfessionalTax = ({
  state,
  grossSalary,
  month,
  annualSalary,
  gender,
}: ProfessionalTaxInput): ProfessionalTaxResult => {
  const resolvedState = resolvePayrollState(state);
  const rule = findRuleByState(PT_STATE_SLAB_MASTER, resolvedState);
  const nonPtState = NON_PT_STATES.find(
    (item) => normalizeState(item) === normalizeState(resolvedState)
  );

  if (!resolvedState) {
    return {
      amount: 0,
      state: resolvedState,
      ruleApplied: "Select a Work Location State to calculate PT.",
      frequency: "not-applicable",
    };
  }

  if (nonPtState) {
    return {
      amount: 0,
      state: nonPtState,
      ruleApplied: `Professional tax is not applicable in ${nonPtState}.`,
      frequency: "not-applicable",
    };
  }

  if (!rule || !rule.hasPT) {
    return {
      amount: 0,
      state: resolvedState,
      ruleApplied: "No PT rule configured for this state.",
      frequency: "not-applicable",
    };
  }

  if (!shouldApplyInMonth(rule.payableMonths, month)) {
    return {
      amount: 0,
      state: rule.state,
      ruleApplied: `${rule.ruleApplied} Not payable in this payroll month.`,
      frequency: rule.frequency,
    };
  }

  const salaryBasis = getProfessionalTaxSalaryBasis(
    rule,
    grossSalary,
    annualSalary
  );
  const slabs = (gender && rule.slabsByGender?.[gender]) || rule.slabs;
  const slab = findSalarySlab(slabs, salaryBasis);
  const specialMonthAmount = rule.specialMonthAmounts?.[month];
  const amount =
    specialMonthAmount !== undefined && slab.amount > 0
      ? specialMonthAmount
      : slab.amount;

  return {
    amount: roundRupee(amount),
    state: rule.state,
    ruleApplied: gender && rule.slabsByGender?.[gender]
      ? `${rule.ruleApplied} ${gender} salary and wage earner slab applied.`
      : rule.ruleApplied,
    frequency: rule.frequency,
    gender,
  };
};

const getFinancialYearMonthIndex = (month: PayrollMonth): number =>
  month >= 4 ? month - 3 : month + 9;

export const getFinancialYear = (
  payrollYear: number,
  payrollMonth: PayrollMonth
): string => {
  const startYear = payrollMonth >= 4 ? payrollYear : payrollYear - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

const calculateDeclarationDeduction = ({
  items = [],
  payrollMonth,
  proofCutoffMonth,
}: {
  items?: TDSProjectionInput["taxDeclarationItems"] | undefined;
  payrollMonth: PayrollMonth;
  proofCutoffMonth?: PayrollMonth | undefined;
}) => {
  const useApprovedAmounts =
    proofCutoffMonth !== undefined &&
    getFinancialYearMonthIndex(payrollMonth) >=
      getFinancialYearMonthIndex(proofCutoffMonth);

  return roundMoney(
    items.reduce((total, item) => {
      if (item.status === "REJECTED") {
        return total;
      }

      const amount = useApprovedAmounts
        ? item.approvedAmount
        : item.approvedAmount || item.proofSubmittedAmount || item.declaredAmount;

      return total + Math.min(toAmount(amount), toAmount(item.statutoryLimit));
    }, 0)
  );
};

export const projectAnnualTaxableIncome = ({
  financialYear,
  payrollMonth,
  currentMonthTaxableSalary,
  projectedRemainingFixedSalary,
  projectedVariableSalary = 0,
  expectedBonus = 0,
  arrears = 0,
  taxablePerquisites = 0,
  previousEmployerIncome = 0,
  otherDeclaredIncome = 0,
  housePropertyIncome = 0,
  exemptions = 0,
  approvedDeductions = 0,
  standardDeduction = 0,
  employeeTaxProfile,
  taxDeclarationItems,
  proofCutoffMonth,
}: TDSProjectionInput): TDSProjectionResult => {
  const warnings: string[] = [];
  const profile = employeeTaxProfile;
  const profileYtdSalary = toAmount(profile?.yearToDateTaxableSalary);
  const profilePreviousEmployerIncome = toAmount(
    profile?.previousEmployerIncome ?? previousEmployerIncome
  );
  const profileOtherIncome = toAmount(profile?.otherIncome ?? otherDeclaredIncome);
  const profileHousePropertyIncome = toAmount(
    profile?.housePropertyIncome ?? housePropertyIncome
  );
  const profileTaxablePerquisites = toAmount(
    profile?.taxablePerquisites ?? taxablePerquisites
  );
  const declarationDeduction = calculateDeclarationDeduction({
    items: taxDeclarationItems,
    payrollMonth,
    proofCutoffMonth,
  });

  if (!profile && payrollMonth !== 4) {
    warnings.push(
      "Employee tax profile is missing; year-to-date taxable salary is assumed to be zero."
    );
  }

  const annualGrossIncome = roundMoney(
    profileYtdSalary +
      currentMonthTaxableSalary +
      projectedRemainingFixedSalary +
      toAmount(profile?.projectedVariableIncome ?? projectedVariableSalary) +
      toAmount(profile?.projectedBonus ?? expectedBonus) +
      arrears +
      profileTaxablePerquisites +
      profilePreviousEmployerIncome +
      profileOtherIncome +
      profileHousePropertyIncome
  );
  const annualTaxableSalary = roundMoney(
    Math.max(
      annualGrossIncome -
        toAmount(exemptions) -
        toAmount(approvedDeductions) -
        declarationDeduction -
        toAmount(standardDeduction),
      0
    )
  );
  const previousEmployerTDS = toAmount(profile?.previousEmployerTDS);
  const yearToDateTDS = toAmount(profile?.yearToDateTDS);
  const elapsedMonthIndex = getFinancialYearMonthIndex(payrollMonth);
  const remainingPayrollMonths = Math.max(12 - elapsedMonthIndex + 1, 1);

  return {
    financialYear,
    annualGrossIncome,
    annualTaxableSalary,
    declarationDeduction,
    previousEmployerTDS,
    yearToDateTDS,
    remainingTDS: 0,
    remainingPayrollMonths,
    warnings,
  };
};

export const calculateLWF = ({
  state,
  month,
  grossSalary,
}: LWFInput): LWFResult => {
  const rule = findRuleByState(LWF_STATE_RULE_MASTER, state);
  const salaryEligible =
    !rule ||
    ((rule.salaryMin === undefined || grossSalary >= rule.salaryMin) &&
      (rule.salaryMax === undefined || grossSalary <= rule.salaryMax));

  if (!rule || !rule.hasLWF || !salaryEligible) {
    return {
      employeeContribution: 0,
      employerContribution: 0,
      totalContribution: 0,
      frequency: "not-applicable",
      ruleApplied: "No LWF rule configured for this state or salary range.",
    };
  }

  if (!shouldApplyInMonth(rule.payableMonths, month)) {
    return {
      employeeContribution: 0,
      employerContribution: 0,
      totalContribution: 0,
      frequency: rule.frequency,
      ruleApplied: `${rule.ruleApplied} Not payable in this payroll month.`,
    };
  }

  const employeeContribution = roundMoney(rule.employeeShare);
  const employerContribution = roundMoney(rule.employerShare);

  return {
    employeeContribution,
    employerContribution,
    totalContribution: roundMoney(employeeContribution + employerContribution),
    frequency: rule.frequency,
    ruleApplied: rule.ruleApplied,
  };
};

export const calculateTDS = ({
  annualGross,
  deductions,
  regime,
  professionalTax,
  alreadyDeductedTDS,
  remainingMonths,
  declarationAmount = 0,
  proofVerifiedAmount = 0,
  taxDeclarationItems,
  standardDeduction = 0,
  taxSlabs,
  rebateRule,
  surchargeSlabs,
  rebateEligible = true,
  cessRate = 0,
}: TDSInput): TDSResult => {
  const declarationDeduction =
    taxDeclarationItems !== undefined
      ? calculateDeclarationDeduction({
          items: taxDeclarationItems,
          payrollMonth: 4,
        })
      : proofVerifiedAmount > 0
        ? proofVerifiedAmount
        : declarationAmount;
  const taxableIncome = Math.max(
    annualGross -
      deductions -
      professionalTax -
      declarationDeduction -
      standardDeduction,
    0
  );
  const slabs = taxSlabs || [];
  const calculateSlabTax = (income: number) => {
    let slabStart = 0;
    let tax = 0;

    slabs.forEach((slab) => {
      const slabEnd = slab.upto ?? income;
      const taxableInSlab = Math.max(Math.min(income, slabEnd) - slabStart, 0);
      tax += taxableInSlab * percent(slab.rate);
      slabStart = slabEnd;
    });

    return roundMoney(tax);
  };
  const baseTax = calculateSlabTax(taxableIncome);
  const rebate87A =
    rebateEligible !== false &&
    rebateRule &&
    taxableIncome <= rebateRule.taxableIncomeLimit
      ? Math.min(baseTax, rebateRule.maximumRebate)
      : 0;
  const taxAfterRebate = Math.max(baseTax - rebate87A, 0);
  const applicableSurcharge = (surchargeSlabs || [])
    .filter((slab) => taxableIncome > slab.threshold)
    .at(-1);
  const provisionalSurcharge = applicableSurcharge
    ? roundMoney(taxAfterRebate * percent(applicableSurcharge.rate))
    : 0;
  const taxWithSurcharge = taxAfterRebate + provisionalSurcharge;
  let marginalRelief = 0;

  if (applicableSurcharge) {
    const thresholdTax = calculateSlabTax(applicableSurcharge.threshold);
    const previousSurcharge = (surchargeSlabs || [])
      .filter((slab) => applicableSurcharge.threshold > slab.threshold)
      .at(-1);
    const thresholdTaxWithSurcharge =
      thresholdTax +
      thresholdTax * percent(previousSurcharge?.rate || 0);
    const maximumTaxWithSurcharge =
      thresholdTaxWithSurcharge +
      (taxableIncome - applicableSurcharge.threshold);

    marginalRelief = Math.max(
      taxWithSurcharge - maximumTaxWithSurcharge,
      0
    );
  }

  const surcharge = roundMoney(Math.max(provisionalSurcharge - marginalRelief, 0));
  const cess = roundMoney((taxAfterRebate + surcharge) * percent(cessRate));
  const annualTax = roundMoney(taxAfterRebate + surcharge + cess);
  const balanceTax = Math.max(annualTax - alreadyDeductedTDS, 0);

  return {
    monthlyTDS:
      remainingMonths > 0 ? roundMoney(balanceTax / remainingMonths) : 0,
    annualTaxableIncome: roundMoney(taxableIncome),
    annualTax,
    balanceTax: roundMoney(balanceTax),
    baseTax: roundMoney(baseTax),
    rebate87A: roundMoney(rebate87A),
    surcharge,
    marginalRelief: roundMoney(marginalRelief),
    cess,
    regime,
    ruleApplied: taxSlabs?.length
      ? "TDS calculated with configured slabs."
      : "TDS placeholder used without configured slabs.",
  };
};

export const createAttendanceSummary = (
  attendance: AttendancePayrollInput
): AttendancePayrollInput => ({
  employeeId: attendance.employeeId,
  month: attendance.month,
  year: attendance.year,
  presentDays: toAmount(attendance.presentDays),
  paidLeave: toAmount(attendance.paidLeave),
  weeklyOff: toAmount(attendance.weeklyOff),
  paidHolidays: toAmount(attendance.paidHolidays),
  absentDays: toAmount(attendance.absentDays),
  unpaidLeave: toAmount(attendance.unpaidLeave),
  preJoiningDays: toAmount(attendance.preJoiningDays),
  postExitDays: toAmount(attendance.postExitDays),
  attendanceRecordCount: toAmount(attendance.attendanceRecordCount),
  pendingAttendanceDays: toAmount(attendance.pendingAttendanceDays),
  monthDays: toAmount(attendance.monthDays),
  otHours: toAmount(attendance.otHours),
  workedHours: toAmount(attendance.workedHours),
  overtimeHours: toAmount(attendance.overtimeHours),
  approvedOvertimeAmount:
    attendance.approvedOvertimeAmount === undefined
      ? undefined
      : toAmount(attendance.approvedOvertimeAmount),
  manualOvertimeAdjustment: toAmount(attendance.manualOvertimeAdjustment),
  loanDeduction: toAmount(attendance.loanDeduction),
  advanceDeduction: toAmount(attendance.advanceDeduction),
  otherDeduction: toAmount(attendance.otherDeduction),
  incentive: toAmount(attendance.incentive),
  fixedIncentive: toAmount(attendance.fixedIncentive),
  attendanceIncentive: toAmount(attendance.attendanceIncentive),
  performanceIncentive: toAmount(attendance.performanceIncentive),
  salesIncentive: toAmount(attendance.salesIncentive),
  manualIncentiveAdjustment: toAmount(attendance.manualIncentiveAdjustment),
  arrears: toAmount(attendance.arrears),
});

const getLifecycleExcludedDays = ({
  date,
  payrollYear,
  payrollMonth,
  monthDays,
  mode,
}: {
  date?: string | undefined;
  payrollYear: number;
  payrollMonth: number;
  monthDays: number;
  mode: "PRE_JOINING" | "POST_EXIT";
}) => {
  if (!date) {
    return 0;
  }

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return 0;
  }

  const payrollMonthIndex = payrollMonth - 1;
  if (
    parsedDate.getFullYear() !== payrollYear ||
    parsedDate.getMonth() !== payrollMonthIndex
  ) {
    return 0;
  }

  const dayOfMonth = parsedDate.getDate();

  return mode === "PRE_JOINING"
    ? Math.max(Math.min(dayOfMonth - 1, monthDays), 0)
    : Math.max(monthDays - Math.min(dayOfMonth, monthDays), 0);
};

const prepareAttendanceForPayroll = (
  input: PayrollCalculationInput
): AttendancePayrollInput => {
  const attendance = createAttendanceSummary(input.attendance);
  const monthDays = getAttendanceMonthDays({
    payrollYear: input.payrollYear,
    payrollMonth: input.payrollMonth,
    actualMonthDays: attendance.monthDays,
  });
  const preJoiningDays = getLifecycleExcludedDays({
    date: input.employee.dateOfJoining,
    payrollYear: input.payrollYear,
    payrollMonth: input.payrollMonth,
    monthDays,
    mode: "PRE_JOINING",
  });
  const postExitDays = getLifecycleExcludedDays({
    date: input.employee.dateOfExit,
    payrollYear: input.payrollYear,
    payrollMonth: input.payrollMonth,
    monthDays,
    mode: "POST_EXIT",
  });

  return {
    ...attendance,
    month: input.payrollMonth,
    year: input.payrollYear,
    monthDays,
    preJoiningDays: Math.max(toAmount(attendance.preJoiningDays), preJoiningDays),
    postExitDays: Math.max(toAmount(attendance.postExitDays), postExitDays),
  };
};

export const calculatePayroll = (
  input: PayrollCalculationInput
): PayrollCalculationResult => {
  const attendance = prepareAttendanceForPayroll(input);
  const preparedInput = { ...input, attendance };
  validatePayrollInput(preparedInput);

  const baseSettings = mergePayrollSettings(input.settings);
  const payrollOptions = mergePayrollOptions({
    ...(input.employee.pfApplicable === undefined
      ? {}
      : { pfApplicable: input.employee.pfApplicable }),
    ...(input.employee.esiApplicable === undefined
      ? {}
      : { esiApplicable: input.employee.esiApplicable }),
    ...input.salaryStructure.payrollOptions,
  });
  const attendanceSettings = mergeAttendanceSettings(
    input.salaryStructure.attendanceSettings
  );
  const settings = {
    ...baseSettings,
    pf: {
      ...baseSettings.pf,
      pfApplicable: payrollOptions.pfApplicable,
      pfCeilingApplicable: payrollOptions.pfCeilingApplicable,
    },
    esi: {
      ...baseSettings.esi,
      esiApplicable: payrollOptions.esiApplicable,
    },
    bonus: {
      ...baseSettings.bonus,
      bonusApplicable: payrollOptions.bonusApplicable,
    },
    gratuity: {
      ...baseSettings.gratuity,
      gratuityApplicable: payrollOptions.gratuityApplicable,
    },
    ot: {
      ...baseSettings.ot,
      otApplicable: payrollOptions.otApplicable,
    },
    tds: {
      ...baseSettings.tds,
      tdsApplicable: payrollOptions.tdsApplicable,
    },
  };
  const warnings: string[] = [];
  const salaryType: SalaryType = input.salaryStructure.salaryType || "MONTHLY";
  const configuredEarnings = normalizeEarnings(
    resolveSalaryEarningsFromStructure(input.salaryStructure)
  );
  const salaryDivisor = getSalaryDivisor({
    payrollYear: input.payrollYear,
    payrollMonth: input.payrollMonth,
    attendance,
    attendanceSettings,
  });
  const payableDays = calculatePayableDays(
    attendance,
    attendanceSettings,
    settings.leave
  );
  const lopDays = calculateLopDays(attendance, attendanceSettings, settings.leave);
  const accountedDays = calculateAccountedDays(attendance);
  const basic = toAmount(configuredEarnings.basic);
  const da = toAmount(configuredEarnings.da);
  const fixedGross = sumEarningComponents(
    configuredEarnings,
    (key) => isFixedComponent(settings.salaryComponents, key) &&
      shouldIncludeInGross(settings.salaryComponents, key)
  );
  const monthlyLopEligibleGross = sumEarningComponents(
    configuredEarnings,
    (key) => shouldApplyLop(settings.salaryComponents, key)
  );
  const dailyRate = toAmount(input.salaryStructure.dailyRate);
  const hourlyRate = toAmount(input.salaryStructure.hourlyRate);
  const overtimeHours =
    input.attendance.overtimeHours !== undefined
      ? toAmount(input.attendance.overtimeHours)
      : toAmount(attendance.otHours);
  const workedHours = toAmount(attendance.workedHours);
  const overtimeMultiplier =
    input.salaryStructure.overtimeMultiplier ?? settings.ot.otMultiplier;

  let scheduledGross = fixedGross;
  let lopEligibleGross = monthlyLopEligibleGross;
  let perDaySalary = salaryDivisor > 0 ? lopEligibleGross / salaryDivisor : 0;
  let lopDeduction = perDaySalary * lopDays;
  let earnedFixedSalary = Math.max(scheduledGross - lopDeduction, 0);
  let regularEarnings = earnedFixedSalary;
  const otBreakup = calculateOvertime({
    basic,
    da,
    gross: scheduledGross,
    otHours: overtimeHours,
    rule: settings.ot,
  });
  let calculatedOvertime = Number(otBreakup.otAmount);

  if (salaryType === "DAILY") {
    scheduledGross = roundMoney(dailyRate * attendance.monthDays);
    lopEligibleGross = scheduledGross;
    perDaySalary = dailyRate;
    lopDeduction = roundMoney(dailyRate * lopDays);
    earnedFixedSalary = roundMoney(dailyRate * payableDays);
    regularEarnings = earnedFixedSalary;
  }

  if (salaryType === "HOURLY") {
    regularEarnings = roundMoney(hourlyRate * workedHours);
    calculatedOvertime = roundMoney(
      settings.ot.otApplicable
        ? hourlyRate * overtimeHours * overtimeMultiplier
        : 0
    );
    scheduledGross = regularEarnings;
    lopEligibleGross = 0;
    perDaySalary = 0;
    lopDeduction = 0;
    earnedFixedSalary = regularEarnings;
  }

  const incentive = roundMoney(
    toAmount(configuredEarnings.incentive) +
      toAmount(attendance.fixedIncentive) +
      toAmount(attendance.attendanceIncentive) +
      toAmount(attendance.performanceIncentive) +
      toAmount(attendance.salesIncentive) +
      toAmount(attendance.manualIncentiveAdjustment) +
      toAmount(attendance.incentive)
  );
  const approvedOvertimeAmount = toAmount(
    attendance.approvedOvertimeAmount ?? calculatedOvertime
  );
  const manualOvertimeAdjustment = roundMoney(
    toAmount(configuredEarnings.overtime) +
      toAmount(attendance.manualOvertimeAdjustment)
  );
  const overtime = roundMoney(
    approvedOvertimeAmount + manualOvertimeAdjustment
  );
  const bonus = roundMoney(toAmount(configuredEarnings.bonus));
  const arrears = roundMoney(
    toAmount(configuredEarnings.arrears) + toAmount(attendance.arrears)
  );
  const reimbursement = roundMoney(toAmount(configuredEarnings.reimbursement));
  const otherEarnings = roundMoney(toAmount(configuredEarnings.otherEarnings));
  const oneTimeEarnings = roundMoney(
    incentive + overtime + bonus + arrears + reimbursement + otherEarnings
  );
  const earnedGross = roundMoney(earnedFixedSalary + oneTimeEarnings);
  const getEarnedMonthlyFixedComponent = (key: SalaryComponentKey) => {
    const componentAmount = toAmount(configuredEarnings[key]);

    if (!isFixedComponent(settings.salaryComponents, key)) {
      return componentAmount;
    }

    if (!shouldApplyLop(settings.salaryComponents, key)) {
      return componentAmount;
    }

    const componentLop =
      salaryDivisor > 0 ? (componentAmount / salaryDivisor) * lopDays : 0;

    return Math.max(componentAmount - componentLop, 0);
  };
  const earnedMonthlyFixedComponents = {
    basic: getEarnedMonthlyFixedComponent("basic"),
    hra: getEarnedMonthlyFixedComponent("hra"),
    da: getEarnedMonthlyFixedComponent("da"),
    conveyance: getEarnedMonthlyFixedComponent("conveyance"),
    medical: getEarnedMonthlyFixedComponent("medical"),
    specialAllowance: getEarnedMonthlyFixedComponent("specialAllowance"),
  };
  const actualBasic =
    salaryType === "MONTHLY"
      ? earnedMonthlyFixedComponents.basic
      : regularEarnings;
  const actualDa =
    salaryType === "MONTHLY" ? earnedMonthlyFixedComponents.da : 0;
  const asOfRuleDate = Date.UTC(input.payrollYear, input.payrollMonth - 1, 1);
  const earnedComponentAmounts: Required<SalaryEarnings> = {
    basic: actualBasic,
    hra: salaryType === "MONTHLY" ? earnedMonthlyFixedComponents.hra : 0,
    da: actualDa,
    conveyance:
      salaryType === "MONTHLY" ? earnedMonthlyFixedComponents.conveyance : 0,
    medical: salaryType === "MONTHLY" ? earnedMonthlyFixedComponents.medical : 0,
    specialAllowance:
      salaryType === "MONTHLY"
        ? earnedMonthlyFixedComponents.specialAllowance
        : 0,
    incentive,
    overtime,
    bonus,
    arrears,
    reimbursement,
    otherEarnings,
  };
  const scheduledComponentAmounts: Required<SalaryEarnings> = {
    ...configuredEarnings,
    incentive: 0,
    overtime: 0,
    bonus: 0,
    arrears: 0,
    reimbursement: 0,
    otherEarnings: 0,
  };
  const pfWage = calculateStatutoryWage({
    earnings: earnedComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "pfWage",
    asOf: asOfRuleDate,
  });
  const esiContributionWage = calculateStatutoryWage({
    earnings: earnedComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "esiContributionWage",
    asOf: asOfRuleDate,
  });
  const esiCoverageEligibilityWage = calculateStatutoryWage({
    earnings: earnedComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "esiCoverageWage",
    asOf: asOfRuleDate,
  });
  const bonusWage = calculateStatutoryWage({
    earnings: earnedComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "bonusWage",
    asOf: asOfRuleDate,
  });
  const gratuityWage = calculateStatutoryWage({
    earnings: earnedComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "gratuityWage",
    asOf: asOfRuleDate,
  });
  const currentMonthTaxableSalary = calculateStatutoryWage({
    earnings: earnedComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "taxable",
    asOf: asOfRuleDate,
  });
  const scheduledMonthlyFixedTaxableSalary = calculateStatutoryWage({
    earnings: scheduledComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "taxable",
    asOf: asOfRuleDate,
  });
  const configuredGrossSalary = input.salaryStructure.grossSalary;

  if (
    salaryType === "MONTHLY" &&
    configuredGrossSalary !== undefined &&
    Math.abs(roundMoney(fixedGross) - configuredGrossSalary) >
      PAYROLL_AMOUNT_TOLERANCE
  ) {
    warnings.push(
      `Salary component total ${roundMoney(
        fixedGross
      )} does not match configured gross salary ${roundMoney(
        configuredGrossSalary
      )}.`
    );
  }

  const pfBreakup = calculatePF({
    basic: actualBasic,
    da: actualDa,
    pfWage,
    rule: settings.pf,
    employeeApplicable: input.employee.pfApplicable !== false,
    pfExcludedEmployee: input.employee.pfExcludedEmployee,
    existingPfMember: input.employee.existingPfMember,
    pfHigherWageOption: input.employee.pfHigherWageOption,
    employeePfCeiling: input.employee.employeePfCeiling,
    vpfRate: input.employee.vpfRate,
    epsEligible: input.employee.epsEligible,
    internationalWorker: input.employee.internationalWorker,
  });
  const esiBreakup = calculateESI({
    esiGross: esiContributionWage,
    contributionWage: esiContributionWage,
    rule: settings.esi,
    employeeApplicable: input.employee.esiApplicable !== false,
    coverageWage: esiCoverageEligibilityWage,
    contributionPeriodCovered: input.esiContributionPeriodCovered,
    coveragePeriod: input.esiCoveragePeriod,
    payrollMonth: input.payrollMonth,
    payrollYear: input.payrollYear,
  });
  warnings.push(...pfBreakup.warnings, ...esiBreakup.warnings);
  const ptBreakup = calculateProfessionalTax({
    state: input.state,
    grossSalary: earnedGross,
    month: input.payrollMonth,
    annualSalary: earnedGross * 12,
    gender: input.employee.gender,
  });
  const effectivePtBreakup = payrollOptions.ptApplicable
    ? ptBreakup
    : {
        amount: 0,
        state: input.state,
        ruleApplied: "PT not applicable for this employee salary structure.",
        frequency: "not-applicable" as const,
      };
  const lwfBreakup = calculateLWF({
    state: input.state,
    month: input.payrollMonth,
    grossSalary: earnedGross,
  });
  const effectiveLwfBreakup = payrollOptions.lwfApplicable
    ? lwfBreakup
    : {
        employeeContribution: 0,
        employerContribution: 0,
        totalContribution: 0,
        frequency: "not-applicable" as const,
        ruleApplied: "LWF not applicable for this employee salary structure.",
      };
  const bonusBreakup = calculateBonus({
    basic: bonusWage,
    da: 0,
    rule: settings.bonus,
    applicableMinimumWage: input.employee.stateMinimumWage,
    bonusPaidThisMonth: bonus,
  });
  const bonusPaid = bonus > 0;
  const bonusProvision = bonusPaid
    ? 0
    : Number(bonusBreakup.monthlyBonusProvision || bonusBreakup.bonusAmount);
  const gratuityBreakup = calculateGratuity({
    basic: gratuityWage,
    da: 0,
    gratuityWage,
    dateOfJoining: input.employee.dateOfJoining,
    asOfDate: new Date(input.payrollYear, input.payrollMonth, 0),
    override: input.employee.gratuityOverride,
    rule: settings.gratuity,
  });
  const tdsRegime = input.tdsInput?.regime || settings.tds.defaultRegime;
  const standardDeduction =
    input.tdsInput?.standardDeduction ??
    settings.tds.standardDeduction ??
    settings.tds.standardDeductionByRegime[tdsRegime] ??
    0;
  const remainingFixedMonths = Math.max(
    12 - getFinancialYearMonthIndex(input.payrollMonth),
    0
  );
  const tdsProjection = projectAnnualTaxableIncome({
    financialYear: getFinancialYear(input.payrollYear, input.payrollMonth),
    payrollMonth: input.payrollMonth,
    payrollYear: input.payrollYear,
    currentMonthTaxableSalary,
    projectedRemainingFixedSalary:
      scheduledMonthlyFixedTaxableSalary * remainingFixedMonths,
    expectedBonus: Number(bonusBreakup.annualStatutoryBonus || 0),
    arrears,
    standardDeduction,
    employeeTaxProfile: input.taxProfile,
    taxDeclarationItems:
      input.taxDeclarationItems || input.tdsInput?.taxDeclarationItems,
    proofCutoffMonth: 1,
  });
  warnings.push(...tdsProjection.warnings);
  const tdsBreakup = payrollOptions.tdsApplicable
    ? calculateTDS({
        annualGross: tdsProjection.annualGrossIncome,
        deductions: input.tdsInput?.deductions || 0,
        regime: tdsRegime,
        professionalTax: effectivePtBreakup.amount * 12,
        alreadyDeductedTDS:
          input.tdsInput?.alreadyDeductedTDS ||
          tdsProjection.previousEmployerTDS + tdsProjection.yearToDateTDS,
        remainingMonths:
          input.tdsInput?.remainingMonths ||
          tdsProjection.remainingPayrollMonths,
        declarationAmount:
          input.tdsInput?.declarationAmount ||
          tdsProjection.declarationDeduction,
        proofVerifiedAmount: input.tdsInput?.proofVerifiedAmount,
        taxDeclarationItems:
          input.taxDeclarationItems || input.tdsInput?.taxDeclarationItems,
        standardDeduction,
      taxSlabs:
          input.tdsInput?.taxSlabs ||
          settings.tds.taxSlabsByRegime[
            tdsRegime
          ],
        rebateRule:
          input.tdsInput?.rebateRule ||
          settings.tds.rebateByRegime[
            tdsRegime
          ],
        surchargeSlabs:
          input.tdsInput?.surchargeSlabs ||
          settings.tds.surchargeSlabsByRegime[
            tdsRegime
          ],
        rebateEligible: input.tdsInput?.rebateEligible,
        cessRate: input.tdsInput?.cessRate ?? settings.tds.cessRate,
      })
    : {
        monthlyTDS: 0,
        annualTaxableIncome: 0,
        annualTax: 0,
        balanceTax: 0,
        baseTax: 0,
        rebate87A: 0,
        surcharge: 0,
        marginalRelief: 0,
        cess: 0,
        regime: settings.tds.defaultRegime,
        ruleApplied: "TDS not applicable for this employee salary structure.",
      };

  const manualDeductions = input.salaryStructure.deductions || {};
  const deductions: PayrollDeductions = {
    lop: roundMoney(lopDeduction),
    employeePF: Number(pfBreakup.totalEmployeeContribution),
    employeeESI: Number(esiBreakup.employeeESI),
    professionalTax: effectivePtBreakup.amount,
    employeeLWF: effectiveLwfBreakup.employeeContribution,
    tds: roundMoney(manualDeductions.tds ?? tdsBreakup.monthlyTDS),
    loan: roundMoney(
      toAmount(manualDeductions.loan) + toAmount(attendance.loanDeduction)
    ),
    advance: roundMoney(
      toAmount(manualDeductions.advance) + toAmount(attendance.advanceDeduction)
    ),
    otherDeductions: roundMoney(
      toAmount(manualDeductions.otherDeductions) +
        toAmount(attendance.otherDeduction)
    ),
    totalDeductions: 0,
    totalEmployeeDeductions: 0,
  };
  deductions.totalEmployeeDeductions = roundMoney(
    deductions.employeePF +
      deductions.employeeESI +
      deductions.professionalTax +
      deductions.employeeLWF +
      toAmount(deductions.tds) +
      deductions.loan +
      deductions.advance +
      deductions.otherDeductions
  );
  deductions.totalDeductions = deductions.totalEmployeeDeductions;

  if (deductions.totalEmployeeDeductions - earnedGross > 0.01) {
    throw new PayrollValidationError([
      "Total employee deductions cannot exceed earned gross salary.",
    ]);
  }

  const standardPfBreakup = calculatePF({
    basic,
    da,
    pfWage: calculateStatutoryWage({
      earnings: scheduledComponentAmounts,
      rules: settings.salaryComponents,
      wageType: "pfWage",
      asOf: asOfRuleDate,
    }),
    rule: settings.pf,
    employeeApplicable: input.employee.pfApplicable !== false,
    pfExcludedEmployee: input.employee.pfExcludedEmployee,
    existingPfMember: input.employee.existingPfMember,
    pfHigherWageOption: input.employee.pfHigherWageOption,
    employeePfCeiling: input.employee.employeePfCeiling,
    vpfRate: input.employee.vpfRate,
    epsEligible: input.employee.epsEligible,
    internationalWorker: input.employee.internationalWorker,
  });
  const standardEsiContributionWage = calculateStatutoryWage({
    earnings: scheduledComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "esiContributionWage",
    asOf: asOfRuleDate,
  });
  const standardEsiCoverageWage = calculateStatutoryWage({
    earnings: scheduledComponentAmounts,
    rules: settings.salaryComponents,
    wageType: "esiCoverageWage",
    asOf: asOfRuleDate,
  });
  const standardEsiBreakup = calculateESI({
    esiGross: standardEsiContributionWage,
    contributionWage: standardEsiContributionWage,
    rule: settings.esi,
    employeeApplicable: input.employee.esiApplicable !== false,
    coverageWage: standardEsiCoverageWage,
    contributionPeriodCovered: input.esiContributionPeriodCovered,
    coveragePeriod: input.esiCoveragePeriod,
    payrollMonth: input.payrollMonth,
    payrollYear: input.payrollYear,
  });
  const standardLwfBreakup = payrollOptions.lwfApplicable
    ? calculateLWF({
        state: input.state,
        month: input.payrollMonth,
        grossSalary: scheduledGross,
      })
    : {
        employeeContribution: 0,
        employerContribution: 0,
        totalContribution: 0,
        frequency: "not-applicable" as const,
        ruleApplied: "LWF not applicable for this employee salary structure.",
      };
  const monthlyGratuityProvision = Number(
    gratuityBreakup.monthlyGratuityProvision
  );
  const estimatedAccruedGratuity = Number(
    gratuityBreakup.estimatedAccruedGratuity
  );

  const employerContributions = {
    employerPF: Number(pfBreakup.employerPF),
    employerEPF: Number(pfBreakup.employerEPF),
    employerEPS: Number(pfBreakup.employerEPS),
    employerEDLI: Number(pfBreakup.employerEDLI),
    epfAdministrativeCharges: Number(pfBreakup.administrativeCharges),
    employerESI: Number(esiBreakup.employerESI),
    employerLWF: effectiveLwfBreakup.employerContribution,
    gratuityProvision: monthlyGratuityProvision,
    monthlyGratuityProvision,
    estimatedAccruedGratuity,
    bonusProvision,
    totalEmployerContribution: 0,
    totalEmployerContributions: 0,
  };
  employerContributions.totalEmployerContribution = roundMoney(
    employerContributions.employerPF +
      employerContributions.employerESI +
      employerContributions.employerLWF +
      employerContributions.gratuityProvision +
      employerContributions.bonusProvision
  );
  employerContributions.totalEmployerContributions =
    employerContributions.totalEmployerContribution;

  const standardEmployerContributions = roundMoney(
    Number(standardPfBreakup.employerPF) +
      Number(standardEsiBreakup.employerESI) +
      standardLwfBreakup.employerContribution +
      monthlyGratuityProvision +
      bonusProvision
  );
  const standardMonthlyCTC = roundMoney(
    scheduledGross + standardEmployerContributions
  );
  const actualPayrollCost = roundMoney(
    earnedGross + employerContributions.totalEmployerContribution
  );
  const configuredMonthlyCTC = input.salaryStructure.ctc;

  if (
    configuredMonthlyCTC !== undefined &&
    Math.abs(standardMonthlyCTC - configuredMonthlyCTC) >
      PAYROLL_AMOUNT_TOLERANCE
  ) {
    warnings.push(
      `Calculated monthly CTC ${standardMonthlyCTC} does not match configured CTC ${roundMoney(
        configuredMonthlyCTC
      )}.`
    );
  }

  const netSalary = roundMoney(earnedGross - deductions.totalEmployeeDeductions);

  if (
    Math.abs(
      roundMoney(earnedGross - deductions.totalEmployeeDeductions) - netSalary
    ) > 0.01
  ) {
    warnings.push("Net salary reconciliation difference exceeds 0.01.");
  }

  const earnings: PayrollEarnings = {
    ...configuredEarnings,
    basic: roundMoney(
      salaryType === "MONTHLY" ? actualBasic : regularEarnings
    ),
    hra: roundMoney(
      salaryType === "MONTHLY" ? earnedMonthlyFixedComponents.hra : 0
    ),
    da: roundMoney(salaryType === "MONTHLY" ? actualDa : 0),
    conveyance: roundMoney(
      salaryType === "MONTHLY" ? earnedMonthlyFixedComponents.conveyance : 0
    ),
    medical: roundMoney(
      salaryType === "MONTHLY" ? earnedMonthlyFixedComponents.medical : 0
    ),
    specialAllowance: roundMoney(
      salaryType === "MONTHLY"
        ? earnedMonthlyFixedComponents.specialAllowance
        : 0
    ),
    incentive,
    overtime,
    bonus,
    arrears,
    reimbursement,
    otherEarnings,
    scheduledGross: roundMoney(scheduledGross),
    lopEligibleGross: roundMoney(lopEligibleGross),
    lopDeduction: roundMoney(lopDeduction),
    earnedFixedSalary: roundMoney(earnedFixedSalary),
    regularEarnings: roundMoney(regularEarnings),
    oneTimeEarnings,
    earnedGross,
    grossEarnings: earnedGross,
  };

  return {
    employee: input.employee,
    salaryType,
    state: input.state,
    month: input.payrollMonth,
    year: input.payrollYear,
    attendance: {
      monthDays: attendance.monthDays,
      calendarDays: attendance.monthDays,
      scheduledWorkingDays: roundMoney(
        attendance.monthDays - attendance.weeklyOff - attendance.paidHolidays
      ),
      paidWeeklyOffDays: attendance.weeklyOff,
      paidHolidayDays: attendance.paidHolidays,
      workedDays: attendance.presentDays,
      paidLeaveDays: attendance.paidLeave,
      unpaidLeaveDays: attendance.unpaidLeave,
      accountedDays,
      payableDays,
      lopDays,
      workedHours,
      overtimeHours,
    },
    earnings,
    deductions,
    employeeDeductions: deductions,
    employerContributions,
    totals: {
      netSalary,
      standardMonthlyCTC,
      actualPayrollCost,
    },
    netSalary,
    ctc: standardMonthlyCTC,
    standardMonthlyCTC,
    actualPayrollCost,
    payableDays,
    lopDays,
    perDaySalary: roundMoney(perDaySalary),
    validationErrors: [],
    warnings,
    ruleBreakup: {
      pf: pfBreakup,
      esi: esiBreakup,
      professionalTax: effectivePtBreakup,
      lwf: effectiveLwfBreakup,
      bonus: {
        ...bonusBreakup,
        bonusPaid,
        bonusEarning: bonus,
        bonusProvision,
        ruleApplied: bonusPaid
          ? "Bonus paid in current payroll, so monthly bonus provision is not added."
          : bonusBreakup.ruleApplied,
      },
      gratuity: gratuityBreakup,
      overtime:
        salaryType === "HOURLY"
          ? {
              applicable: settings.ot.otApplicable && overtimeHours > 0,
              hourlyRate: roundMoney(hourlyRate),
              calculatedOvertimeAmount: calculatedOvertime,
              approvedOvertimeAmount: roundMoney(
                toAmount(attendance.approvedOvertimeAmount ?? calculatedOvertime)
              ),
              manualOvertimeAdjustment: roundMoney(
                toAmount(configuredEarnings.overtime) +
                  toAmount(attendance.manualOvertimeAdjustment)
              ),
              overtimeHours: roundMoney(overtimeHours),
              overtimeMultiplier,
              otAmount: overtime,
              ruleApplied:
                "Hourly OT Amount = Overtime Hours x Hourly Rate x OT Multiplier.",
            }
          : otBreakup,
      incentives: {
        fixedIncentive: roundMoney(
          toAmount(configuredEarnings.incentive) +
            toAmount(attendance.fixedIncentive)
        ),
        attendanceIncentive: roundMoney(attendance.attendanceIncentive || 0),
        performanceIncentive: roundMoney(attendance.performanceIncentive || 0),
        salesIncentive: roundMoney(attendance.salesIncentive || 0),
        manualIncentiveAdjustment: roundMoney(
          toAmount(attendance.manualIncentiveAdjustment) +
            toAmount(attendance.incentive)
        ),
        totalIncentive: incentive,
        ruleApplied:
          "Incentives are split by source so approved variable earnings are not counted twice.",
      },
      lop: {
        salaryDivisor: roundMoney(salaryDivisor),
        lopEligibleGross: roundMoney(lopEligibleGross),
        perDaySalary: roundMoney(perDaySalary),
        lopDays,
        lopDeduction: roundMoney(lopDeduction),
        earnedFixedSalary: roundMoney(earnedFixedSalary),
        earnedGross,
        ruleApplied:
          salaryType === "MONTHLY"
            ? "LOP Deduction = LOP Eligible Gross / Salary Divisor x LOP Days."
            : "LOP reflected through payable days for this salary type.",
      },
      tds: tdsBreakup,
    },
    statutoryRuleVersions: {
      PF: `${settings.pf.ruleId}@${settings.pf.version}`,
      ESI: `${settings.esi.ruleId}@${settings.esi.version}`,
      BONUS: `${settings.bonus.ruleId}@${settings.bonus.version}`,
      GRATUITY: `${settings.gratuity.ruleId}@${settings.gratuity.version}`,
      TDS: `${settings.tds.ruleId}@${settings.tds.version}`,
      PT: `${effectivePtBreakup.state}:${effectivePtBreakup.ruleApplied}`,
      LWF: effectiveLwfBreakup.ruleApplied,
    },
  };
};
