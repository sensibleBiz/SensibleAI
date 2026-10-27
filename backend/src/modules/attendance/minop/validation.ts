import {
  MAX_DVC_IP_LENGTH,
  MAX_INTEGRATION_KEY_LENGTH,
  MAX_PUNCH_ID_LENGTH,
  MAX_TXN_ID_LENGTH,
} from "./constants.js";

export const normalizeText = (value: unknown) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

export const normalizePunchId = (punchId: unknown) => {
  if (typeof punchId === "string") return punchId.trim();
  return punchId;
};

export const getIntegrationKey = (data: Record<string, unknown> | null | undefined) => {
  if (!data) return "";
  return normalizeText(
    data.integrationKey ||
    data.dvcSrNo ||
    data.dvcId ||
    data.deviceId ||
    data.deviceSrNo ||
    data.deviceSerialNo ||
    data.serialNo,
  );
};

export const getTransactionDateTime = (transaction: Record<string, unknown>) => {
  const mode = normalizeText(transaction.mode).toUpperCase();
  let modeTime: unknown = null;
  if (mode === "IN") modeTime = transaction.checkInTime;
  else if (mode === "OUT") modeTime = transaction.checkOutTime;
  if (modeTime !== undefined && modeTime !== null && modeTime !== "") return modeTime;
  return transaction.txnDateTime;
};

const isValidTransactionDateTime = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return typeof value === "string" && value.trim().length > 0;
};

export const validateTransaction = (transaction: unknown) => {
  if (!transaction || typeof transaction !== "object") {
    return { valid: false as const, reason: "transaction must be an object" };
  }
  const record = transaction as Record<string, unknown>;
  if (record.txnId === undefined || record.txnId === null) {
    return { valid: false as const, reason: "txnId is required" };
  }
  if (normalizeText(record.txnId).length > MAX_TXN_ID_LENGTH) {
    return { valid: false as const, reason: "txnId exceeds maximum length" };
  }
  if (record.punchId === undefined || record.punchId === null || record.punchId === "") {
    return { valid: false as const, reason: "punchId is required" };
  }
  if (normalizeText(record.punchId).length > MAX_PUNCH_ID_LENGTH) {
    return { valid: false as const, reason: "punchId exceeds maximum length" };
  }
  if (
    record.dvcIP !== undefined &&
    record.dvcIP !== null &&
    normalizeText(record.dvcIP).length > MAX_DVC_IP_LENGTH
  ) {
    return { valid: false as const, reason: "dvcIP exceeds maximum length" };
  }
  if (getIntegrationKey(record).length > MAX_INTEGRATION_KEY_LENGTH) {
    return { valid: false as const, reason: "integrationKey exceeds maximum length" };
  }
  if (!record.mode || typeof record.mode !== "string") {
    return { valid: false as const, reason: "mode is required" };
  }
  const mode = record.mode.trim().toUpperCase();
  if (mode !== "IN" && mode !== "OUT") {
    return { valid: false as const, reason: "mode must be IN or OUT" };
  }
  if (!isValidTransactionDateTime(getTransactionDateTime(record))) {
    return {
      valid: false as const,
      reason: mode === "IN"
        ? "checkInTime or txnDateTime is required"
        : "checkOutTime or txnDateTime is required",
    };
  }
  return { valid: true as const };
};

export const isJsonParseError = (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    "type" in error &&
    (error as { type?: string }).type === "entity.parse.failed" &&
    error instanceof SyntaxError,
  );
