import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { FUNNEL_SOURCE_KEYS, FUNNEL_SOURCE_MATCHERS } from "../../utils/funnelSource.js";
import type { LeadAnalyticsQuery, LeadAnalyticsRecord, LeadCityStateReportQuery, LeadCityStateStageRecord, LeadFunnelReportQuery, LeadFunnelStageRecord } from "../../types/lead.types.js";
import type {
  EmployeeSalesTargetQuery,
  EmployeeSalesTargetRecord,
  EmployeeSalesTargetSyncInput,
  PostgresLeadListQuery,
  PostgresLeadListResult,
  PostgresLeadRecord,
  PostgresLeadRepeatedEnquiryQuery,
  PostgresLeadRingingQuery,
  PostgresLeadStage,
  PostgresRepeatedEnquiryGroup,
  PostgresRepeatedEnquiryResult,
} from "./lead.types.js";

interface LeadRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  business_id: string;
  outlet_id: string;
  customer_id: string | null;
  assigned_to_user_id: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  customer_name: string;
  business_name: string;
  business_type: string;
  mobile: string;
  normalized_mobile: string;
  mobile_alt: string;
  phone: string;
  email: string;
  normalized_email: string;
  area: string;
  city: string;
  state: string;
  requirement: string;
  stage: PostgresLeadStage;
  source: string;
  priority: string;
  comments: string;
  custom_fields: Record<string, unknown> | null;
  tags: string[] | null;
  external_ref: string;
  ad_id: string;
  campaign: string;
  ringing: boolean;
  whatsapp_share_count: number;
  created_at: Date;
  updated_at: Date;
  assigned_to_name?: string | null;
  assigned_by_name?: string | null;
}

interface EmployeeSalesTargetRow extends QueryResultRow {
  id: string;
  outlet_id: string;
  zone: "South" | "West" | "East" | "North" | "Subscriptions";
  sale_executive: string;
  sale_executive_user_id: string | null;
  forecast_net_sales: string;
  achieved_net_sales: string;
  display_order: number;
  target_month: number;
  target_year: number;
  created_at: Date;
  updated_at: Date;
}

const mapEmployeeSalesTarget = (row: EmployeeSalesTargetRow): EmployeeSalesTargetRecord => {
  const forecast = Number(row.forecast_net_sales);
  const achieved = Number(row.achieved_net_sales);
  return {
    id: row.id,
    outletId: row.outlet_id,
    zone: row.zone,
    saleExecutive: row.sale_executive,
    ...(row.sale_executive_user_id ? { saleExecutiveId: row.sale_executive_user_id } : {}),
    decForecastNetSales: forecast,
    achieveNetSales: achieved,
    achievementPercentage: forecast > 0 ? Math.round((achieved / forecast) * 100) : 0,
    order: row.display_order,
    month: row.target_month,
    year: row.target_year,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
};
const toQueryDate = (value: number, field: string) => {
  const date = new Date(value);
  if (!Number.isFinite(value) || Number.isNaN(date.getTime())) {
    throw new AppError(400, `${field} must be a valid date`, "INVALID_DATE");
  }
  return date;
};

const mapLeadRow = (row: LeadRow): PostgresLeadRecord => {
  const createdMs = new Date(row.created_at).getTime();
  const updatedMs = new Date(row.updated_at).getTime();
  const tags = row.tags ?? [];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    businessId: row.business_id,
    outletId: row.outlet_id,
    customerId: row.customer_id,
    assignedToUserId: row.assigned_to_user_id,
    // The frontend contract stores the assignee identifier in assignedTo and
    // resolves its display label from the team tree.
    assignedTo: row.assigned_to_user_id ?? "",
    assignedBy: row.assigned_by_name ?? row.created_by_user_id ?? "",
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    customerName: row.customer_name,
    username: row.customer_name,
    businessName: row.business_name,
    businessType: row.business_type,
    mobile: row.mobile,
    normalizedMobile: row.normalized_mobile,
    mobileAlt: row.mobile_alt,
    phone: row.phone,
    email: row.email,
    normalizedEmail: row.normalized_email,
    area: row.area,
    city: row.city,
    state: row.state,
    requirement: row.requirement,
    stage: row.stage,
    source: row.source,
    priority: row.priority,
    comments: row.comments,
    customFields: row.custom_fields ?? {},
    tags,
    leadTag: tags,
    externalRef: row.external_ref,
    adId: row.ad_id,
    campaign: row.campaign,
    ringing: row.ringing,
    status: row.ringing ? "RINGING" : "",
    whatsappShareCount: row.whatsapp_share_count,
    createdDate: createdMs,
    updatedDate: updatedMs,
  };
};

const SELECT_LEAD_FIELDS = `
  lead_item.id, lead_item.tenant_id, lead_item.business_id, lead_item.outlet_id,
  lead_item.customer_id, lead_item.assigned_to_user_id, lead_item.created_by_user_id,
  lead_item.updated_by_user_id, lead_item.customer_name, lead_item.business_name,
  lead_item.business_type, lead_item.mobile, lead_item.normalized_mobile,
  lead_item.mobile_alt, lead_item.phone, lead_item.email, lead_item.normalized_email,
  lead_item.area, lead_item.city, lead_item.state, lead_item.requirement,
  lead_item.stage, lead_item.source, lead_item.priority, lead_item.comments,
  lead_item.tags, lead_item.custom_fields, lead_item.external_ref, lead_item.ad_id, lead_item.campaign,
  lead_item.ringing, lead_item.whatsapp_share_count, lead_item.created_at, lead_item.updated_at,
  assigned_user.display_name AS assigned_to_name,
  creator_user.display_name AS assigned_by_name
`;

const JOIN_USERS = `
  FROM crm.leads lead_item
  LEFT JOIN iam.users assigned_user ON assigned_user.id = lead_item.assigned_to_user_id
  LEFT JOIN iam.users creator_user ON creator_user.id = lead_item.created_by_user_id
`;

export class PostgresLeadRepository {
  async resolveStage(database: TransactionDatabase, tenantId: string, businessId: string, key: string) {
    const result = await database.client.query<{ id: string; stage_category: string }>(`
      SELECT id, stage_category FROM crm.business_pipeline_stages
      WHERE tenant_id=$1 AND business_id=$2 AND pipeline_type='lead'
        AND stage_key=$3 AND is_active`, [tenantId, businessId, key]);
    const stage = result.rows[0];
    if (!stage) throw new AppError(400, "Stage is not active for this business", "INVALID_PIPELINE_STAGE");
    return stage;
  }

  async getOutletBusinessId(database: TransactionDatabase, tenantId: string, outletId: string): Promise<string | null> {
    const result = await database.client.query<{ business_id: string }>(
      "SELECT business_id FROM tenancy.outlets WHERE tenant_id = $1 AND id = $2 AND active",
      [tenantId, outletId],
    );
    return result.rows[0]?.business_id ?? null;
  }

  async lockBulkImport(database: TransactionDatabase, tenantId: string, outletId: string): Promise<void> {
    await database.client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`lead-bulk:${tenantId}:${outletId}`],
    );
  }

  async findExistingExternalRefs(
    database: TransactionDatabase, tenantId: string, outletId: string, externalRefs: string[],
  ): Promise<Set<string>> {
    if (externalRefs.length === 0) return new Set();
    const result = await database.client.query<{ external_ref: string }>(
      `SELECT external_ref
       FROM crm.leads
       WHERE tenant_id = $1 AND outlet_id = $2
         AND external_ref = ANY($3::varchar[])`,
      [tenantId, outletId, externalRefs],
    );
    return new Set(result.rows.map((row) => row.external_ref));
  }

  async lockLead(database: TransactionDatabase, tenantId: string, outletId: string, leadId: string): Promise<PostgresLeadRecord | null> {
    const result = await database.client.query<LeadRow>(`
      SELECT ${SELECT_LEAD_FIELDS}
      ${JOIN_USERS}
      WHERE lead_item.tenant_id = $1 AND lead_item.outlet_id = $2 AND lead_item.id = $3
      FOR UPDATE OF lead_item
    `, [tenantId, outletId, leadId]);
    return result.rows[0] ? mapLeadRow(result.rows[0]) : null;
  }

  async create(database: TransactionDatabase, values: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(values);
    const columns = keys.map((key) => key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`));
    const placeholders = keys.map((_, index) => `$${index + 1}`);
    const valuesArray = keys.map((key) => values[key]);

    await database.client.query(
      `INSERT INTO crm.leads (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`,
      valuesArray,
    );
  }

  async getById(database: TransactionDatabase, tenantId: string, outletId: string, leadId: string): Promise<PostgresLeadRecord | null> {
    const result = await database.client.query<LeadRow>(`
      SELECT ${SELECT_LEAD_FIELDS}
      ${JOIN_USERS}
      WHERE lead_item.tenant_id = $1 AND lead_item.outlet_id = $2 AND lead_item.id = $3
    `, [tenantId, outletId, leadId]);
    return result.rows[0] ? mapLeadRow(result.rows[0]) : null;
  }

  async list(database: TransactionDatabase, tenantId: string, query: PostgresLeadListQuery): Promise<PostgresLeadListResult> {
    const conditions: string[] = ["lead_item.tenant_id = $1", "lead_item.outlet_id = $2"];
    const params: unknown[] = [tenantId, query.outletId];

    if (query.startDate !== undefined) {
      params.push(toQueryDate(query.startDate, "startDate"));
      conditions.push(`lead_item.created_at >= $${params.length}`);
    }
    if (query.endDate !== undefined) {
      params.push(toQueryDate(query.endDate, "endDate"));
      conditions.push(`lead_item.created_at <= $${params.length}`);
    }
    if (query.stage) {
      params.push(query.stage);
      conditions.push(`lead_item.stage = $${params.length}`);
    }
    if (query.status === "RINGING") {
      conditions.push("lead_item.ringing = true");
    }
    if (query.assignedTo) {
      params.push(query.assignedTo);
      conditions.push(`lead_item.assigned_to_user_id = $${params.length}`);
    }
    if (query.unassigned) {
      conditions.push("lead_item.assigned_to_user_id IS NULL");
    }
    if (query.source) {
      params.push(query.source);
      conditions.push(`lead_item.source = $${params.length}`);
    }
    if (query.sourceKey) {
      const normalizedSource = "regexp_replace(lower(coalesce(lead_item.source, '')), '[^a-z0-9]+', '', 'g')";
      const matcherKeys = query.sourceKey === "other"
        ? FUNNEL_SOURCE_KEYS.filter((key) => key !== "other")
        : [query.sourceKey];
      const patterns = matcherKeys.flatMap((key) =>
        FUNNEL_SOURCE_MATCHERS[key].map((matcher) => `%${matcher.toLowerCase().replace(/[^a-z0-9]+/g, "")}%`),
      );
      params.push(patterns);
      conditions.push(query.sourceKey === "other"
        ? `NOT (${normalizedSource} LIKE ANY($${params.length}::text[]))`
        : `${normalizedSource} LIKE ANY($${params.length}::text[])`);
    }
    if (query.search) {
      params.push(`%${query.search.trim().toLowerCase()}%`);
      const searchIdx = params.length;
      conditions.push(`(
        lower(lead_item.customer_name) LIKE $${searchIdx} OR
        lower(lead_item.business_name) LIKE $${searchIdx} OR
        lead_item.normalized_mobile LIKE $${searchIdx} OR
        lower(lead_item.normalized_email) LIKE $${searchIdx}
      )`);
    }
    if (query.cursor) {
      const [cursorTime, cursorId] = query.cursor.split("_");
      if (cursorTime && cursorId) {
        params.push(new Date(Number(cursorTime)), cursorId);
        conditions.push(`(lead_item.created_at, lead_item.id) < ($${params.length - 1}, $${params.length})`);
      }
    }

    params.push(query.limit + 1);
    const limitParam = params.length;

    const result = await database.client.query<LeadRow>(`
      SELECT ${SELECT_LEAD_FIELDS}
      ${JOIN_USERS}
      WHERE ${conditions.join(" AND ")}
      ORDER BY lead_item.created_at DESC, lead_item.id DESC
      LIMIT $${limitParam}
    `, params);

    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const items = rows.map(mapLeadRow);

    let nextCursor: string | null = null;
    if (hasMore && rows.length > 0) {
      const last = rows[rows.length - 1]!;
      nextCursor = `${new Date(last.created_at).getTime()}_${last.id}`;
    }

    return { items, nextCursor };
  }

  async update(database: TransactionDatabase, tenantId: string, outletId: string, leadId: string, values: Record<string, unknown>): Promise<boolean> {
    const keys = Object.keys(values);
    if (keys.length === 0) return true;

    const setClauses: string[] = [];
    const params: unknown[] = [tenantId, outletId, leadId];

    keys.forEach((key) => {
      const col = key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
      if (key === "customFields") {
        params.push(JSON.stringify(values[key]));
        setClauses.push(`${col} = coalesce(${col}, '{}'::jsonb) || $${params.length}::jsonb`);
      } else {
        params.push(values[key]);
        setClauses.push(`${col} = $${params.length}`);
      }
    });

    setClauses.push("updated_at = now()");

    const result = await database.client.query(`
      UPDATE crm.leads
      SET ${setClauses.join(", ")}
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
    `, params);

    return (result.rowCount ?? 0) > 0;
  }

  async recordAssignment(
    database: TransactionDatabase,
    tenantId: string,
    leadId: string,
    assignedToUserId: string,
    assignedByUserId: string,
  ): Promise<void> {
    await database.client.query(`
      INSERT INTO crm.lead_assignment_history (tenant_id, lead_id, assigned_to_user_id, assigned_by_user_id)
      VALUES ($1, $2, $3, $4)
    `, [tenantId, leadId, assignedToUserId, assignedByUserId]);
  }

  async recordStageHistory(
    database: TransactionDatabase,
    tenantId: string,
    leadId: string,
    fromStage: PostgresLeadStage | null,
    toStage: PostgresLeadStage,
    changedByUserId: string,
  ): Promise<void> {
    await database.client.query(`
      INSERT INTO crm.lead_stage_history (tenant_id, lead_id, from_stage, to_stage, changed_by_user_id)
      VALUES ($1, $2, $3, $4, $5)
    `, [tenantId, leadId, fromStage, toStage, changedByUserId]);
  }

  async setRinging(database: TransactionDatabase, tenantId: string, outletId: string, leadId: string, ringing: boolean, userId: string): Promise<boolean> {
    const result = await database.client.query(`
      UPDATE crm.leads
      SET ringing = $4, updated_by_user_id = $5, updated_at = now()
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
    `, [tenantId, outletId, leadId, ringing, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async listRinging(database: TransactionDatabase, tenantId: string, query: PostgresLeadRingingQuery): Promise<PostgresLeadListResult> {
    return this.list(database, tenantId, {
      outletId: query.outletId,
      startDate: query.startDate,
      endDate: query.endDate,
      status: "RINGING",
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
  }

  async listRepeatedEnquiries(database: TransactionDatabase, tenantId: string, query: PostgresLeadRepeatedEnquiryQuery): Promise<PostgresRepeatedEnquiryResult> {
    const result = await this.list(database, tenantId, {
      outletId: query.outletId,
      startDate: query.startDate,
      endDate: query.endDate,
      ...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.search ? { search: query.search } : {}),
      limit: 500,
    });

    const groupsMap = new Map<string, { matchedOn: ("MOBILE" | "EMAIL" | "BUSINESS_NAME")[]; enquiries: PostgresLeadRecord[] }>();

    for (const lead of result.items) {
      const key = lead.normalizedMobile || lead.normalizedEmail || lead.businessName.toLowerCase();
      if (!key) continue;

      const existing = groupsMap.get(key);
      if (existing) {
        existing.enquiries.push(lead);
      } else {
        const matches: ("MOBILE" | "EMAIL" | "BUSINESS_NAME")[] = [];
        if (lead.normalizedMobile) matches.push("MOBILE");
        if (lead.normalizedEmail) matches.push("EMAIL");
        if (lead.businessName) matches.push("BUSINESS_NAME");
        groupsMap.set(key, { matchedOn: matches, enquiries: [lead] });
      }
    }

    const repeatedGroups: PostgresRepeatedEnquiryGroup[] = [];
    let totalEnquiries = 0;

    for (const [key, group] of groupsMap.entries()) {
      if (group.enquiries.length > 1) {
        repeatedGroups.push({
          id: key,
          latestCreatedDate: Math.max(...group.enquiries.map((item) => item.createdDate)),
          matchedOn: group.matchedOn,
          enquiries: group.enquiries,
        });
        totalEnquiries += group.enquiries.length;
      }
    }

    repeatedGroups.sort((first, second) => second.latestCreatedDate - first.latestCreatedDate);

    const sliced = repeatedGroups.slice(0, query.limit);

    return {
      groups: sliced,
      totalGroups: repeatedGroups.length,
      totalEnquiries,
      truncated: repeatedGroups.length > query.limit,
    };
  }

  async listAnalyticsRecords(
    database: TransactionDatabase,
    tenantId: string,
    query: LeadAnalyticsQuery,
  ): Promise<LeadAnalyticsRecord[]> {
    const result = await database.client.query<{
      stage: string; source: string; assigned_to: string; created_at: Date; stage_category: string;
    }>(`
      SELECT l.stage::text AS stage, l.source,
        bps.stage_category,
        coalesce(l.assigned_to_user_id::text, '') AS assigned_to, l.created_at
      FROM crm.leads l
      LEFT JOIN crm.business_pipeline_stages bps ON bps.id = l.stage_id
      WHERE l.tenant_id = $1 AND l.outlet_id = $2
        AND l.created_at >= $3 AND l.created_at <= $4
      ORDER BY l.created_at DESC
      LIMIT 5001
    `, [tenantId, query.outletId, toQueryDate(query.startDate, "startDate"), toQueryDate(query.endDate, "endDate")]);
    if (result.rows.length > 5_000) {
      throw new AppError(413, "Lead report exceeds the maximum supported size", "LEAD_REPORT_TOO_LARGE");
    }
    return result.rows.map((row) => ({
      stage: row.stage,
      stageCategory: row.stage_category,
      source: row.source,
      assignedTo: row.assigned_to,
      createdDate: new Date(row.created_at).getTime(),
    }));
  }

  async listCityStateStages(
    database: TransactionDatabase,
    tenantId: string,
    query: LeadCityStateReportQuery,
  ): Promise<LeadCityStateStageRecord[]> {
    const result = await database.client.query<LeadCityStateStageRecord>(`
      SELECT city, state, stage::text AS stage
      FROM crm.leads
      WHERE tenant_id = $1 AND outlet_id = $2
        AND created_at >= $3 AND created_at <= $4
      ORDER BY created_at DESC
      LIMIT 5001
    `, [tenantId, query.outletId, toQueryDate(query.startDate, "startDate"), toQueryDate(query.endDate, "endDate")]);
    if (result.rows.length > 5_000) {
      throw new AppError(413, "Lead report exceeds the maximum supported size", "LEAD_REPORT_TOO_LARGE");
    }
    return result.rows;
  }

  async listFunnelStages(
    database: TransactionDatabase,
    tenantId: string,
    query: LeadFunnelReportQuery,
  ): Promise<LeadFunnelStageRecord[]> {
    const conditions = [
      "l.tenant_id = $1",
      "l.outlet_id = $2",
      "l.created_at >= $3",
      "l.created_at <= $4",
    ];
    const params: unknown[] = [
      tenantId,
      query.outletId,
      toQueryDate(query.startDate, "startDate"),
      toQueryDate(query.endDate, "endDate"),
    ];
    if (query.assignedTo) {
      params.push(query.assignedTo);
      conditions.push(`l.assigned_to_user_id = $${params.length}`);
    }
    const result = await database.client.query<{ stage: string; source: string; assigned_to: string; stage_category: string }>(`
      SELECT l.stage::text AS stage, l.source, coalesce(l.assigned_to_user_id::text, '') AS assigned_to
        , bps.stage_category
      FROM crm.leads l
      LEFT JOIN crm.business_pipeline_stages bps ON bps.id = l.stage_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY l.created_at DESC
      LIMIT 5001
    `, params);
    if (result.rows.length > 5_000) {
      throw new AppError(413, "Lead report exceeds the maximum supported size", "LEAD_REPORT_TOO_LARGE");
    }
    return result.rows.map((row) => ({ stage: row.stage, stageCategory: row.stage_category, source: row.source, assignedTo: row.assigned_to }));
  }

  async listEmployeeSalesTargets(
    database: TransactionDatabase,
    tenantId: string,
    query: EmployeeSalesTargetQuery,
  ): Promise<EmployeeSalesTargetRecord[]> {
    const result = await database.client.query<EmployeeSalesTargetRow>(`
      SELECT id, outlet_id, zone, sale_executive, sale_executive_user_id,
        forecast_net_sales, achieved_net_sales, display_order, target_month,
        target_year, created_at, updated_at
      FROM crm.employee_sales_targets
      WHERE tenant_id = $1 AND outlet_id = $2 AND target_month = $3 AND target_year = $4
      ORDER BY CASE zone
        WHEN 'South' THEN 1 WHEN 'West' THEN 2 WHEN 'East' THEN 3
        WHEN 'North' THEN 4 ELSE 5 END, display_order, created_at
    `, [tenantId, query.outletId, query.month, query.year]);
    return result.rows.map(mapEmployeeSalesTarget);
  }

  async syncEmployeeSalesTargets(
    database: TransactionDatabase,
    tenantId: string,
    actorUserId: string,
    input: EmployeeSalesTargetSyncInput,
  ): Promise<EmployeeSalesTargetRecord[]> {
    for (const item of input.items) {
      const result = await database.client.query<EmployeeSalesTargetRow>(`
        INSERT INTO crm.employee_sales_targets (
          id, tenant_id, outlet_id, sale_executive_user_id, created_by_user_id,
          updated_by_user_id, zone, sale_executive, forecast_net_sales,
          achieved_net_sales, display_order, target_month, target_year
        ) VALUES (
          coalesce($1::uuid, public.uuid_generate_v7()), $2, $3, $4, $5,
          $5, $6, $7, $8, $9, $10, $11, $12
        )
        ON CONFLICT (id) DO UPDATE SET
          sale_executive_user_id = EXCLUDED.sale_executive_user_id,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          zone = EXCLUDED.zone,
          sale_executive = EXCLUDED.sale_executive,
          forecast_net_sales = EXCLUDED.forecast_net_sales,
          achieved_net_sales = EXCLUDED.achieved_net_sales,
          display_order = EXCLUDED.display_order,
          target_month = EXCLUDED.target_month,
          target_year = EXCLUDED.target_year
        WHERE employee_sales_targets.tenant_id = EXCLUDED.tenant_id
          AND employee_sales_targets.outlet_id = EXCLUDED.outlet_id
        RETURNING id, outlet_id, zone, sale_executive, sale_executive_user_id,
          forecast_net_sales, achieved_net_sales, display_order, target_month,
          target_year, created_at, updated_at
      `, [
        item.id ?? null, tenantId, input.outletId, item.saleExecutiveId ?? null,
        actorUserId, item.zone, item.saleExecutive, item.decForecastNetSales,
        item.achieveNetSales, item.order, input.month, input.year,
      ]);
      if (!result.rows[0]) {
        throw new AppError(404, "Employee sales target not found", "EMPLOYEE_TARGET_NOT_FOUND");
      }
    }
    return this.listEmployeeSalesTargets(database, tenantId, input);
  }

  async deleteEmployeeSalesTarget(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    targetId: string,
  ): Promise<boolean> {
    const result = await database.client.query(`
      DELETE FROM crm.employee_sales_targets
      WHERE id = $1 AND tenant_id = $2 AND outlet_id = $3
      RETURNING id
    `, [targetId, tenantId, outletId]);
    return (result.rowCount ?? 0) > 0;
  }
  async createShareToken(database: TransactionDatabase, tenantId: string, leadId: string, token: string, createdByUserId: string): Promise<void> {
    await database.client.query(`
      INSERT INTO crm.lead_share_tokens (tenant_id, lead_id, token, created_by_user_id)
      VALUES ($1, $2, $3, $4)
    `, [tenantId, leadId, token, createdByUserId]);
  }

  async getSharedLead(database: TransactionDatabase, token: string): Promise<PostgresLeadRecord | null> {
    const result = await database.client.query<LeadRow>(`
      SELECT ${SELECT_LEAD_FIELDS}
      ${JOIN_USERS}
      JOIN crm.lead_share_tokens token_item ON token_item.lead_id = lead_item.id AND token_item.tenant_id = lead_item.tenant_id
      WHERE token_item.token = $1 AND (token_item.expires_at IS NULL OR token_item.expires_at > now())
    `, [token]);
    return result.rows[0] ? mapLeadRow(result.rows[0]) : null;
  }
}

export const postgresLeadRepository = new PostgresLeadRepository();
