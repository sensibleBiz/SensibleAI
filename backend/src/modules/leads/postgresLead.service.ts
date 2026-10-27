import { randomBytes } from "node:crypto";
import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import {
  LEAD_REPORT_SOURCES,
  type LeadAnalyticsQuery,
  type LeadAnalyticsRecord,
  type LeadBulkCreateInput,
  type LeadBulkCreateResult,
  type LeadDashboardResult,
  type LeadCityStateReportQuery,
  type LeadCityStateReportResult,
  type LeadCityStateReportRow,
  type LeadCityStateStageRecord,
  type LeadEmployeeReportResult,
  type LeadEmployeeReportStats,
  type LeadFunnelCounts,
  type LeadFunnelReportQuery,
  type LeadFunnelReportResult,
  type LeadFunnelSourceStat,
  type LeadFunnelStageRecord,
  type LeadReportSource,
  type LeadSourceReportQuery,
  type LeadSourceReportResult,
  type LeadSourceStageRecord,
  type LeadSourceStats,
} from "../../types/lead.types.js";
import { FUNNEL_SOURCE_KEYS, resolveFunnelSourceKey } from "../../utils/funnelSource.js";
import { normalizeEmail, normalizeMobile } from "../../utils/customerNormalization.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { PostgresCustomerService, postgresCustomerService } from "../customers/postgresCustomer.service.js";
import type {
  EmployeeSalesTargetDeleteQuery,
  EmployeeSalesTargetQuery,
  EmployeeSalesTargetRecord,
  EmployeeSalesTargetSyncInput,
  PostgresLeadAssignInput,
  PostgresLeadCreateInput,
  PostgresLeadListQuery,
  PostgresLeadListResult,
  PostgresLeadRecord,
  PostgresLeadRepeatedEnquiryQuery,
  PostgresLeadRingingQuery,
  PostgresLeadStage,
  PostgresLeadStageInput,
  PostgresLeadUpdateInput,
  PostgresRepeatedEnquiryResult,
} from "./lead.types.js";
import { PostgresLeadRepository, postgresLeadRepository } from "./postgresLead.repository.js";
import { embedText, scheduleLeadEmbedding } from "../assistant/tools/embeddingService.js";
import { getApplicationPool } from "../../db/client.js";

const emptySourceStats = (): Record<LeadReportSource, LeadSourceStats> =>
  LEAD_REPORT_SOURCES.reduce((result, source) => {
    result[source] = { total: 0, new: 0, follow: 0, completed: 0, lost: 0 };
    return result;
  }, {} as Record<LeadReportSource, LeadSourceStats>);

const normalizeReportSource = (source: string): LeadReportSource => {
  const normalized = source.replace(/[^a-z0-9]/gi, "").toLowerCase();
  const sourceMap: Record<string, LeadReportSource> = {
    facebook: "Facebook",
    google: "Google",
    googleads: "Google",
    indiamart: "Indiamart",
    instagram: "Instagram",
    justdail: "JustDail",
    justdial: "JustDail",
    website: "Website",
  };
  return sourceMap[normalized] ?? "Other";
};

const aggregatePostgresSourceReport = (
  records: LeadSourceStageRecord[],
): LeadSourceReportResult => {
  const sources = emptySourceStats();
  for (const record of records) {
    const stats = sources[normalizeReportSource(record.source)];
    const stage = record.stage.trim().toUpperCase();
    stats.total += 1;
    if (stage === "NEW") stats.new += 1;
    if (stage === "ASSIGNED" || stage === "FOLLOWUP") stats.follow += 1;
    if (stage === "WON") stats.completed += 1;
    if (stage === "LOST") stats.lost += 1;
  }
  return { sources };
};

const aggregatePostgresCityStateReport = (
  records: LeadCityStateStageRecord[],
): LeadCityStateReportResult => {
  const rows = new Map<string, LeadCityStateReportRow>();
  for (const record of records) {
    const state = record.state.trim().toUpperCase() || "UNKNOWN STATE";
    const city = record.city.trim().toUpperCase() || "UNKNOWN CITY";
    const key = `${state}\u0000${city}`;
    const row = rows.get(key) ?? {
      state, city, assigned: 0, new: 0, followup: 0,
      completed: 0, lost: 0, disqual: 0, total: 0,
    };
    const stage = record.stage.trim().toUpperCase() || "NEW";
    row.total += 1;
    if (stage === "NEW") row.new += 1;
    if (stage === "ASSIGNED") row.assigned += 1;
    if (stage === "FOLLOWUP") row.followup += 1;
    if (stage === "WON") row.completed += 1;
    if (stage === "LOST") row.lost += 1;
    if (stage === "DISQUALIFIED") row.disqual += 1;
    rows.set(key, row);
  }
  return {
    rows: [...rows.values()].sort((first, second) =>
      first.state === second.state
        ? first.city.localeCompare(second.city)
        : first.state.localeCompare(second.state)),
  };
};

const ANALYTICS_SOURCE_LABELS: Record<string, string> = {
  indiamart: "Indiamart", justdial: "JustDail", facebook: "Facebook",
  instagram: "Instagram", google: "Google Ads", website: "Website",
  reference: "Reference", "self-generated": "Self Generated",
  "cold-call": "Cold Call", linkedin: "LinkedIn", whatsapp: "WhatsApp",
  email: "Email", "walk-in": "WalkIn", other: "Other",
};

const analyticsDay = (timestamp: number) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  }).formatToParts(new Date(timestamp));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { key: `${read("year")}-${read("month")}-${read("day")}`, label: `${read("month")} ${read("day")}` };
};

const aggregatePostgresDashboard = (
  query: LeadAnalyticsQuery,
  records: LeadAnalyticsRecord[],
): LeadDashboardResult => {
  const counts = emptyFunnelCounts();
  const sourceCounts = new Map<string, number>();
  const trend = new Map<string, { date: string; leads: number }>();
  for (let timestamp = query.startDate; timestamp <= query.endDate; timestamp += 86_400_000) {
    const day = analyticsDay(timestamp);
    trend.set(day.key, { date: day.label, leads: 0 });
  }
  for (const record of records) {
    const stage = record.stage.trim().toUpperCase();
    counts.totalLeads += 1;
    counts.byStage ??= {};
    counts.byStage[stage] = (counts.byStage[stage] ?? 0) + 1;
    if (stage === "NEW") counts.newLeads += 1;
    if (stage === "ASSIGNED") counts.assigned += 1;
    if (stage === "FOLLOWUP") counts.followUp += 1;
    const category = record.stageCategory ?? stage;
    if (category === "WON") counts.closedWon += 1;
    if (category === "LOST") counts.lost += 1;
    if (category === "DISQUALIFIED") counts.disqualified += 1;
    const sourceKey = resolveFunnelSourceKey(record.source);
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
    const point = trend.get(analyticsDay(record.createdDate).key);
    if (point) point.leads += 1;
  }
  return {
    counts,
    sources: FUNNEL_SOURCE_KEYS.map((key) => ({
      source: ANALYTICS_SOURCE_LABELS[key] ?? "Other",
      count: sourceCounts.get(key) ?? 0,
    })),
    trend: [...trend.values()],
  };
};

const aggregatePostgresEmployeeReport = (
  records: LeadFunnelStageRecord[],
): LeadEmployeeReportResult => {
  const employees: Record<string, LeadEmployeeReportStats> = {};
  for (const record of records) {
    if (!record.assignedTo) continue;
    const stats = (employees[record.assignedTo] ??= {
      total: 0, assigned: 0, followup: 0, completed: 0, lost: 0,
    });
    const stage = record.stage.trim().toUpperCase();
    stats.total += 1;
    if (stage === "ASSIGNED") stats.assigned += 1;
    if (stage === "FOLLOWUP") stats.followup += 1;
    if ((record.stageCategory ?? stage) === "WON") stats.completed += 1;
    if ((record.stageCategory ?? stage) === "LOST") stats.lost += 1;
  }
  return { employees };
};

const emptyFunnelCounts = (): LeadFunnelCounts => ({
  totalLeads: 0,
  newLeads: 0,
  assigned: 0,
  followUp: 0,
  closedWon: 0,
  lost: 0,
  disqualified: 0,
});

const aggregatePostgresFunnel = (
  records: LeadFunnelStageRecord[],
  source?: string,
): LeadFunnelReportResult => {
  const counts = emptyFunnelCounts();
  const sources = Object.fromEntries(FUNNEL_SOURCE_KEYS.map((key) => [key, {
    key,
    total: 0,
    active: 0,
    won: 0,
    lost: 0,
    disqualified: 0,
  }])) as Record<string, Omit<LeadFunnelSourceStat, "percent">>;
  const requestedSource = source ? resolveFunnelSourceKey(source) : undefined;

  for (const record of records) {
    const sourceKey = resolveFunnelSourceKey(record.source);
    if (requestedSource && sourceKey !== requestedSource) continue;
    const stage = record.stage.trim().toUpperCase();
    counts.totalLeads += 1;
    counts.byStage ??= {};
    counts.byStage[stage] = (counts.byStage[stage] ?? 0) + 1;
    if (stage === "NEW") counts.newLeads += 1;
    if (stage === "ASSIGNED") counts.assigned += 1;
    if (stage === "FOLLOWUP") counts.followUp += 1;
    const category = record.stageCategory ?? stage;
    if (category === "WON") counts.closedWon += 1;
    if (category === "LOST") counts.lost += 1;
    if (category === "DISQUALIFIED") counts.disqualified += 1;
    const stats = sources[sourceKey]!;
    stats.total += 1;
    if (category === "WON") stats.won += 1;
    else if (category === "LOST") stats.lost += 1;
    else if (category === "DISQUALIFIED") stats.disqualified += 1;
    else stats.active += 1;
  }

  return {
    counts,
    sources: FUNNEL_SOURCE_KEYS.map((key) => ({
      ...sources[key]!,
      percent: counts.totalLeads > 0
        ? Math.round((sources[key]!.total / counts.totalLeads) * 100)
        : 0,
    })),
  };
};

export class PostgresLeadService {
  constructor(
    private readonly repository: PostgresLeadRepository = postgresLeadRepository,
    private readonly authRepository: PostgresAuthorizationRepository = postgresAuthorizationRepository,
    private readonly customerService: PostgresCustomerService = postgresCustomerService,
  ) {}

  async create(database: TransactionDatabase, tenantId: string, userId: string, input: PostgresLeadCreateInput): Promise<PostgresLeadRecord> {
    const businessId = await this.repository.getOutletBusinessId(database, tenantId, input.outletId);
    if (!businessId) {
      throw new AppError(403, "PostgreSQL outlet access denied", "POSTGRES_OUTLET_ACCESS_DENIED");
    }

    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, input.outletId, "leads.create");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for creating leads", "PERMISSION_DENIED");
    }

    if (input.customerId) {
      await this.customerService.getById(database, tenantId, input.outletId, input.customerId);
    }

    let assignedToUserId: string | null = null;
    if (input.assignedTo) {
      const isAssigneeValid = await this.authRepository.hasOutletAccess(database, input.assignedTo, tenantId, input.outletId);
      if (!isAssigneeValid) {
        throw new AppError(400, "Assigned user is inactive or does not belong to this outlet", "INVALID_ASSIGNEE");
      }
      assignedToUserId = input.assignedTo;
    }

    const id = uuidv7();
    const initialStage: PostgresLeadStage = assignedToUserId ? "ASSIGNED" : "NEW";

    const values: Record<string, unknown> = {
      id,
      tenantId,
      businessId,
      outletId: input.outletId,
      customerId: input.customerId ?? null,
      assignedToUserId,
      createdByUserId: userId,
      updatedByUserId: userId,
      customerName: input.customerName.trim(),
      businessName: (input.businessName ?? "").trim(),
      businessType: (input.businessType ?? "").trim(),
      mobile: input.mobile.trim(),
      normalizedMobile: normalizeMobile(input.mobile) ?? "",
      mobileAlt: "",
      phone: "",
      email: (input.email ?? "").trim(),
      normalizedEmail: normalizeEmail(input.email ?? "") ?? "",
      area: (input.area ?? "").trim(),
      city: (input.city ?? "").trim(),
      state: (input.state ?? "").trim(),
      requirement: input.requirement.trim(),
      stage: initialStage,
      source: (input.source ?? "").trim(),
      priority: (input.priority ?? "").trim(),
      comments: "",
      tags: [],
      externalRef: "",
      adId: (input.adId ?? "").trim(),
      campaign: "",
      ringing: false,
      whatsappShareCount: 0,
    };

    await this.repository.create(database, values);
    await this.repository.recordStageHistory(database, tenantId, id, null, initialStage, userId);

    if (assignedToUserId) {
      await this.repository.recordAssignment(database, tenantId, id, assignedToUserId, userId);
    }

    const lead = await this.repository.getById(database, tenantId, input.outletId, id);
    if (!lead) {
      throw new Error("Created lead was not readable inside its transaction");
    }
    scheduleLeadEmbedding(getApplicationPool(), id, {
      business_name: lead.businessName,
      requirement: lead.requirement,
      source: lead.source,
      city: lead.city,
      state: lead.state,
    });
    return lead;
  }

  async createBulk(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: LeadBulkCreateInput,
  ): Promise<LeadBulkCreateResult> {
    const businessId = await this.repository.getOutletBusinessId(database, tenantId, input.outletId);
    if (!businessId) {
      throw new AppError(403, "PostgreSQL outlet access denied", "POSTGRES_OUTLET_ACCESS_DENIED");
    }

    const hasPermission = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, input.outletId, "leads.create",
    );
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for creating leads", "PERMISSION_DENIED");
    }

    const uniqueLeads = new Map<string, LeadBulkCreateInput["leads"][number]>();
    input.leads.forEach((lead) => {
      if (!uniqueLeads.has(lead.externalId)) uniqueLeads.set(lead.externalId, lead);
    });
    const candidates = [...uniqueLeads.values()];
    await this.repository.lockBulkImport(database, tenantId, input.outletId);
    const existingExternalRefs = await this.repository.findExistingExternalRefs(
      database, tenantId, input.outletId, candidates.map((lead) => lead.externalId),
    );

    const importTimestamp = Date.now();
    let created = 0;
    for (const [index, lead] of candidates.entries()) {
      if (existingExternalRefs.has(lead.externalId)) continue;

      const id = uuidv7();
      const timestamp = new Date(importTimestamp - index);
      const metadata = [
        `Original lead time: ${new Date(lead.originalCreatedAt).toISOString()}`,
        lead.inboxUrl ? `Inbox: ${lead.inboxUrl}` : "",
      ].filter(Boolean).join("\n");

      await this.repository.create(database, {
        id, tenantId, businessId, outletId: input.outletId,
        customerId: null, assignedToUserId: null,
        createdByUserId: userId, updatedByUserId: userId,
        customerName: lead.customerName.trim(),
        businessName: "", businessType: "",
        mobile: lead.mobile.trim(),
        normalizedMobile: normalizeMobile(lead.mobile) ?? "",
        mobileAlt: "", phone: "", email: "", normalizedEmail: "", area: "",
        city: lead.city.trim(), state: "", requirement: lead.requirement.trim(),
        stage: "NEW", source: lead.source, priority: "", comments: metadata, tags: [],
        externalRef: lead.externalId, adId: lead.adId.trim(), campaign: lead.leadCampaign.trim(),
        ringing: false, whatsappShareCount: 0, createdAt: timestamp, updatedAt: timestamp,
      });
      await this.repository.recordStageHistory(database, tenantId, id, null, "NEW", userId);
      created += 1;
    }

    return { created, skippedDuplicates: input.leads.length - created };
  }

  async getById(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, leadId: string): Promise<PostgresLeadRecord> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, outletId, "leads.read");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for reading leads", "PERMISSION_DENIED");
    }

    const lead = await this.repository.getById(database, tenantId, outletId, leadId);
    if (!lead) {
      throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    }
    return lead;
  }

  async list(database: TransactionDatabase, tenantId: string, userId: string, query: PostgresLeadListQuery): Promise<PostgresLeadListResult> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, query.outletId, "leads.read");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for reading leads", "PERMISSION_DENIED");
    }

    return this.repository.list(database, tenantId, query);
  }

  async update(database: TransactionDatabase, tenantId: string, userId: string, leadId: string, input: PostgresLeadUpdateInput): Promise<PostgresLeadRecord> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, input.outletId, "leads.update");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for updating leads", "PERMISSION_DENIED");
    }

    const currentLead = await this.repository.lockLead(database, tenantId, input.outletId, leadId);
    if (!currentLead) {
      throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    }

    const values: Record<string, unknown> = {
      updatedByUserId: userId,
    };

    if (input.username !== undefined) values.customerName = input.username.trim();
    if (input.businessName !== undefined) values.businessName = input.businessName.trim();
    if (input.businessType !== undefined) values.businessType = input.businessType.trim();
    if (input.area !== undefined) values.area = input.area.trim();
    if (input.city !== undefined) values.city = input.city.trim();
    if (input.state !== undefined) values.state = input.state.trim();
    if (input.priority !== undefined) values.priority = input.priority.trim();
    if (input.source !== undefined) values.source = input.source.trim();
    if (input.requirement !== undefined) values.requirement = input.requirement.trim();
    if (input.email !== undefined) {
      values.email = input.email.trim();
      values.normalizedEmail = normalizeEmail(input.email) ?? "";
    }
    if (input.mobile !== undefined) {
      values.mobile = input.mobile.trim();
      values.normalizedMobile = normalizeMobile(input.mobile) ?? "";
    }
    if (input.customFields !== undefined) values.customFields = { ...currentLead.customFields, ...input.customFields };

    await this.repository.update(database, tenantId, input.outletId, leadId, values);
    const updated = await this.repository.getById(database, tenantId, input.outletId, leadId);
    if (!updated) {
      throw new AppError(404, "Lead not found after update", "LEAD_NOT_FOUND");
    }
    const embeddableChanged = input.businessName !== undefined || input.source !== undefined
      || input.city !== undefined || input.state !== undefined || input.requirement !== undefined;
    if (embeddableChanged) {
      scheduleLeadEmbedding(getApplicationPool(), leadId, {
        business_name: updated.businessName,
        requirement: updated.requirement,
        source: updated.source,
        city: updated.city,
        state: updated.state,
      });
    }
    return updated;
  }

  async assign(database: TransactionDatabase, tenantId: string, userId: string, leadId: string, input: PostgresLeadAssignInput): Promise<PostgresLeadRecord> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, input.outletId, "leads.assign");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for assigning leads", "PERMISSION_DENIED");
    }

    const currentLead = await this.repository.lockLead(database, tenantId, input.outletId, leadId);
    if (!currentLead) {
      throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    }

    const isAssigneeValid = await this.authRepository.hasOutletAccess(database, input.assignedTo, tenantId, input.outletId);
    if (!isAssigneeValid) {
      throw new AppError(400, "Target assignee is not active or lacks outlet access", "INVALID_ASSIGNEE");
    }

    const targetStage: PostgresLeadStage = input.stage ?? (currentLead.stage === "NEW" ? "ASSIGNED" : currentLead.stage);
    await this.repository.resolveStage(database, tenantId, currentLead.businessId, targetStage);

    await this.repository.recordAssignment(database, tenantId, leadId, input.assignedTo, userId);

    if (targetStage !== currentLead.stage) {
      await this.repository.recordStageHistory(database, tenantId, leadId, currentLead.stage, targetStage, userId);
    }

    const updateValues: Record<string, unknown> = {
      assignedToUserId: input.assignedTo,
      stage: targetStage,
      comments: input.comments !== undefined ? input.comments.trim() : currentLead.comments,
      tags: input.leadTag ?? currentLead.tags,
      updatedByUserId: userId,
    };

    await this.repository.update(database, tenantId, input.outletId, leadId, updateValues);
    const updated = await this.repository.getById(database, tenantId, input.outletId, leadId);
    if (!updated) {
      throw new AppError(404, "Lead not found after assignment", "LEAD_NOT_FOUND");
    }
    return updated;
  }

  async changeStage(database: TransactionDatabase, tenantId: string, userId: string, leadId: string, input: PostgresLeadStageInput): Promise<PostgresLeadRecord> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, input.outletId, "leads.update");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for updating lead stage", "PERMISSION_DENIED");
    }

    if (!input.stage) {
      throw new AppError(400, "stage is required", "STAGE_REQUIRED");
    }

    const currentLead = await this.repository.lockLead(database, tenantId, input.outletId, leadId);
    if (!currentLead) {
      throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    }

    let customerId = currentLead.customerId;
    const configuredStage = await this.repository.resolveStage(database, tenantId, currentLead.businessId, input.stage);

    if (configuredStage.stage_category === "WON" && !customerId) {
      const customerResult = await this.customerService.create(database, tenantId, userId, {
        outletId: input.outletId,
        customerName: currentLead.customerName || currentLead.businessName || "Won Lead Customer",
        businessName: currentLead.businessName,
        mobile: currentLead.mobile,
        email: currentLead.email,
        businessType: currentLead.businessType,
        area: currentLead.area,
        city: currentLead.city,
        state: currentLead.state,
        priority: currentLead.priority,
        source: currentLead.source,
      });

      customerId = customerResult.customer.id;
    }

    if (input.stage !== currentLead.stage) {
      await this.repository.recordStageHistory(database, tenantId, leadId, currentLead.stage, input.stage, userId);
    }

    const updateValues: Record<string, unknown> = {
      stage: input.stage,
      customerId,
      comments: input.comments !== undefined ? input.comments.trim() : currentLead.comments,
      tags: input.leadTag ?? currentLead.tags,
      updatedByUserId: userId,
    };

    await this.repository.update(database, tenantId, input.outletId, leadId, updateValues);
    const updated = await this.repository.getById(database, tenantId, input.outletId, leadId);
    if (!updated) {
      throw new AppError(404, "Lead not found after stage change", "LEAD_NOT_FOUND");
    }
    return updated;
  }

  async setRinging(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, leadId: string, ringing: boolean): Promise<PostgresLeadRecord> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, outletId, "leads.read");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for modifying ringing state", "PERMISSION_DENIED");
    }

    const updated = await this.repository.setRinging(database, tenantId, outletId, leadId, ringing, userId);
    if (!updated) {
      throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    }

    const lead = await this.repository.getById(database, tenantId, outletId, leadId);
    if (!lead) {
      throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    }
    return lead;
  }

  async listRinging(database: TransactionDatabase, tenantId: string, userId: string, query: PostgresLeadRingingQuery): Promise<PostgresLeadListResult> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, query.outletId, "leads.read");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for reading ringing leads", "PERMISSION_DENIED");
    }

    return this.repository.listRinging(database, tenantId, query);
  }

  async listRepeatedEnquiries(database: TransactionDatabase, tenantId: string, userId: string, query: PostgresLeadRepeatedEnquiryQuery): Promise<PostgresRepeatedEnquiryResult> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, query.outletId, "leads.read");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for reading repeated enquiries", "PERMISSION_DENIED");
    }

    return this.repository.listRepeatedEnquiries(database, tenantId, query);
  }

  async listEmployeeSalesTargets(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: EmployeeSalesTargetQuery,
  ): Promise<EmployeeSalesTargetRecord[]> {
    const allowed = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, query.outletId, "lead_targets.read",
    );
    if (!allowed) {
      throw new AppError(403, "Permission denied for viewing employee targets", "PERMISSION_DENIED");
    }
    return this.repository.listEmployeeSalesTargets(database, tenantId, query);
  }

  async syncEmployeeSalesTargets(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: EmployeeSalesTargetSyncInput,
  ): Promise<EmployeeSalesTargetRecord[]> {
    const permissions = new Set<string>();
    if (input.items.some((item) => item.id)) permissions.add("lead_targets.update");
    if (input.items.some((item) => !item.id)) permissions.add("lead_targets.create");
    for (const permission of permissions) {
      const allowed = await this.authRepository.hasOutletPermission(
        database, userId, tenantId, input.outletId, permission,
      );
      if (!allowed) {
        throw new AppError(403, "Permission denied for saving employee targets", "PERMISSION_DENIED");
      }
    }
    return this.repository.syncEmployeeSalesTargets(database, tenantId, userId, input);
  }

  async deleteEmployeeSalesTarget(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: EmployeeSalesTargetDeleteQuery["outletId"],
    targetId: string,
  ): Promise<void> {
    const allowed = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, outletId, "lead_targets.delete",
    );
    if (!allowed) {
      throw new AppError(403, "Permission denied for deleting employee targets", "PERMISSION_DENIED");
    }
    if (!await this.repository.deleteEmployeeSalesTarget(database, tenantId, outletId, targetId)) {
      throw new AppError(404, "Employee sales target not found", "EMPLOYEE_TARGET_NOT_FOUND");
    }
  }
  async getDashboard(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: LeadAnalyticsQuery,
  ): Promise<LeadDashboardResult> {
    const hasPermission = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, query.outletId, "lead_reports.read",
    );
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for viewing lead analytics", "PERMISSION_DENIED");
    }
    const records = await this.repository.listAnalyticsRecords(database, tenantId, query);
    return aggregatePostgresDashboard(query, records);
  }

  async getEmployeeReport(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: LeadSourceReportQuery,
  ): Promise<LeadEmployeeReportResult> {
    const hasPermission = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, query.outletId, "lead_reports.employee.read",
    );
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for viewing employee lead reports", "PERMISSION_DENIED");
    }
    const records = await this.repository.listFunnelStages(database, tenantId, query);
    return aggregatePostgresEmployeeReport(records);
  }

  async getCityStateReport(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: LeadCityStateReportQuery,
  ): Promise<LeadCityStateReportResult> {
    const hasPermission = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, query.outletId, "lead_reports.read",
    );
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for viewing lead reports", "PERMISSION_DENIED");
    }
    const records = await this.repository.listCityStateStages(database, tenantId, query);
    return aggregatePostgresCityStateReport(records);
  }

  async getSourceReport(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: LeadSourceReportQuery,
  ): Promise<LeadSourceReportResult> {
    const hasPermission = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, query.outletId, "lead_reports.read",
    );
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for viewing lead reports", "PERMISSION_DENIED");
    }
    const records = await this.repository.listFunnelStages(database, tenantId, query);
    return aggregatePostgresSourceReport(records);
  }

  async getFunnelReport(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: LeadFunnelReportQuery,
  ): Promise<LeadFunnelReportResult> {
    const hasPermission = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, query.outletId, "lead_reports.read",
    );
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for viewing lead reports", "PERMISSION_DENIED");
    }
    const records = await this.repository.listFunnelStages(database, tenantId, query);
    return aggregatePostgresFunnel(records);
  }

  async getStageCounts(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    query: LeadFunnelReportQuery,
  ): Promise<LeadFunnelCounts> {
    const hasPermission = await this.authRepository.hasOutletPermission(
      database, userId, tenantId, query.outletId, "lead_reports.read",
    );
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for viewing lead reports", "PERMISSION_DENIED");
    }
    const records = await this.repository.listFunnelStages(database, tenantId, query);
    return aggregatePostgresFunnel(records, query.source).counts;
  }

  async createShareToken(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, leadId: string): Promise<{ id: string; shareToken: string; whatsappShareCount: number }> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, outletId, "leads.share");
    if (!hasPermission) {
      throw new AppError(403, "Permission denied for sharing leads", "PERMISSION_DENIED");
    }

    const lead = await this.repository.getById(database, tenantId, outletId, leadId);
    if (!lead) {
      throw new AppError(404, "Lead not found", "LEAD_NOT_FOUND");
    }

    const token = randomBytes(16).toString("hex");
    await this.repository.createShareToken(database, tenantId, leadId, token, userId);

    const newShareCount = lead.whatsappShareCount + 1;
    await this.repository.update(database, tenantId, outletId, leadId, {
      whatsappShareCount: newShareCount,
      updatedByUserId: userId,
    });

    return {
      id: leadId,
      shareToken: token,
      whatsappShareCount: newShareCount,
    };
  }

  async semanticSearch(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    query: string,
    limit = 8,
  ): Promise<{ id: string; businessName: string | null; stage: string; city: string | null; assignedTo: string | null; similarity: number }[]> {
    const hasPermission = await this.authRepository.hasOutletPermission(database, userId, tenantId, outletId, "leads.read");
    if (!hasPermission) throw new AppError(403, "Permission denied for reading leads", "PERMISSION_DENIED");

    const vec = await embedText(query);
    const result = await database.client.query<{
      id: string;
      business_name: string | null;
      stage: string;
      city: string | null;
      assigned_name: string | null;
      similarity: string;
    }>(
      `SELECT l.id, l.business_name, l.stage::text AS stage, l.city,
              coalesce(u.display_name, 'Unassigned') AS assigned_name,
              (1 - (l.embedding <=> $3::vector))::numeric(5,4)::text AS similarity
       FROM crm.leads l
       LEFT JOIN iam.users u ON u.id = l.assigned_to_user_id
       WHERE l.tenant_id = $1 AND l.outlet_id = $2 AND l.embedding IS NOT NULL
       ORDER BY l.embedding <=> $3::vector
       LIMIT $4`,
      [tenantId, outletId, JSON.stringify(vec), Math.min(limit, 20)],
    );
    return result.rows.map(({ id, business_name, stage, city, assigned_name, similarity }) => ({
      id,
      businessName: business_name,
      stage,
      city,
      assignedTo: assigned_name,
      similarity: parseFloat(similarity),
    }));
  }

  async getSharedLead(database: TransactionDatabase, token: string): Promise<PostgresLeadRecord> {
    const lead = await this.repository.getSharedLead(database, token);
    if (!lead) {
      throw new AppError(404, "Lead share token is invalid or expired", "SHARE_TOKEN_INVALID");
    }
    return lead;
  }
}

export const postgresLeadService = new PostgresLeadService();
