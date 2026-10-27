import { createHash, randomUUID } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "../src/config/env.js";
import { sanitizeRetrievalText } from "../src/modules/aiRetrieval/documents.js";
import { dossierErrorCode, dossierRetryPlan } from "../src/modules/aiDossiers/aiDossier.retry.js";
import { assertEvidenceReferences, synthesizeDossier, type DossierSynthesisResult } from "../src/modules/aiDossiers/aiDossier.synthesis.js";
import type { DossierSubjectType } from "../src/modules/aiDossiers/aiDossier.types.js";

const MAX_ATTEMPTS = 8;
const connectionString = env.database.adminUrl;

if (!connectionString) throw new Error("DATABASE_ADMIN_URL is required for dossier synthesis");
if (!env.aiDossiers.enabled) throw new Error("AI_CUSTOMER_DOSSIERS_ENABLED=false; synthesis is disabled");

const pool = new Pool({
  connectionString,
  max: 2,
  application_name: "sensible-crm-ai-dossier-worker",
  statement_timeout: 30_000,
  options: "-c timezone=UTC",
});

interface JobRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  outlet_id: string;
  subject_type: DossierSubjectType;
  subject_id: string;
  requested_by_user_id: string;
  lease_token: string;
  attempt_count: number;
}

interface SourceRecord extends Record<string, unknown> {
  sourceType: "lead" | "customer" | "timeline" | "quotation";
  sourceId: string;
}

interface SourceSnapshot {
  version: string;
  watermark: Record<string, unknown>;
  document: string;
  allowedEvidence: Array<{ sourceType: string; sourceId: string }>;
}

const claimJob = async (): Promise<JobRow | null> => {
  const leaseToken = randomUUID();
  const result = await pool.query<JobRow>(`
    WITH candidate AS (
      SELECT dossier.id
      FROM crm.ai_customer_dossiers dossier
      WHERE dossier.attempt_count < $1 AND dossier.available_at <= now()
        AND (dossier.status IN ('pending', 'stale')
          OR (dossier.status = 'synthesizing' AND dossier.lease_until < now()))
        AND EXISTS (
          SELECT 1 FROM tenancy.outlet_features feature
          WHERE feature.tenant_id = dossier.tenant_id
            AND feature.outlet_id = dossier.outlet_id
            AND feature.feature_key = 'ai_customer_dossiers' AND feature.enabled
        )
      ORDER BY dossier.available_at, dossier.id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE crm.ai_customer_dossiers dossier SET
      status = 'synthesizing', attempt_count = dossier.attempt_count + 1,
      lease_token = $2, lease_until = now() + interval '3 minutes', updated_at = now()
    FROM candidate
    WHERE dossier.id = candidate.id
    RETURNING dossier.id, dossier.tenant_id, dossier.outlet_id,
      dossier.subject_type, dossier.subject_id, dossier.requested_by_user_id,
      dossier.lease_token, dossier.attempt_count
  `, [MAX_ATTEMPTS, leaseToken]);
  return result.rows[0] ?? null;
};

const reserveDailyQuota = async (job: JobRow): Promise<boolean> => {
  const result = await pool.query(`
    INSERT INTO crm.ai_dossier_usage_daily (
      tenant_id, outlet_id, usage_date, request_count
    ) VALUES ($1, $2, (now() AT TIME ZONE 'UTC')::date, 1)
    ON CONFLICT (tenant_id, outlet_id, usage_date) DO UPDATE SET
      request_count = crm.ai_dossier_usage_daily.request_count + 1,
      updated_at = now()
    WHERE crm.ai_dossier_usage_daily.request_count < $3
    RETURNING request_count
  `, [job.tenant_id, job.outlet_id, env.aiDossiers.maxDailyPerOutlet]);
  if (result.rowCount) return true;
  await pool.query(`
    UPDATE crm.ai_customer_dossiers SET
      status = CASE WHEN synthesized_at IS NULL THEN 'pending' ELSE 'stale' END,
      attempt_count = greatest(attempt_count - 1, 0),
      available_at = date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + interval '1 day',
      lease_token = NULL, lease_until = NULL, last_error_code = 'DAILY_COST_LIMIT', updated_at = now()
    WHERE id = $1 AND lease_token = $2
  `, [job.id, job.lease_token]);
  return false;
};

const safeText = (value: unknown, max = 500) => typeof value === "string"
  ? sanitizeRetrievalText(value).slice(0, max)
  : value;

const sourceVersion = (sources: SourceRecord[]) => createHash("md5")
  .update(JSON.stringify(sources))
  .digest("hex");

const authorizeJob = async (client: PoolClient, job: JobRow): Promise<boolean> => {
  await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [job.tenant_id]);
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [job.requested_by_user_id]);
  await client.query("SELECT set_config('app.is_super_admin', 'false', true)");
  const permission = job.subject_type === "lead" ? "leads.read" : "customers.read";
  const result = await client.query<{ allowed: boolean }>(`
    SELECT tenancy.can_access_outlet($1::uuid, $2::uuid)
      AND iam.has_outlet_permission($1::uuid, $2::uuid, $3)
      AND EXISTS (
        SELECT 1 FROM tenancy.outlet_features feature
        WHERE feature.tenant_id = $1 AND feature.outlet_id = $2
          AND feature.feature_key = 'ai_customer_dossiers' AND feature.enabled
      ) AS allowed
  `, [job.tenant_id, job.outlet_id, permission]);
  return result.rows[0]?.allowed === true;
};

const loadSnapshot = async (job: JobRow): Promise<SourceSnapshot | null> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    if (!await authorizeJob(client, job)) throw new Error("dossier source authorization revoked");

    const sources: SourceRecord[] = [];
    if (job.subject_type === "lead") {
      const lead = await client.query<{
        id: string; customer_name: string; business_name: string; business_type: string;
        area: string; city: string; state: string; requirement: string; stage: string;
        source: string; priority: string; comments: string; tags: string[];
      }>(`
        SELECT id, customer_name, business_name, business_type, area, city, state,
          requirement, stage, source, priority, comments, tags
        FROM crm.leads WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
      `, [job.tenant_id, job.outlet_id, job.subject_id]);
      const row = lead.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      sources.push({
        sourceType: "lead", sourceId: row.id,
        customerName: safeText(row.customer_name, 160), businessName: safeText(row.business_name, 200),
        businessType: safeText(row.business_type, 120), area: safeText(row.area, 160),
        city: safeText(row.city, 160), state: safeText(row.state, 160),
        requirement: safeText(row.requirement, 1_000), stage: row.stage,
        acquisitionSource: safeText(row.source, 160), priority: safeText(row.priority, 80),
        comments: safeText(row.comments, 1_000), tags: row.tags.map((tag) => safeText(tag, 80)),
      });
    } else {
      const customer = await client.query<{
        id: string; customer_name: string; business_name: string; business_type: string;
        area: string; city: string; state: string; priority: string; source: string;
        status: string; lifecycle: string; total_enquiries: number; total_won: number; total_lost: number;
      }>(`
        SELECT customer.id, customer.customer_name, customer.business_name,
          customer.business_type, customer.area, customer.city, customer.state,
          customer.priority, customer.source, customer.status, customer.lifecycle,
          customer.total_enquiries, customer.total_won, customer.total_lost
        FROM crm.customers customer
        JOIN crm.customer_outlets customer_outlet
          ON customer_outlet.tenant_id = customer.tenant_id
          AND customer_outlet.customer_id = customer.id
        WHERE customer.tenant_id = $1 AND customer_outlet.outlet_id = $2
          AND customer.id = $3
      `, [job.tenant_id, job.outlet_id, job.subject_id]);
      const row = customer.rows[0];
      if (!row) { await client.query("COMMIT"); return null; }
      sources.push({
        sourceType: "customer", sourceId: row.id,
        customerName: safeText(row.customer_name, 160), businessName: safeText(row.business_name, 200),
        businessType: safeText(row.business_type, 120), area: safeText(row.area, 160),
        city: safeText(row.city, 160), state: safeText(row.state, 160),
        priority: safeText(row.priority, 80), acquisitionSource: safeText(row.source, 160),
        status: row.status, lifecycle: row.lifecycle,
        outcomeCounts: { enquiries: row.total_enquiries, won: row.total_won, lost: row.total_lost },
      });
      const leads = await client.query<{
        id: string; business_name: string; requirement: string; stage: string;
        priority: string; comments: string; created_at: Date;
      }>(`
        SELECT id, business_name, requirement, stage, priority, comments, created_at
        FROM crm.leads
        WHERE tenant_id = $1 AND outlet_id = $2 AND customer_id = $3
        ORDER BY updated_at DESC, id DESC LIMIT 20
      `, [job.tenant_id, job.outlet_id, job.subject_id]);
      for (const lead of leads.rows) sources.push({
        sourceType: "lead", sourceId: lead.id, businessName: safeText(lead.business_name, 200),
        requirement: safeText(lead.requirement, 1_000), stage: lead.stage,
        priority: safeText(lead.priority, 80), comments: safeText(lead.comments, 1_000),
        createdAt: lead.created_at.toISOString(),
      });
    }

    const timeline = await client.query<{
      id: string; event_type: string; event_time: Date; summary: string; payload: Record<string, unknown>;
    }>(`
      SELECT id, event_type, event_time, summary, payload
      FROM crm.timeline_events
      WHERE tenant_id = $1 AND outlet_id = $2
        AND entity_type = $3 AND entity_id = $4
      ORDER BY event_time DESC, id DESC LIMIT 50
    `, [job.tenant_id, job.outlet_id, job.subject_type, job.subject_id]);
    for (const event of timeline.rows) sources.push({
      sourceType: "timeline", sourceId: event.id, eventType: event.event_type,
      eventTime: event.event_time.toISOString(), summary: safeText(event.summary, 240),
      payload: Object.fromEntries(Object.entries(event.payload).flatMap(([key, value]) =>
        ["fromStage", "toStage", "activityType", "direction", "durationSeconds", "mode", "priority"]
          .includes(key) ? [[key, safeText(value, 120)]] : [])),
    });

    const leadIds = sources.filter((source) => source.sourceType === "lead").map((source) => source.sourceId);
    if (leadIds.length) {
      const quotations = await client.query<{
        id: string; lead_id: string; quotation_number: string; currency_code: string;
        total_amount: string; created_at: Date;
      }>(`
        SELECT id, lead_id, quotation_number, currency_code, total_amount, created_at
        FROM crm.quotations
        WHERE tenant_id = $1 AND outlet_id = $2 AND lead_id = ANY($3::uuid[])
        ORDER BY created_at DESC, id DESC LIMIT 10
      `, [job.tenant_id, job.outlet_id, leadIds]);
      for (const quote of quotations.rows) sources.push({
        sourceType: "quotation", sourceId: quote.id, leadId: quote.lead_id,
        quotationNumber: safeText(quote.quotation_number, 80), currency: quote.currency_code,
        sellerQuotedTotal: quote.total_amount, createdAt: quote.created_at.toISOString(),
        warning: "Seller-issued quotation; not evidence of the customer's stated budget.",
      });
    }

    const newestTimeline = timeline.rows[0];
    const timelineWatermark = await client.query<{ count: string; digest: string }>(`
      SELECT count(*)::text AS count,
        md5(coalesce(string_agg(md5(concat_ws(E'\\x1f', id::text,
          extract(epoch FROM event_time)::text, event_type, summary, payload::text)), ''
          ORDER BY event_time, id), '')) AS digest
      FROM crm.timeline_events
      WHERE tenant_id = $1 AND outlet_id = $2 AND entity_type = $3 AND entity_id = $4
    `, [job.tenant_id, job.outlet_id, job.subject_type, job.subject_id]);
    const watermark = {
      timelineEventCount: Number(timelineWatermark.rows[0]?.count ?? 0),
      timelineDigest: timelineWatermark.rows[0]?.digest ?? null,
      latestTimelineEventAt: newestTimeline?.event_time.toISOString() ?? null,
      latestTimelineEventId: newestTimeline?.id ?? null,
      sourceRecordCount: sources.length,
    };
    const version = sourceVersion([...sources, {
      sourceType: job.subject_type,
      sourceId: job.subject_id,
      watermark,
    } as SourceRecord]);
    const includedSources: SourceRecord[] = [];
    for (const source of sources) {
      const candidate = JSON.stringify({
        subjectType: job.subject_type, subjectId: job.subject_id,
        sourceVersion: version, sources: [...includedSources, source],
      });
      if (candidate.length > env.aiDossiers.maxInputChars) break;
      includedSources.push(source);
    }
    const document = JSON.stringify({
      subjectType: job.subject_type,
      subjectId: job.subject_id,
      sourceVersion: version,
      sources: includedSources,
    });
    await client.query("COMMIT");
    return {
      version,
      watermark: { ...watermark, presentedSourceCount: includedSources.length },
      document,
      allowedEvidence: includedSources.map(({ sourceType, sourceId }) => ({ sourceType, sourceId })),
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const storeResult = async (job: JobRow, snapshot: SourceSnapshot, result: DossierSynthesisResult) => {
  const dossier = result.dossier;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const stored = await client.query(`
      UPDATE crm.ai_customer_dossiers SET
        status = 'ready', source_version = $3, source_watermark = $4::jsonb,
        factual_summary = $5, summary_evidence = $6::jsonb, facts = $7::jsonb,
        stated_needs = $8::jsonb, explicit_budget = $9::jsonb,
        decision_makers = $10::jsonb, risks = $11::jsonb,
        suggested_next_actions = $12::jsonb, win_probability = $13,
        churn_risk = $14, estimates_calibrated = false,
        synthesis_provider = $15, synthesis_model = $16, synthesis_model_version = $17,
        synthesized_at = now(), synthesis_duration_ms = $18,
        input_tokens = $19, output_tokens = $20,
        estimated_cost_micros = $21, last_error_code = NULL,
        retain_until = now() + ($22 * interval '1 day'),
        lease_token = NULL, lease_until = NULL, updated_at = now()
      WHERE id = $1 AND lease_token = $2 AND status = 'synthesizing'
    `, [
      job.id, job.lease_token, snapshot.version, JSON.stringify(snapshot.watermark),
      dossier.factualSummary, JSON.stringify(dossier.summaryEvidence), JSON.stringify(dossier.facts),
      JSON.stringify(dossier.statedNeeds), dossier.explicitBudget === null ? null : JSON.stringify(dossier.explicitBudget),
      JSON.stringify(dossier.decisionMakers), JSON.stringify(dossier.risks),
      JSON.stringify(dossier.suggestedNextActions), dossier.estimates.winProbability,
      dossier.estimates.churnRisk, env.aiDossiers.provider, env.aiDossiers.model,
      env.aiDossiers.modelVersion, result.durationMs, result.inputTokens, result.outputTokens,
      result.estimatedCostMicros, env.aiDossiers.retentionDays,
    ]);
    if (stored.rowCount) {
      await client.query(`
        UPDATE crm.ai_dossier_usage_daily SET
          completed_count = completed_count + 1,
          input_tokens = input_tokens + $3,
          output_tokens = output_tokens + $4,
          estimated_cost_micros = estimated_cost_micros + $5,
          updated_at = now()
        WHERE tenant_id = $1 AND outlet_id = $2
          AND usage_date = (now() AT TIME ZONE 'UTC')::date
      `, [job.tenant_id, job.outlet_id, result.inputTokens, result.outputTokens, result.estimatedCostMicros]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const removeMissingSubject = async (job: JobRow) => {
  await pool.query("DELETE FROM crm.ai_customer_dossiers WHERE id = $1 AND lease_token = $2", [job.id, job.lease_token]);
};

const markFailed = async (job: JobRow, error: unknown) => {
  const retry = dossierRetryPlan(job.attempt_count, MAX_ATTEMPTS);
  const errorCode = dossierErrorCode(error);
  await pool.query(`
    UPDATE crm.ai_customer_dossiers SET
      status = $3, available_at = now() + ($4 * interval '1 second'),
      last_error_code = $5, lease_token = NULL, lease_until = NULL, updated_at = now()
    WHERE id = $1 AND lease_token = $2
  `, [job.id, job.lease_token, retry.status, retry.delaySeconds, errorCode]);
  console.error(JSON.stringify({
    event: "AI_DOSSIER_SYNTHESIS_FAILURE", tenantId: job.tenant_id,
    outletId: job.outlet_id, subjectType: job.subject_type, subjectId: job.subject_id,
    attempt: job.attempt_count, status: retry.status, errorCode,
  }));
};

const purgeExpired = async () => {
  const result = await pool.query(`
    DELETE FROM crm.ai_customer_dossiers
    WHERE retain_until IS NOT NULL AND retain_until < now()
      AND status NOT IN ('pending', 'stale', 'synthesizing')
  `);
  return result.rowCount ?? 0;
};

const run = async () => {
  const purged = await purgeExpired();
  let processed = 0;
  while (processed < env.aiDossiers.maxJobsPerRun) {
    const job = await claimJob();
    if (!job) break;
    processed++;
    try {
      const snapshot = await loadSnapshot(job);
      if (!snapshot) { await removeMissingSubject(job); continue; }
      if (!await reserveDailyQuota(job)) continue;
      const result = await synthesizeDossier(snapshot.document);
      assertEvidenceReferences(result.dossier, snapshot.allowedEvidence);
      await storeResult(job, snapshot, result);
    } catch (error) {
      await markFailed(job, error);
    }
  }
  console.info(JSON.stringify({
    event: "AI_DOSSIER_RUN_COMPLETE", processed, purged,
    limit: env.aiDossiers.maxJobsPerRun,
    limitReached: processed === env.aiDossiers.maxJobsPerRun,
  }));
};

try {
  await run();
} finally {
  await pool.end();
}
