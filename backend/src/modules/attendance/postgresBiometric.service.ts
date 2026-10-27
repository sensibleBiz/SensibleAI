import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { SOURCE } from "./biometricConstants.js";
import type { PostgresBiometricTransaction } from "./biometric.types.js";
import { PostgresAttendanceRepository, postgresAttendanceRepository } from "./postgresAttendance.repository.js";

const ATTENDANCE_TIME_ZONE = "Asia/Kolkata";

const formatDayId = (timestamp: number) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ATTENDANCE_TIME_ZONE,
  }).formatToParts(new Date(timestamp));
  const readPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${readPart("day")}-${readPart("month")}-${readPart("year")}`;
};

const parseTimestampMillis = (value: string | number) => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    const milliseconds = Number(text);
    return Number.isSafeInteger(milliseconds) && milliseconds > 0 ? milliseconds : null;
  }
  const parsed = Date.parse(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const monthIdFromDayId = (dayId: string) => `${dayId.slice(6, 10)}-${dayId.slice(3, 5)}`;

export const BIOMETRIC_INGEST_BOOTSTRAP_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const BIOMETRIC_INGEST_SYSTEM_USER_ID = "00000000-0000-4000-8000-00000000000b";

export class PostgresBiometricService {
  constructor(private readonly repository: PostgresAttendanceRepository = postgresAttendanceRepository) {}

  async resolveTenantId(database: TransactionDatabase, outletId: string) {
    const result = await database.client.query<{ tenant_id: string }>(
      "SELECT tenant_id FROM tenancy.outlets WHERE id = $1 AND active LIMIT 1",
      [outletId],
    );
    return result.rows[0]?.tenant_id ?? null;
  }

  async processTransactions(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    transactions: PostgresBiometricTransaction[],
  ) {
    const businessId = await this.repository.resolveOutletBusiness(database, tenantId, outletId);
    if (!businessId) return transactions.map((transaction) => ({ txnId: transaction.txnId, status: 0 }));

    const transStatus = [];
    for (const transaction of transactions) {
      transStatus.push({
        txnId: transaction.txnId,
        status: await this.processOne(database, tenantId, businessId, outletId, transaction),
      });
    }
    return transStatus;
  }

  private async processOne(
    database: TransactionDatabase,
    tenantId: string,
    businessId: string,
    outletId: string,
    transaction: PostgresBiometricTransaction,
  ) {
    const eventAtMs = parseTimestampMillis(transaction.txnDateTime);
    if (!eventAtMs) return 0;

    const empCode = String(transaction.punchId).trim();
    const users = await this.repository.findActiveUsersByEmpCode(database, tenantId, outletId, empCode);
    if (users.length !== 1) return 0;

    const userId = users[0]!.userId;
    const dayId = formatDayId(eventAtMs);
    const deviceId = String(transaction.dvcId ?? transaction.integrationKey ?? "MINOP").trim() || "MINOP";
    const externalEventId = `${deviceId}_${transaction.txnId}`;

    const inserted = await this.repository.insertEvent(database, {
      id: uuidv7(),
      tenantId,
      businessId,
      outletId,
      userId,
      deviceId,
      deviceUserId: empCode,
      eventType: transaction.mode,
      eventAt: new Date(eventAtMs),
      source: SOURCE,
      externalEventId,
    });
    if (!inserted) return 1;

    let effectiveMode = transaction.mode;
    const existing = await this.repository.getDailyForUserDay(database, tenantId, outletId, userId, dayId);
    if (
      effectiveMode === "IN" &&
      existing?.checkInTime &&
      !existing.checkOutTime
    ) {
      effectiveMode = "OUT";
    }

    const member = users[0]!;
    await this.repository.upsertDailyFromPunch(database, {
      id: existing?.id ?? uuidv7(),
      tenantId,
      businessId,
      outletId,
      userId,
      dayId,
      monthId: monthIdFromDayId(dayId),
      yearId: dayId.slice(6, 10),
      checkInTime: effectiveMode === "IN" ? eventAtMs : null,
      checkOutTime: effectiveMode === "OUT" ? eventAtMs : null,
      empCode: member.empCode,
      userName: member.userName,
      details: {
        source: SOURCE,
        txnId: transaction.txnId,
        dvcId: transaction.dvcId ?? null,
        dvcIP: transaction.dvcIP ?? null,
        punchId: empCode,
        receivedMode: transaction.mode,
        effectiveMode,
      },
      eventType: effectiveMode,
    });
    return 1;
  }
}

export const postgresBiometricService = new PostgresBiometricService();
