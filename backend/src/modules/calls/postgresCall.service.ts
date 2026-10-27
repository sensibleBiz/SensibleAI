import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import type {
  CallLogItem,
  CallReportQuery,
  CallReportResult,
  EmployeeCallItem,
  EmployeeCallListQuery,
  EmployeeCallListResult,
  LeadCallListQuery,
  LeadCallListResult,
} from "../../types/call.types.js";
import {
  buildCallReport,
  filterCallReport,
  normalizeCallNumberVariants,
} from "./callReporting.js";
import type { CallLogDocument } from "../../types/call.types.js";
import {
  PostgresAuthorizationRepository,
  postgresAuthorizationRepository,
} from "../authorization/postgresAuthorization.repository.js";
import { PostgresLeadRepository, postgresLeadRepository } from "../leads/postgresLead.repository.js";
import type { PostgresCallCreateInput, PostgresCallRecord } from "./call.types.js";
import { PostgresCallRepository, postgresCallRepository } from "./postgresCall.repository.js";

const encodeCursor = (record: PostgresCallRecord) =>
  Buffer.from(
    JSON.stringify({ id: record.id, timestamp: record.loggedAt.getTime() }),
    "utf8",
  ).toString("base64url");

const toCallLogDocument = (record: PostgresCallRecord): CallLogDocument => ({
  id: record.id,
  cursor: { id: record.id, timestamp: record.loggedAt.getTime() },
  data: {
    direction: record.direction,
    durationSeconds: record.durationSeconds,
    number: record.number,
    receiverMobileNo: record.receiverMobileNo,
    receiverName: record.receiverName,
    name: record.employeeLabel,
    department: record.department,
    timestamp: record.loggedAt.getTime(),
  },
});

const toCallLogItem = (record: PostgresCallRecord): CallLogItem => ({
  id: record.id,
  direction: record.direction,
  durationSeconds: record.durationSeconds,
  number: record.number,
  receiverMobileNo: record.receiverMobileNo,
  receiverName: record.receiverName,
  timestamp: record.loggedAt.getTime(),
});

const toEmployeeCallItem = (record: PostgresCallRecord): EmployeeCallItem => ({
  ...toCallLogItem(record),
  name: record.employeeLabel,
});

export class PostgresCallService {
  constructor(
    private readonly repository: PostgresCallRepository = postgresCallRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
    private readonly leads: PostgresLeadRepository = postgresLeadRepository,
  ) {}

  private async requirePermission(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    permission: string,
  ) {
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  async create(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PostgresCallCreateInput,
  ) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "calls.create");
    const businessId = await this.repository.resolveOutletBusiness(database, tenantId, input.outletId);
    if (!businessId) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");

    const leadId = input.leadId ?? null;
    let customerId = input.customerId ?? null;
    if (leadId) {
      const lead = await this.leads.getById(database, tenantId, input.outletId, leadId);
      if (!lead) throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
      if (lead.outletId !== input.outletId) {
        throw new AppError(400, "Lead outlet must match the call outlet", "LEAD_OUTLET_MISMATCH");
      }
      customerId = lead.customerId;
    }

    if (input.loggedByUserId && !await this.authorization.hasOutletAccess(database, input.loggedByUserId, tenantId, input.outletId)) {
      throw new AppError(400, "Logged-by user is inactive or does not belong to this outlet", "INVALID_CALL_USER");
    }

    const id = uuidv7();
    await this.repository.create(database, {
      id,
      tenantId,
      businessId,
      outletId: input.outletId,
      leadId,
      customerId,
      loggedByUserId: input.loggedByUserId ?? userId,
      direction: input.direction,
      durationSeconds: input.durationSeconds,
      number: input.number.trim(),
      receiverMobileNo: input.receiverMobileNo?.trim() ?? "",
      receiverName: input.receiverName.trim(),
      employeeLabel: input.name?.trim() || input.receiverName.trim(),
      department: input.department?.trim() || "Other",
      loggedAt: new Date(input.timestamp),
      phoneAccountId: input.phoneAccountId ?? null,
      simLabel: input.simLabel ?? null,
      simPhoneNumber: input.simPhoneNumber ?? null,
      subscriptionId: input.subscriptionId ?? null,
      deviceId: input.deviceId ?? null,
      externalCallSource: input.externalCallSource ?? null,
      externalCallId: input.externalCallId ?? null,
      createdByUserId: userId,
      updatedByUserId: userId,
    });

    const created = await this.repository.getById(database, tenantId, input.outletId, id);
    if (!created) throw new Error("Created call was not readable inside its transaction");
    return toCallLogItem(created);
  }

  async getById(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    callId: string,
  ) {
    await this.requirePermission(database, tenantId, userId, outletId, "calls.read");
    const call = await this.repository.getById(database, tenantId, outletId, callId);
    if (!call) throw new AppError(404, "Call not found", "CALL_NOT_FOUND");
    return toCallLogItem(call);
  }

  async getReport(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: CallReportQuery,
  ): Promise<CallReportResult> {
    await this.requirePermission(database, tenantId, userId, query.outletId, "calls.reports.read");
    const records = await this.repository.streamForReport(
      database,
      tenantId,
      query.outletId,
      query.startDate,
      query.endDate,
    );
    const report = buildCallReport(records.map(toCallLogDocument));
    return filterCallReport(report, query);
  }

  async listByEmployee(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: EmployeeCallListQuery,
  ): Promise<EmployeeCallListResult> {
    await this.requirePermission(database, tenantId, userId, query.outletId, "calls.reports.read");
    let records: PostgresCallRecord[];
    try {
      records = await this.repository.listByEmployee(
        database,
        tenantId,
        query.outletId,
        query.receiverName,
        query.startDate,
        query.endDate,
        query.direction as "incoming" | "outgoing" | "missed" | "rejected" | undefined,
        query.limit + 1,
        query.cursor,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CURSOR") {
        throw new AppError(400, "Invalid pagination cursor", "INVALID_CURSOR");
      }
      throw error;
    }
    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit);
    const lastItem = page.at(-1);
    return {
      items: page.map(toEmployeeCallItem),
      nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null,
    };
  }

  async listByLead(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: LeadCallListQuery,
  ): Promise<LeadCallListResult> {
    await this.requirePermission(database, tenantId, userId, query.outletId, "calls.read");
    const lead = await this.leads.getById(database, tenantId, query.outletId, query.leadId);
    if (!lead) throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");

    const numbers = normalizeCallNumberVariants(lead.mobile);
    if (numbers.length === 0) return { items: [], nextCursor: null };

    let records: PostgresCallRecord[];
    try {
      records = await this.repository.listByNumbers(
        database,
        tenantId,
        query.outletId,
        numbers,
        lead.id,
        query.limit + 1,
        query.cursor,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CURSOR") {
        throw new AppError(400, "Invalid pagination cursor", "INVALID_CURSOR");
      }
      throw error;
    }
    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit);
    const lastItem = page.at(-1);
    return {
      items: page.map(toCallLogItem),
      nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null,
    };
  }
}

export const postgresCallService = new PostgresCallService();
