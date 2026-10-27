import type {
  SalaryComponentKey,
  SalaryComponentRule,
  SalaryEarnings,
} from "./types";
import { roundMoney, toAmount } from "./utils";

const componentKeys: SalaryComponentKey[] = [
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

export const getApplicableComponentRule = (
  rules: SalaryComponentRule[],
  key: SalaryComponentKey,
  asOf = Date.now()
): SalaryComponentRule | undefined =>
  rules
    .filter((rule) => {
      if (rule.key !== key) return false;
      if (rule.effectiveFrom !== undefined && rule.effectiveFrom > asOf) {
        return false;
      }
      if (rule.effectiveTo !== undefined && rule.effectiveTo < asOf) {
        return false;
      }
      return true;
    })
    .sort((left, right) => (left.effectiveFrom || 0) - (right.effectiveFrom || 0))
    .pop();

export const sumComponentsByRule = ({
  earnings,
  rules,
  predicate,
  asOf,
}: {
  earnings: Partial<SalaryEarnings>;
  rules: SalaryComponentRule[];
  predicate: (rule: SalaryComponentRule) => boolean;
  asOf?: number;
}): number =>
  roundMoney(
    componentKeys.reduce((total, key) => {
      const rule = getApplicableComponentRule(rules, key, asOf);
      const value = toAmount(earnings[key]);

      if (!rule || value <= 0 || !predicate(rule)) {
        return total;
      }

      return total + value;
    }, 0)
  );

export const calculateStatutoryWage = ({
  earnings,
  rules,
  wageType,
  asOf,
}: {
  earnings: Partial<SalaryEarnings>;
  rules: SalaryComponentRule[];
  wageType:
    | "taxable"
    | "pfWage"
    | "esiContributionWage"
    | "esiCoverageWage"
    | "bonusWage"
    | "gratuityWage"
    | "lopApplicable"
    | "overtimeApplicable";
  asOf?: number;
}): number =>
  sumComponentsByRule({
    earnings,
    rules,
    asOf,
    predicate: (rule) => Boolean(rule[wageType]),
  });

