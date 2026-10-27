import { FunctionTool } from "@google/adk";
import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import type { TransactionDatabase } from "../../../db/context.js";
import { AppError } from "../../../errors/appError.js";
import { createPromiseTtlCache } from "../../../utils/promiseTtlCache.js";
import { postgresAuthorizationRepository } from "../../authorization/postgresAuthorization.repository.js";
import { postgresLeadService } from "../../leads/postgresLead.service.js";
import { embedText } from "./embeddingService.js";
import {
  type PendingTargetAction,
  type PendingTargetSingle,
  type PendingTargetBulk,
  PENDING_ACTION_TTL_MS,
  storePending,
} from "../confirmation/pendingActionsStore.js";

// ---------------------------------------------------------------------------
// Date utilities — IST-aware, used by all date-ranged tools
// ---------------------------------------------------------------------------

const CRM_TIME_ZONE = "Asia/Kolkata";
const CRM_UTC_OFFSET = "+05:30";
export const isoDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const todayInCrmTimeZone = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: CRM_TIME_ZONE }).format(new Date());

export function toDateRange(fromDate?: string, toDate?: string) {
  const range: { startDate?: number; endDate?: number } = {};
  if (fromDate) range.startDate = Date.parse(`${fromDate}T00:00:00.000${CRM_UTC_OFFSET}`);
  if (toDate) range.endDate = Date.parse(`${toDate}T23:59:59.999${CRM_UTC_OFFSET}`);
  if (
    (range.startDate !== undefined && Number.isNaN(range.startDate)) ||
    (range.endDate !== undefined && Number.isNaN(range.endDate))
  ) {
    throw new AppError(400, "Invalid date range", "INVALID_DATE");
  }
  if (
    range.startDate !== undefined &&
    range.endDate !== undefined &&
    range.startDate > range.endDate
  ) {
    throw new AppError(400, "fromDate must not be after toDate", "INVALID_DATE_RANGE");
  }
  return range;
}

const dateRangeProperties = {
  fromDate: {
    type: Type.STRING,
    description: "Optional first day of the lead created-date range, inclusive, as YYYY-MM-DD (India time).",
  },
  toDate: {
    type: Type.STRING,
    description: "Optional last day of the lead created-date range, inclusive, as YYYY-MM-DD (India time).",
  },
} satisfies Record<string, Schema>;

// 30-second in-process cache for read-only aggregate queries.
const analyticsCache = createPromiseTtlCache<unknown>({ maxEntries: 500, ttlMs: 30_000 });

// ---------------------------------------------------------------------------
// Tool factory — called once per request
// ---------------------------------------------------------------------------

export const createTools = (
  database: TransactionDatabase,
  tenantId: string,
  userId: string,
  outletId: string,
  _pendingKey: string,
) => {
  let _writePending: PendingTargetAction | null = null;
  const dateRangeArgs = z.object({
    fromDate: isoDateSchema.optional(),
    toDate: isoDateSchema.optional(),
  });
  const leadSearchArgs = dateRangeArgs.extend({
    searchText: z.string().trim().min(1).max(120).optional(),
    stage: z.string().trim().min(1).max(100).optional(),
  });

  let permissionVerified = false;
  const assertLeadRead = async () => {
    if (permissionVerified) return;
    const allowed = await postgresAuthorizationRepository.hasOutletPermission(
      database, userId, tenantId, outletId, "leads.read",
    );
    if (!allowed) throw new AppError(403, "Permission denied for reading leads", "PERMISSION_DENIED");
    permissionVerified = true;
  };

  const getLeadStageSummary = new FunctionTool({
    name: "get_lead_stage_summary",
    description:
      "Use ONLY for questions about lead counts, stage breakdown, or closing/conversion rates. " +
      "Returns exact lead counts grouped by pipeline stage, plus calculated closing rate (won ÷ (won+lost)) and conversion rate (won ÷ total). " +
      "DO NOT use this for generic sales advice questions — only for factual count/rate questions.",
    parameters: { type: Type.OBJECT, properties: dateRangeProperties } satisfies Schema,
    execute: async (input) => {
      const { fromDate, toDate } = dateRangeArgs.parse(input);
      const { startDate, endDate } = toDateRange(fromDate, toDate);
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:stage_summary:${fromDate ?? ""}:${toDate ?? ""}`;
      return analyticsCache.get(cacheKey, async () => {
        const params: unknown[] = [tenantId, outletId];
        const conditions = ["tenant_id = $1", "outlet_id = $2"];
        if (startDate !== undefined) { params.push(new Date(startDate)); conditions.push(`created_at >= $${params.length}`); }
        if (endDate !== undefined) { params.push(new Date(endDate)); conditions.push(`created_at <= $${params.length}`); }
        const result = await database.client.query<{ stage: string; count: string }>(
          `SELECT stage::text AS stage, count(*)::text AS count FROM crm.leads WHERE ${conditions.join(" AND ")} GROUP BY stage ORDER BY stage`,
          params,
        );
        const stages = result.rows.map(({ stage, count }) => ({ stage, count: Number(count) }));
        const total = stages.reduce((s, r) => s + r.count, 0);
        const won = stages.find((s) => s.stage === "WON")?.count ?? 0;
        const lost = stages.find((s) => s.stage === "LOST")?.count ?? 0;
        const closingBase = won + lost;
        return {
          fromDate: fromDate ?? null, toDate: toDate ?? null, total, stages,
          closingRate: closingBase > 0 ? parseFloat(((won / closingBase) * 100).toFixed(1)) : null,
          conversionRate: total > 0 ? parseFloat(((won / total) * 100).toFixed(1)) : null,
        };
      });
    },
  });

  const searchLeads = new FunctionTool({
    name: "search_leads",
    description:
      "Use ONLY when the user wants to see, find, or list specific leads by name, business, stage, or date. " +
      "Returns up to 10 leads (newest first). " +
      "DO NOT use this to count leads or perform analytics — use get_lead_stage_summary for counts.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        searchText: { type: Type.STRING, description: "Optional search words, person name, or business name" },
        stage: { type: Type.STRING, description: "Optional exact pipeline stage: NEW, ASSIGNED, FOLLOWUP, RINGING, WON, LOST, DISQUALIFIED" },
        ...dateRangeProperties,
      },
    } satisfies Schema,
    execute: async (input) => {
      const { searchText, stage, fromDate, toDate } = leadSearchArgs.parse(input);
      const range = toDateRange(fromDate, toDate);
      await assertLeadRead();
      const results = await postgresLeadService.list(database, tenantId, userId, {
        outletId,
        ...(searchText ? { search: searchText } : {}),
        ...(stage ? { stage } : {}),
        ...range,
        limit: 10,
      });
      return {
        returned: results.items.length,
        hasMore: Boolean(results.nextCursor),
        leads: results.items.map((lead) => ({
          name: lead.customerName, businessName: lead.businessName, stage: lead.stage,
          city: lead.city, state: lead.state, assignedTo: lead.assignedTo, createdDate: lead.createdDate,
        })),
      };
    },
  });

  const getLeadAgeingSummary = new FunctionTool({
    name: "get_lead_ageing_summary",
    description:
      "Use when the user asks about stale leads, old leads, or how long active leads have been in the pipeline. " +
      "Returns active (not WON/LOST/DISQUALIFIED) leads grouped by age since creation.",
    parameters: { type: Type.OBJECT, properties: {} } satisfies Schema,
    execute: async (_input) => {
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:ageing`;
      return analyticsCache.get(cacheKey, async () => {
        const result = await database.client.query<{ age_bucket: string; count: string }>(
          `SELECT
            CASE
              WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 < 2  THEN '0-1 days'
              WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 < 4  THEN '2-3 days'
              WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 < 8  THEN '4-7 days'
              WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 < 15 THEN '8-14 days'
              ELSE '15+ days'
            END AS age_bucket, count(*)::text AS count
           FROM crm.leads WHERE tenant_id = $1 AND outlet_id = $2 AND stage NOT IN ('WON', 'LOST', 'DISQUALIFIED')
           GROUP BY age_bucket`,
          [tenantId, outletId],
        );
        const BUCKET_ORDER = ["0-1 days", "2-3 days", "4-7 days", "8-14 days", "15+ days"];
        const buckets = result.rows
          .map(({ age_bucket, count }) => ({ ageBucket: age_bucket, count: Number(count) }))
          .sort((a, b) => BUCKET_ORDER.indexOf(a.ageBucket) - BUCKET_ORDER.indexOf(b.ageBucket));
        return { buckets, totalActive: buckets.reduce((s, b) => s + b.count, 0) };
      });
    },
  });

  const getSalespersonPerformance = new FunctionTool({
    name: "get_salesperson_performance",
    description:
      "Use when the user asks about salesperson performance, who is closing the most deals, or team results. " +
      "Returns lead totals, won, lost, and closing rate per salesperson. Optionally filter by date range.",
    parameters: { type: Type.OBJECT, properties: dateRangeProperties } satisfies Schema,
    execute: async (input) => {
      const { fromDate, toDate } = dateRangeArgs.parse(input);
      const { startDate, endDate } = toDateRange(fromDate, toDate);
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:salesperson:${fromDate ?? ""}:${toDate ?? ""}`;
      return analyticsCache.get(cacheKey, async () => {
        const params: unknown[] = [tenantId, outletId];
        const conditions = ["l.tenant_id = $1", "l.outlet_id = $2"];
        if (startDate !== undefined) { params.push(new Date(startDate)); conditions.push(`l.created_at >= $${params.length}`); }
        if (endDate !== undefined) { params.push(new Date(endDate)); conditions.push(`l.created_at <= $${params.length}`); }
        const result = await database.client.query<{ salesperson: string; total: string; won: string; lost: string; active: string }>(
          `SELECT coalesce(u.display_name, 'Unassigned') AS salesperson,
            count(*) AS total,
            count(*) FILTER (WHERE l.stage = 'WON') AS won,
            count(*) FILTER (WHERE l.stage = 'LOST') AS lost,
            count(*) FILTER (WHERE l.stage NOT IN ('WON', 'LOST', 'DISQUALIFIED')) AS active
           FROM crm.leads l LEFT JOIN iam.users u ON u.id = l.assigned_to_user_id
           WHERE ${conditions.join(" AND ")}
           GROUP BY l.assigned_to_user_id, u.display_name
           ORDER BY count(*) FILTER (WHERE l.stage = 'WON') DESC, count(*) DESC LIMIT 20`,
          params,
        );
        return {
          fromDate: fromDate ?? null, toDate: toDate ?? null,
          salespersons: result.rows.map(({ salesperson, total, won, lost, active }) => {
            const wonN = Number(won); const lostN = Number(lost); const closingBase = wonN + lostN;
            return { salesperson, total: Number(total), won: wonN, lost: lostN, active: Number(active),
              closingRate: closingBase > 0 ? parseFloat(((wonN / closingBase) * 100).toFixed(1)) : null };
          }),
        };
      });
    },
  });

  const getLeadSourceSummary = new FunctionTool({
    name: "get_lead_source_summary",
    description:
      "Use when the user asks where leads are coming from, which channels are most effective, or lead source analysis. " +
      "Returns lead counts and conversion rates per source.",
    parameters: { type: Type.OBJECT, properties: dateRangeProperties } satisfies Schema,
    execute: async (input) => {
      const { fromDate, toDate } = dateRangeArgs.parse(input);
      const { startDate, endDate } = toDateRange(fromDate, toDate);
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:source:${fromDate ?? ""}:${toDate ?? ""}`;
      return analyticsCache.get(cacheKey, async () => {
        const params: unknown[] = [tenantId, outletId];
        const conditions = ["tenant_id = $1", "outlet_id = $2"];
        if (startDate !== undefined) { params.push(new Date(startDate)); conditions.push(`created_at >= $${params.length}`); }
        if (endDate !== undefined) { params.push(new Date(endDate)); conditions.push(`created_at <= $${params.length}`); }
        const result = await database.client.query<{ source: string; total: string; won: string }>(
          `SELECT coalesce(nullif(trim(source), ''), 'Unknown') AS source, count(*) AS total,
            count(*) FILTER (WHERE stage = 'WON') AS won
           FROM crm.leads WHERE ${conditions.join(" AND ")}
           GROUP BY source ORDER BY count(*) DESC LIMIT 15`,
          params,
        );
        return {
          fromDate: fromDate ?? null, toDate: toDate ?? null,
          sources: result.rows.map(({ source, total, won }) => {
            const totalN = Number(total); const wonN = Number(won);
            return { source, total: totalN, won: wonN, conversionRate: totalN > 0 ? parseFloat(((wonN / totalN) * 100).toFixed(1)) : null };
          }),
        };
      });
    },
  });

  const getTaskSummary = new FunctionTool({
    name: "get_task_summary",
    description:
      "Use when the user asks about tasks: how many open, overdue, completed, or in-progress tasks exist. " +
      "Returns task counts by status, overdue count, and breakdown by assignee.",
    parameters: { type: Type.OBJECT, properties: {} } satisfies Schema,
    execute: async (_input) => {
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:tasks`;
      return analyticsCache.get(cacheKey, async () => {
        const [statusResult, overdueResult, assigneeResult] = await Promise.all([
          database.client.query<{ status: string; count: string }>(
            `SELECT status, count(*)::text AS count FROM crm.tasks WHERE tenant_id = $1 AND outlet_id = $2 AND deleted_at IS NULL GROUP BY status ORDER BY status`,
            [tenantId, outletId],
          ),
          database.client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM crm.tasks WHERE tenant_id = $1 AND outlet_id = $2 AND deleted_at IS NULL AND due_at < NOW() AND status NOT IN ('COMPLETED', 'CANCELLED')`,
            [tenantId, outletId],
          ),
          database.client.query<{ assignee: string; open: string; total: string }>(
            `SELECT coalesce(u.display_name, 'Unassigned') AS assignee,
                    count(*) FILTER (WHERE t.status NOT IN ('COMPLETED','CANCELLED')) AS open,
                    count(*) AS total
             FROM crm.tasks t LEFT JOIN iam.users u ON u.id = t.assigned_to_user_id
             WHERE t.tenant_id = $1 AND t.outlet_id = $2 AND t.deleted_at IS NULL
             GROUP BY u.display_name ORDER BY open DESC LIMIT 10`,
            [tenantId, outletId],
          ),
        ]);
        const byStatus = statusResult.rows.map(({ status, count }) => ({ status, count: Number(count) }));
        return {
          total: byStatus.reduce((s, r) => s + r.count, 0),
          overdue: Number(overdueResult.rows[0]?.count ?? 0),
          byStatus,
          byAssignee: assigneeResult.rows.map(({ assignee, open, total: t }) => ({
            assignee, open: Number(open), total: Number(t),
          })),
        };
      });
    },
  });

  const getActivitySummary = new FunctionTool({
    name: "get_activity_summary",
    description:
      "Use when the user asks about activities: follow-ups, demos, visits, installations scheduled or pending. " +
      "Returns activity counts by type and status, upcoming activities in the next 7 days, and overdue activities.",
    parameters: { type: Type.OBJECT, properties: dateRangeProperties } satisfies Schema,
    execute: async (input) => {
      const { fromDate, toDate } = dateRangeArgs.parse(input);
      const { startDate, endDate } = toDateRange(fromDate, toDate);
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:activities:${fromDate ?? ""}:${toDate ?? ""}`;
      return analyticsCache.get(cacheKey, async () => {
        const params: unknown[] = [tenantId, outletId];
        const conditions = ["tenant_id = $1", "outlet_id = $2"];
        if (startDate !== undefined) { params.push(new Date(startDate)); conditions.push(`created_at >= $${params.length}`); }
        if (endDate !== undefined) { params.push(new Date(endDate)); conditions.push(`created_at <= $${params.length}`); }
        const [typeResult, upcomingResult, overdueResult] = await Promise.all([
          database.client.query<{ activity_type: string; status: string; count: string }>(
            `SELECT activity_type, status, count(*)::text AS count FROM crm.activities WHERE ${conditions.join(" AND ")} GROUP BY activity_type, status ORDER BY activity_type, status`,
            params,
          ),
          database.client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM crm.activities WHERE tenant_id = $1 AND outlet_id = $2 AND status = 'PENDING' AND scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '7 days'`,
            [tenantId, outletId],
          ),
          database.client.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM crm.activities WHERE tenant_id = $1 AND outlet_id = $2 AND status = 'PENDING' AND scheduled_at < NOW()`,
            [tenantId, outletId],
          ),
        ]);
        type TypeRow = Record<string, { pending: number; done: number; total: number }>;
        const byType = typeResult.rows.reduce<TypeRow>((acc, row) => {
          if (!acc[row.activity_type]) acc[row.activity_type] = { pending: 0, done: 0, total: 0 };
          const bucket = acc[row.activity_type]!;
          const n = Number(row.count);
          bucket.total += n;
          if (row.status === "PENDING") bucket.pending += n; else bucket.done += n;
          return acc;
        }, {});
        return {
          byType: Object.entries(byType).map(([type, v]) => ({ type, ...v })),
          upcomingNext7Days: Number(upcomingResult.rows[0]?.count ?? 0),
          overdueActivities: Number(overdueResult.rows[0]?.count ?? 0),
        };
      });
    },
  });

  const getCustomerSummary = new FunctionTool({
    name: "get_customer_summary",
    description:
      "Use when the user asks about customers: total customer count, new vs repeat customers, or customer lifecycle breakdown. " +
      "Returns customers grouped by lifecycle and status.",
    parameters: { type: Type.OBJECT, properties: {} } satisfies Schema,
    execute: async (_input) => {
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:customers`;
      return analyticsCache.get(cacheKey, async () => {
        const result = await database.client.query<{ lifecycle: string; status: string; count: string }>(
          `SELECT c.lifecycle::text, c.status::text, count(*)::text AS count
           FROM crm.customers c JOIN crm.customer_outlets co ON co.customer_id = c.id
           WHERE c.tenant_id = $1 AND co.outlet_id = $2
           GROUP BY c.lifecycle, c.status ORDER BY c.lifecycle, c.status`,
          [tenantId, outletId],
        );
        const rows = result.rows.map(({ lifecycle, status, count }) => ({ lifecycle, status, count: Number(count) }));
        const total = rows.reduce((s, r) => s + r.count, 0);
        const active = rows.filter((r) => r.status === "ACTIVE").reduce((s, r) => s + r.count, 0);
        return { total, active, inactive: total - active, byLifecycle: rows };
      });
    },
  });

  const getLeadCitySummary = new FunctionTool({
    name: "get_lead_city_summary",
    description:
      "Use when the user asks which city or location has the most leads, or wants a geographic breakdown of leads. " +
      "Returns top cities by lead count with won counts and conversion rate per city.",
    parameters: { type: Type.OBJECT, properties: dateRangeProperties } satisfies Schema,
    execute: async (input) => {
      const { fromDate, toDate } = dateRangeArgs.parse(input);
      const { startDate, endDate } = toDateRange(fromDate, toDate);
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:city:${fromDate ?? ""}:${toDate ?? ""}`;
      return analyticsCache.get(cacheKey, async () => {
        const params: unknown[] = [tenantId, outletId];
        const conditions = ["tenant_id = $1", "outlet_id = $2"];
        if (startDate !== undefined) { params.push(new Date(startDate)); conditions.push(`created_at >= $${params.length}`); }
        if (endDate !== undefined) { params.push(new Date(endDate)); conditions.push(`created_at <= $${params.length}`); }
        const result = await database.client.query<{ city: string; total: string; won: string }>(
          `SELECT coalesce(nullif(trim(city), ''), 'Unknown') AS city, count(*) AS total,
            count(*) FILTER (WHERE stage = 'WON') AS won
           FROM crm.leads WHERE ${conditions.join(" AND ")}
           GROUP BY city ORDER BY count(*) DESC LIMIT 15`,
          params,
        );
        return {
          cities: result.rows.map(({ city, total, won }) => {
            const totalN = Number(total); const wonN = Number(won);
            return { city, total: totalN, won: wonN, conversionRate: totalN > 0 ? parseFloat(((wonN / totalN) * 100).toFixed(1)) : null };
          }),
        };
      });
    },
  });

  const getRepeatedEnquirySummary = new FunctionTool({
    name: "get_repeated_enquiry_summary",
    description:
      "Use when the user asks about repeated enquiries, duplicate leads, or the same customer enquiring multiple times. " +
      "Returns count of leads with duplicate mobile numbers and which stages they are in.",
    parameters: { type: Type.OBJECT, properties: {} } satisfies Schema,
    execute: async (_input) => {
      await assertLeadRead();
      const cacheKey = `${tenantId}:${outletId}:repeated`;
      return analyticsCache.get(cacheKey, async () => {
        const result = await database.client.query<{ stage: string; repeated_leads: string; unique_mobiles: string }>(
          `WITH mobile_counts AS (
             SELECT normalized_mobile, count(*) AS enquiry_count FROM crm.leads
             WHERE tenant_id = $1 AND outlet_id = $2 AND normalized_mobile <> ''
             GROUP BY normalized_mobile HAVING count(*) > 1
           )
           SELECT l.stage, count(*)::text AS repeated_leads,
                  count(DISTINCT l.normalized_mobile)::text AS unique_mobiles
           FROM crm.leads l JOIN mobile_counts mc ON mc.normalized_mobile = l.normalized_mobile
           WHERE l.tenant_id = $1 AND l.outlet_id = $2
           GROUP BY l.stage ORDER BY count(*) DESC`,
          [tenantId, outletId],
        );
        const byStage = result.rows.map(({ stage, repeated_leads, unique_mobiles }) => ({
          stage, repeatedLeads: Number(repeated_leads), uniqueMobiles: Number(unique_mobiles),
        }));
        return {
          totalRepeatedLeads: byStage.reduce((s, r) => s + r.repeatedLeads, 0),
          totalUniqueRepeatMobiles: byStage.reduce((s, r) => s + r.uniqueMobiles, 0),
          byStage,
        };
      });
    },
  });

  const semanticSearchLeads = new FunctionTool({
    name: "semantic_search_leads",
    description:
      "Find leads by meaning or intent using natural language. " +
      "Use when the user describes what they are looking for in plain words (e.g. 'rooftop solar prospects', 'large enterprise clients', 'interested in demo'). " +
      "Returns the most semantically similar leads even if they share no exact words with the query. " +
      "DO NOT use for counting — use get_lead_stage_summary for that.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Natural language description of the leads to find." },
        limit: { type: Type.NUMBER, description: "Maximum results to return (default 8, max 20)." },
      },
      required: ["query"],
    } satisfies Schema,
    execute: async (rawInput) => {
      const input = z.object({
        query: z.string().trim().min(1).max(300),
        limit: z.number().int().min(1).max(20).default(8),
      }).parse(rawInput);

      await assertLeadRead();

      const vec = await embedText(input.query);
      const result = await database.client.query<{
        id: string; business_name: string | null; stage: string;
        city: string | null; assigned_name: string | null; similarity: string;
      }>(
        `SELECT l.id, l.business_name, l.stage::text AS stage, l.city,
                coalesce(u.display_name, 'Unassigned') AS assigned_name,
                (1 - (l.embedding <=> $3::vector))::numeric(5,4)::text AS similarity
         FROM crm.leads l
         LEFT JOIN iam.users u ON u.id = l.assigned_to_user_id
         WHERE l.tenant_id = $1
           AND l.outlet_id = $2
           AND l.embedding IS NOT NULL
         ORDER BY l.embedding <=> $3::vector
         LIMIT $4`,
        [tenantId, outletId, JSON.stringify(vec), input.limit],
      );

      return {
        query: input.query,
        returned: result.rows.length,
        leads: result.rows.map(({ id, business_name, stage, city, assigned_name, similarity }) => ({
          id, businessName: business_name, stage, city, assignedTo: assigned_name,
          similarity: parseFloat(similarity),
        })),
      };
    },
  });

  const setEmployeeTarget = new FunctionTool({
    name: "set_employee_target",
    description:
      "Use ONLY when the user explicitly asks to set, assign, or update a forecast sales target for an employee. " +
      "Finds the employee by name, upserts the target for the given zone and month, and returns a confirmation. " +
      "DO NOT use this for reading or analysing targets — only when the user wants to write a new target.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        employeeName: { type: Type.STRING, description: "Full or partial name of the employee. Use 'Sale from HO' or 'New Dealer' for special entries." },
        zone: { type: Type.STRING, description: "Sales zone: South, West, East, North, or Subscriptions." },
        forecastNetSales: { type: Type.NUMBER, description: "Target forecast amount in rupees (numeric, no currency symbol)." },
        month: { type: Type.NUMBER, description: "Month number 1–12 (defaults to current month if omitted)." },
        year: { type: Type.NUMBER, description: "4-digit year, e.g. 2025 (defaults to current year if omitted)." },
      },
      required: ["employeeName", "zone", "forecastNetSales"],
    } satisfies Schema,
    execute: async (rawInput) => {
      const input = z.object({
        employeeName: z.string().trim().min(1).max(120),
        zone: z.enum(["South", "West", "East", "North", "Subscriptions"]),
        forecastNetSales: z.number().min(0),
        month: z.number().int().min(1).max(12).optional(),
        year: z.number().int().min(2020).max(2100).optional(),
      }).parse(rawInput);

      const canWrite = await postgresAuthorizationRepository.hasOutletPermission(
        database, userId, tenantId, outletId, "lead_targets.create",
      );
      if (!canWrite) return { success: false, error: "You do not have permission to set employee targets." };

      const now = new Date();
      const targetMonth = input.month ?? (now.getMonth() + 1);
      const targetYear = input.year ?? now.getFullYear();

      const SPECIAL = ["Sale from HO", "New Dealer"];
      const isSpecial = SPECIAL.includes(input.employeeName);
      let saleExecutiveId: string | null = null;
      let resolvedName = input.employeeName;

      if (!isSpecial) {
        const safeName = input.employeeName.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
        const userRow = await database.client.query<{ id: string; display_name: string }>(
          `SELECT id, display_name FROM iam.users WHERE tenant_id = $1 AND lower(display_name) LIKE lower($2) ESCAPE '\\' ORDER BY display_name LIMIT 1`,
          [tenantId, `%${safeName}%`],
        );
        if (!userRow.rows[0]) return { success: false, error: `Employee "${input.employeeName}" not found in this CRM workspace.` };
        saleExecutiveId = userRow.rows[0].id;
        resolvedName = userRow.rows[0].display_name;
      }

      const action: PendingTargetSingle = {
        type: "single", resolvedName, resolvedId: saleExecutiveId,
        zone: input.zone, forecastNetSales: input.forecastNetSales,
        month: targetMonth, year: targetYear, tenantId, outletId,
        requestingUserId: userId, expiresAt: Date.now() + PENDING_ACTION_TTL_MS,
      };
      storePending(_pendingKey, action);
      _writePending = action;

      return { status: "REQUIRES_CONFIRMATION", employee: resolvedName, zone: input.zone, amount: input.forecastNetSales, month: targetMonth, year: targetYear };
    },
  });

  const setAllEmployeeTargets = new FunctionTool({
    name: "set_all_employee_targets",
    description:
      "Use ONLY when the user explicitly asks to set the SAME forecast sales target for ALL employees at once. " +
      "When a zone is given, finds ALL outlet users from IAM. When no zone, only updates employees with existing target rows. " +
      "ALWAYS pass the zone if the user mentions one. DO NOT use this for a single employee.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        forecastNetSales: { type: Type.NUMBER, description: "Target forecast amount in rupees (numeric, no currency symbol)." },
        zone: { type: Type.STRING, description: "Zone to apply: South, West, East, North, or Subscriptions. Pass whenever the user mentions a zone." },
        month: { type: Type.NUMBER, description: "Month number 1–12 (defaults to current month if omitted)." },
        year: { type: Type.NUMBER, description: "4-digit year, e.g. 2025 (defaults to current year if omitted)." },
      },
      required: ["forecastNetSales"],
    } satisfies Schema,
    execute: async (rawInput) => {
      const input = z.object({
        forecastNetSales: z.number().min(0),
        zone: z.enum(["South", "West", "East", "North", "Subscriptions"]).optional(),
        month: z.number().int().min(1).max(12).optional(),
        year: z.number().int().min(2020).max(2100).optional(),
      }).parse(rawInput);

      const canWrite = await postgresAuthorizationRepository.hasOutletPermission(
        database, userId, tenantId, outletId, "lead_targets.create",
      );
      if (!canWrite) return { success: false, error: "You do not have permission to set employee targets." };

      const now = new Date();
      const targetMonth = input.month ?? (now.getMonth() + 1);
      const targetYear = input.year ?? now.getFullYear();

      let employees: Array<{ userId: string; name: string; zone: string }>;

      if (input.zone) {
        const iamResult = await database.client.query<{ user_id: string; display_name: string }>(
          `SELECT DISTINCT u.id AS user_id, u.display_name
           FROM tenancy.outlet_assignments oa JOIN iam.users u ON u.id = oa.user_id AND u.tenant_id = $1
           WHERE oa.tenant_id = $1 AND oa.outlet_id = $2 AND oa.active = true ORDER BY u.display_name`,
          [tenantId, outletId],
        );
        if (iamResult.rows.length === 0) return { success: false, error: "No users found for this outlet." };
        employees = iamResult.rows.map((r) => ({ userId: r.user_id, name: r.display_name, zone: input.zone! }));
      } else {
        const targetResult = await database.client.query<{ sale_executive_user_id: string; sale_executive: string; zone: string }>(
          `SELECT DISTINCT sale_executive_user_id, sale_executive, zone
           FROM crm.employee_sales_targets
           WHERE tenant_id = $1 AND outlet_id = $2 AND sale_executive_user_id IS NOT NULL AND sale_executive NOT IN ('Sale from HO', 'New Dealer')`,
          [tenantId, outletId],
        );
        if (targetResult.rows.length === 0) {
          return { success: false, error: "No employees found in the target table. Specify a zone to include all employees (e.g. 'set 300000 target to all employees South zone')." };
        }
        employees = targetResult.rows.map((r) => ({ userId: r.sale_executive_user_id, name: r.sale_executive, zone: r.zone }));
      }

      const zoneSummary = input.zone ? `${input.zone} zone` : "all zones";
      const bulkAction: PendingTargetBulk = {
        type: "bulk", employees, zoneSummary, forecastNetSales: input.forecastNetSales,
        month: targetMonth, year: targetYear, tenantId, outletId,
        requestingUserId: userId, expiresAt: Date.now() + PENDING_ACTION_TTL_MS,
      };
      storePending(_pendingKey, bulkAction);
      _writePending = bulkAction;

      return { status: "REQUIRES_CONFIRMATION", employeeCount: bulkAction.employees.length, zone: zoneSummary, amount: input.forecastNetSales, month: targetMonth, year: targetYear };
    },
  });

  return {
    tools: [
      getLeadStageSummary, searchLeads, semanticSearchLeads, getLeadAgeingSummary,
      getSalespersonPerformance, getLeadSourceSummary, getTaskSummary, getActivitySummary,
      getCustomerSummary, getLeadCitySummary, getRepeatedEnquirySummary,
      setEmployeeTarget, setAllEmployeeTargets,
    ],
    getWritePending: () => _writePending,
  };
};
