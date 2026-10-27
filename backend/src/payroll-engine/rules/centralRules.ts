import type {
  BonusRule,
  ESIRule,
  GratuityRule,
  LeaveLOPRule,
  OTRule,
  PFRule,
  TDSRule,
} from "../types.js";

export const PF_RULE_MASTER: PFRule = {
  ruleId: "pf-central-2026-v1",
  version: "2026.1",
  effectiveFrom: Date.UTC(2026, 3, 1),
  notificationReference: "EPFO FAQ: EPF/EPS/EDLI and administrative charges",
  pfApplicable: true,
  pfCeilingApplicable: true,
  pfCeilingAmount: 15000,
  employeePfRate: 12,
  employerPfRate: 12,
  epsRate: 8.33,
  edliRate: 0.5,
  edliWageCeiling: 15000,
  epfAdministrativeChargeRate: 0.5,
};

export const ESI_RULE_MASTER: ESIRule = {
  ruleId: "esi-central-2026-v1",
  version: "2026.1",
  effectiveFrom: Date.UTC(2026, 3, 1),
  notificationReference: "ESI Act and contribution-rate notifications",
  esiApplicable: true,
  esiWageLimit: 21000,
  employeeEsiRate: 0.75,
  employerEsiRate: 3.25,
};

export const BONUS_RULE_MASTER: BonusRule = {
  ruleId: "bonus-central-2026-v1",
  version: "2026.1",
  effectiveFrom: Date.UTC(2026, 3, 1),
  notificationReference: "Payment of Bonus (Amendment) Act, 2015",
  bonusApplicable: true,
  eligibilityWageLimit: 21000,
  bonusEligibilityWageLimit: 21000,
  statutoryWageCeiling: 7000,
  statutoryCalculationCeiling: 7000,
  applicableMinimumWage: 0,
  minimumBonusRate: 8.33,
  maximumBonusRate: 20,
  bonusRate: 8.33,
  daysInAccountingYear: 365,
};

export const GRATUITY_RULE_MASTER: GratuityRule = {
  ruleId: "gratuity-central-2026-v1",
  version: "2026.1",
  effectiveFrom: Date.UTC(2026, 3, 1),
  notificationReference: "Payment of Gratuity Act, 1972",
  gratuityApplicable: true,
  eligibleAfterYears: 5,
  payableDays: 15,
  serviceMonthRoundUpAfter: 6,
  daysInMonthForFormula: 26,
  taxExemptionLimit: 2000000,
};

export const OT_RULE_MASTER: OTRule = {
  otApplicable: true,
  otMultiplier: 2,
  otBase: "BASIC_DA",
  workingDays: 26,
  workingHoursPerDay: 8,
};

export const LEAVE_LOP_RULE_MASTER: LeaveLOPRule = {
  lopApplicable: true,
  includeWeeklyOffInPayableDays: true,
  includePaidHolidaysInPayableDays: true,
};

export const TDS_RULE_MASTER: TDSRule = {
  ruleId: "tds-fy-2025-26-new-regime-v1",
  version: "2025-26.1",
  effectiveFrom: Date.UTC(2025, 3, 1),
  notificationReference: "Income-tax AY 2026-27 salaried individual slabs",
  tdsApplicable: true,
  standardDeductionByRegime: {
    old: 50000,
    new: 75000,
  },
  defaultRegime: "new",
  cessRate: 4,
  taxSlabsByRegime: {
    old: [
      { upto: 250000, rate: 0 },
      { upto: 500000, rate: 5 },
      { upto: 1000000, rate: 20 },
      { upto: null, rate: 30 },
    ],
    new: [
      { upto: 400000, rate: 0 },
      { upto: 800000, rate: 5 },
      { upto: 1200000, rate: 10 },
      { upto: 1600000, rate: 15 },
      { upto: 2000000, rate: 20 },
      { upto: 2400000, rate: 25 },
      { upto: null, rate: 30 },
    ],
  },
  rebateByRegime: {
    old: {
      taxableIncomeLimit: 500000,
      maximumRebate: 12500,
    },
    new: {
      taxableIncomeLimit: 1200000,
      maximumRebate: 60000,
    },
  },
  surchargeSlabsByRegime: {
    old: [
      { threshold: 5000000, rate: 10 },
      { threshold: 10000000, rate: 15 },
      { threshold: 20000000, rate: 25 },
      { threshold: 50000000, rate: 37 },
    ],
    new: [
      { threshold: 5000000, rate: 10 },
      { threshold: 10000000, rate: 15 },
      { threshold: 20000000, rate: 25 },
    ],
  },
};
