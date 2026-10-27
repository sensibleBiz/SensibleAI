import type { MinimumWageRule } from "../types.js";

export const MINIMUM_WAGE_RULE_MASTER: MinimumWageRule[] = [
  {
    ruleId: "minimum-wage-default-2026-v1",
    ruleType: "MINIMUM_WAGE",
    stateCode: "DEFAULT",
    scheduledEmployment: "GENERAL",
    skillCategory: "GENERAL",
    monthlyMinimumWage: 0,
    effectiveFrom: Date.UTC(2026, 3, 1),
    version: "2026.1",
    createdAt: Date.UTC(2026, 3, 1),
    createdBy: "system",
    notificationReference:
      "Outlet-specific minimum wage rules should be configured from state notifications.",
  },
];

export const findMinimumWageRule = ({
  stateCode,
  scheduledEmployment = "GENERAL",
  skillCategory = "GENERAL",
  asOf = Date.now(),
}: {
  stateCode: string;
  scheduledEmployment?: string | undefined;
  skillCategory?: string | undefined;
  asOf?: number | undefined;
}) =>
  MINIMUM_WAGE_RULE_MASTER.filter(
    (rule) =>
      (rule.stateCode === stateCode || rule.stateCode === "DEFAULT") &&
      rule.scheduledEmployment === scheduledEmployment &&
      rule.skillCategory === skillCategory &&
      rule.effectiveFrom <= asOf &&
      (rule.effectiveTo === undefined || rule.effectiveTo >= asOf)
  )
    .sort((left, right) => left.effectiveFrom - right.effectiveFrom)
    .pop();

