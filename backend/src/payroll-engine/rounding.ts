export type MoneyInPaise = number;

export type PayrollRoundingKey =
  | "employeePF"
  | "employerEPF"
  | "employerEPS"
  | "employerEDLI"
  | "epfAdministrativeCharges"
  | "employeeESI"
  | "employerESI"
  | "pt"
  | "lwf"
  | "tds"
  | "bonus"
  | "gratuity"
  | "netSalary"
  | "default";

export const PAYROLL_ROUNDING_RULES: Record<
  PayrollRoundingKey,
  "PAISE" | "RUPEE_NEAREST"
> = {
  employeePF: "RUPEE_NEAREST",
  employerEPF: "RUPEE_NEAREST",
  employerEPS: "RUPEE_NEAREST",
  employerEDLI: "RUPEE_NEAREST",
  epfAdministrativeCharges: "RUPEE_NEAREST",
  employeeESI: "RUPEE_NEAREST",
  employerESI: "RUPEE_NEAREST",
  pt: "RUPEE_NEAREST",
  lwf: "PAISE",
  tds: "PAISE",
  bonus: "PAISE",
  gratuity: "PAISE",
  netSalary: "PAISE",
  default: "PAISE",
};

const normalizeMoney = (value: number): number =>
  Number.isFinite(value) ? value : 0;

export const toPaise = (value: number): MoneyInPaise =>
  Math.round(normalizeMoney(value) * 100);

export const fromPaise = (value: MoneyInPaise): number =>
  Math.round(normalizeMoney(value) as number) / 100;

export const roundPayrollAmount = (
  value: number,
  key: PayrollRoundingKey = "default"
): number => {
  const rule = PAYROLL_ROUNDING_RULES[key];

  if (rule === "RUPEE_NEAREST") {
    return Math.round(normalizeMoney(value));
  }

  return fromPaise(toPaise(value));
};

export const addMoney = (...values: number[]): number =>
  fromPaise(values.reduce((total, value) => total + toPaise(value), 0));

