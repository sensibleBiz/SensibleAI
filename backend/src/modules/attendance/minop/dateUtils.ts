import { DateTime } from "luxon";
import {
  DEFAULT_ALLOW_CROSS_MIDNIGHT_CHECKOUT,
  DEFAULT_CROSS_MIDNIGHT_CHECKOUT_MAX_HOURS,
  DEFAULT_DELAYED_PUNCH_LOG_AFTER_MINUTES,
  DEFAULT_MAX_FUTURE_MINUTES,
  DEFAULT_MAX_PAST_DAYS,
  DEFAULT_TIMEZONE,
} from "./constants.js";
import { normalizeText } from "./validation.js";

export { DateTime };

export const getConfiguredTimezone = (
  integration: Record<string, unknown> | null,
  outlet: Record<string, unknown> | null,
) => {
  const configuredTimezone = normalizeText(
    (integration && integration.timezone) || (outlet && outlet.timezone),
  ) || DEFAULT_TIMEZONE;
  if (DateTime.now().setZone(configuredTimezone).isValid) return configuredTimezone;
  return DEFAULT_TIMEZONE;
};

const getUnixMilliseconds = (value: unknown, normalizedValue: string) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (!/^\d+$/.test(normalizedValue)) return null;
  const milliseconds = Number(normalizedValue);
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : null;
};

const toZonedDateParts = (dateTime: DateTime) => ({
  milliseconds: dateTime.toMillis(),
  dayId: dateTime.toFormat("dd-MM-yyyy"),
  monthId: dateTime.toFormat("MM-yyyy"),
  yearId: dateTime.toFormat("yyyy"),
});

export const parseZonedDateTime = (value: unknown, timezone: string) => {
  const dateTimeText = String(value).trim();
  const zone = timezone || DEFAULT_TIMEZONE;
  const milliseconds = getUnixMilliseconds(value, dateTimeText);
  if (milliseconds !== null) {
    const parsed = DateTime.fromMillis(milliseconds, { zone });
    return parsed.isValid ? toZonedDateParts(parsed) : null;
  }
  const hasExplicitZone = /(Z|[+-]\d{2}:\d{2})$/i.test(dateTimeText);
  if (hasExplicitZone) {
    const parsed = DateTime.fromISO(dateTimeText, { setZone: true });
    return parsed.isValid ? toZonedDateParts(parsed.setZone(zone)) : null;
  }
  const formats = [
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd HH:mm:ss.SSS",
    "yyyy-MM-dd'T'HH:mm:ss",
    "yyyy-MM-dd'T'HH:mm:ss.SSS",
  ];
  for (const format of formats) {
    const parsed = DateTime.fromFormat(dateTimeText, format, { zone, setZone: true });
    if (parsed.isValid) return toZonedDateParts(parsed);
  }
  return null;
};

const getPositiveNumberConfig = (
  integration: Record<string, unknown> | null,
  outlet: Record<string, unknown> | null,
  fieldNames: string[],
  fallbackValue: number,
) => {
  for (const fieldName of fieldNames) {
    for (const source of [integration, outlet]) {
      if (!source || source[fieldName] === undefined || source[fieldName] === null) continue;
      const numberValue = Number(source[fieldName]);
      if (Number.isFinite(numberValue) && numberValue >= 0) return numberValue;
    }
  }
  return fallbackValue;
};

const getBooleanConfig = (
  integration: Record<string, unknown> | null,
  outlet: Record<string, unknown> | null,
  fieldNames: string[],
  fallbackValue: boolean,
) => {
  for (const fieldName of fieldNames) {
    for (const source of [integration, outlet]) {
      if (!source || source[fieldName] === undefined || source[fieldName] === null) continue;
      return source[fieldName] === true;
    }
  }
  return fallbackValue;
};

export const getTimestampPolicy = (
  integration: Record<string, unknown> | null,
  outlet: Record<string, unknown> | null,
) => ({
  maxFutureMinutes: getPositiveNumberConfig(
    integration, outlet, ["maxFutureMinutes", "maxFutureSkewMinutes", "futureSkewMinutes"],
    DEFAULT_MAX_FUTURE_MINUTES,
  ),
  maxPastDays: getPositiveNumberConfig(
    integration, outlet, ["maxPastDays", "pastAllowanceDays", "offlinePastAllowanceDays"],
    DEFAULT_MAX_PAST_DAYS,
  ),
  delayedPunchLogAfterMinutes: getPositiveNumberConfig(
    integration, outlet, ["delayedPunchLogAfterMinutes", "delayedLogAfterMinutes"],
    DEFAULT_DELAYED_PUNCH_LOG_AFTER_MINUTES,
  ),
});

export const getPunchOrderingPolicy = (
  integration: Record<string, unknown> | null,
  outlet: Record<string, unknown> | null,
) => ({
  allowCrossMidnightCheckout: getBooleanConfig(
    integration, outlet, ["allowCrossMidnightCheckout", "enableCrossMidnightCheckout"],
    DEFAULT_ALLOW_CROSS_MIDNIGHT_CHECKOUT,
  ),
  crossMidnightCheckoutMaxHours: getPositiveNumberConfig(
    integration, outlet, ["crossMidnightCheckoutMaxHours", "nightShiftMaxHours"],
    DEFAULT_CROSS_MIDNIGHT_CHECKOUT_MAX_HOURS,
  ),
});

export const validateTimestampPolicy = (milliseconds: number, policy: ReturnType<typeof getTimestampPolicy>) => {
  const now = Date.now();
  const ageMinutes = (now - milliseconds) / (60 * 1000);
  const maxPastMinutes = policy.maxPastDays * 24 * 60;
  if (ageMinutes < -policy.maxFutureMinutes) {
    return { valid: false, reason: "timestamp is too far in the future", ageMinutes };
  }
  if (ageMinutes > maxPastMinutes) {
    return { valid: false, reason: "timestamp is older than allowed window", ageMinutes };
  }
  return {
    valid: true,
    delayed: ageMinutes > policy.delayedPunchLogAfterMinutes,
    ageMinutes,
  };
};

export const getTimestampMillis = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};
