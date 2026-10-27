import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { env } from "../src/config/env.js";
import { embedText } from "../src/modules/assistant/tools/embeddingService.js";
import { buildLeadDocument, buildTimelineDocument } from "../src/modules/aiRetrieval/documents.js";

const BATCH_SIZE = 25;
const MAX_JOBS_PER_RUN = 100;
const MAX_ATTEMPTS = 8;
const MAX_DOCUMENT_LENGTH = 1_200;
const backfill = process.argv.includes("--backfill");
const connectionString = env.database.adminUrl;

if (!connectionString) throw new Error("DATABASE_ADMIN_URL is required for AI retrieval indexing");
if (env.aiRetrieval.embeddingProvider === "disabled") {
  throw new Error("AI_EMBEDDING_PROVIDER=disabled; indexing cannot proceed");
}

const pool = new Pool({
  connectionString,
  max: 2,
  application_name: "sensible-crm-ai-retrieval-indexer",
  statement_timeout: 15_000,
});

interface JobRow {
  id: string;
  tenant_id: string;
  outlet_id: string;
  source_type: "lead" | "timeline";
  source_id: string;
  subject_lead_id: string;
  source_version: string;
  lease_token: string;
  attempt_count: number;
}

interface SourceRow {
  source_version: string;
  business_name?: string | null;
  requirement?: string | null;
  source?: string | null;
  city?: string | null;
  state?: string | null;
  stage?: string | null;
  event_type?: string;
  event_time?: string;
  payload?: Record<string, unknown>;
}

const claimJob = async (): Promise<JobRow | null> => {
  const client = await pool.connect();
  const leaseToken = randomUUID();
  try {
    await client.query("BEGIN");
    const result = await client.query<JobRow>(`
      WITH candidate AS (
        SELECT id FROM crm.ai_retrieval_jobs
        WHERE attempt_count < $1 AND available_at <= now()
          AND (status = 'pending' OR (status = 'indexing' AND lease_until < now()))
        ORDER BY available_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE crm.ai_retrieval_jobs job
      SET status = 'indexing', attempt_count = attempt_count + 1,
        lease_token = $2, lease_until = now() + interval '2 minutes',
        updated_at = now()
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id, job.tenant_id, job.outlet_id, job.source_type,
        job.source_id, job.subject_lead_id, job.source_version,
        job.lease_token, job.attempt_count
    `, [MAX_ATTEMPTS, leaseToken]);
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const loadSource = async (job: JobRow): Promise<SourceRow | null> => {
  if (job.source_type === "lead") {
    const result = await pool.query<SourceRow>(`
      SELECT md5(concat_ws(E'\\x1f', coalesce(business_name, ''),
        coalesce(requirement, ''), coalesce(source, ''), coalesce(city, ''),
        coalesce(state, ''), coalesce(stage::text, ''))) AS source_version,
        business_name, requirement, source, city, state, stage::text AS stage
      FROM crm.leads
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
    `, [job.tenant_id, job.outlet_id, job.source_id]);
    return result.rows[0] ?? null;
  }
  const result = await pool.query<SourceRow>(`
    SELECT md5(concat_ws(E'\\x1f', extract(epoch FROM event_time)::text,
        event_type, summary, payload::text)) AS source_version,
      event_type,
      to_char(event_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS event_time,
      payload
    FROM crm.timeline_events
    WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
      AND entity_type = 'lead' AND entity_id = $4
  `, [job.tenant_id, job.outlet_id, job.source_id, job.subject_lead_id]);
  return result.rows[0] ?? null;
};

const markSourceChanged = async (job: JobRow, currentVersion: string) => {
  await pool.query(`
    UPDATE crm.ai_retrieval_jobs
    SET source_version = $2, status = 'pending', attempt_count = 0,
      available_at = now(), lease_token = NULL, lease_until = NULL,
      last_error_code = NULL, updated_at = now()
    WHERE id = $1 AND lease_token = $3
  `, [job.id, currentVersion, job.lease_token]);
};

const storeIndexedChunk = async (job: JobRow, text: string, embedding: number[]) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (text) {
      await client.query(`
        INSERT INTO crm.ai_retrieval_chunks (
          tenant_id, outlet_id, source_type, source_id, subject_lead_id,
          chunk_index, source_version, document_text, embedding,
          provider, model, model_version, indexed_at
        )
        SELECT tenant_id, outlet_id, source_type, source_id, subject_lead_id,
          0, source_version, $4, $5::vector, $6, $7, $8, now()
        FROM crm.ai_retrieval_jobs
        WHERE id = $1 AND source_version = $2 AND lease_token = $3 AND status = 'indexing'
        ON CONFLICT (tenant_id, source_type, source_id, chunk_index) DO UPDATE
        SET outlet_id = EXCLUDED.outlet_id,
          subject_lead_id = EXCLUDED.subject_lead_id,
          source_version = EXCLUDED.source_version,
          document_text = EXCLUDED.document_text,
          embedding = EXCLUDED.embedding,
          provider = EXCLUDED.provider,
          model = EXCLUDED.model,
          model_version = EXCLUDED.model_version,
          indexed_at = now()
      `, [
        job.id, job.source_version, job.lease_token, text.slice(0, MAX_DOCUMENT_LENGTH),
        JSON.stringify(embedding), env.aiRetrieval.embeddingProvider,
        env.aiRetrieval.embeddingModel, env.aiRetrieval.embeddingModelVersion,
      ]);
    } else {
      await client.query(`
        DELETE FROM crm.ai_retrieval_chunks
        WHERE tenant_id = $1 AND source_type = $2 AND source_id = $3
      `, [job.tenant_id, job.source_type, job.source_id]);
    }
    await client.query(`
      UPDATE crm.ai_retrieval_jobs
      SET status = 'indexed', provider = $4, model = $5, model_version = $6,
        last_successful_indexing_at = now(), last_error_code = NULL,
        lease_token = NULL, lease_until = NULL, updated_at = now()
      WHERE id = $1 AND source_version = $2 AND lease_token = $3
    `, [
      job.id, job.source_version, job.lease_token, env.aiRetrieval.embeddingProvider,
      env.aiRetrieval.embeddingModel, env.aiRetrieval.embeddingModelVersion,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const markFailed = async (job: JobRow, error: unknown) => {
  const status = job.attempt_count >= MAX_ATTEMPTS ? "failed" : "pending";
  const delaySeconds = Math.min(60 * 2 ** (job.attempt_count - 1), 3_600);
  const code = error instanceof Error && /dimension/i.test(error.message)
    ? "EMBEDDING_DIMENSION_MISMATCH"
    : "EMBEDDING_PROVIDER_ERROR";
  await pool.query(`
    UPDATE crm.ai_retrieval_jobs
    SET status = $2, available_at = now() + ($3 * interval '1 second'),
      last_error_code = $4, lease_token = NULL, lease_until = NULL, updated_at = now()
    WHERE id = $1 AND lease_token = $5
  `, [job.id, status, delaySeconds, code, job.lease_token]);
  console.error(JSON.stringify({
    event: "AI_RETRIEVAL_INDEX_FAILURE",
    tenantId: job.tenant_id,
    sourceType: job.source_type,
    sourceId: job.source_id,
    attempt: job.attempt_count,
    status,
    errorCode: code,
  }));
};

const processJob = async (job: JobRow) => {
  const source = await loadSource(job);
  if (!source) {
    await pool.query(`
      DELETE FROM crm.ai_retrieval_chunks
      WHERE tenant_id = $1 AND source_type = $2 AND source_id = $3
    `, [job.tenant_id, job.source_type, job.source_id]);
    await pool.query("DELETE FROM crm.ai_retrieval_jobs WHERE id = $1 AND lease_token = $2", [job.id, job.lease_token]);
    return;
  }
  if (source.source_version !== job.source_version) {
    await markSourceChanged(job, source.source_version);
    return;
  }

  const text = job.source_type === "lead"
    ? buildLeadDocument({
      businessName: source.business_name ?? null,
      requirement: source.requirement ?? null,
      source: source.source ?? null,
      city: source.city ?? null,
      state: source.state ?? null,
      stage: source.stage ?? null,
    })
    : buildTimelineDocument(source.event_type ?? "event", source.payload ?? {}, source.event_time);
  const embedding = text ? await embedText(text) : [];
  await storeIndexedChunk(job, text, embedding);
};

const enqueueBackfillBatch = async (): Promise<number> => {
  const result = await pool.query(`
    WITH candidates AS (
      SELECT lead.tenant_id, lead.outlet_id, lead.id,
        md5(concat_ws(E'\\x1f', coalesce(lead.business_name, ''),
          coalesce(lead.requirement, ''), coalesce(lead.source, ''),
          coalesce(lead.city, ''), coalesce(lead.state, ''), coalesce(lead.stage::text, ''))) AS version
      FROM crm.leads lead
      WHERE NOT EXISTS (
        SELECT 1 FROM crm.ai_retrieval_jobs job
        WHERE job.tenant_id = lead.tenant_id AND job.source_type = 'lead'
          AND job.source_id = lead.id AND job.source_version = md5(concat_ws(E'\\x1f',
            coalesce(lead.business_name, ''), coalesce(lead.requirement, ''),
            coalesce(lead.source, ''), coalesce(lead.city, ''),
            coalesce(lead.state, ''), coalesce(lead.stage::text, '')))
          AND job.status IN ('pending', 'indexing', 'indexed')
      )
      ORDER BY lead.tenant_id, lead.id
      LIMIT $1
    )
    INSERT INTO crm.ai_retrieval_jobs (
      tenant_id, outlet_id, source_type, source_id, subject_lead_id, source_version
    )
    SELECT tenant_id, outlet_id, 'lead', id, id, version FROM candidates
    ON CONFLICT (tenant_id, source_type, source_id) DO UPDATE SET
      source_version = EXCLUDED.source_version, status = 'pending',
      attempt_count = 0, available_at = now(), lease_token = NULL,
      lease_until = NULL, last_error_code = NULL, updated_at = now()
    WHERE crm.ai_retrieval_jobs.source_version IS DISTINCT FROM EXCLUDED.source_version
       OR crm.ai_retrieval_jobs.status = 'failed'
  `, [BATCH_SIZE]);
  return result.rowCount ?? 0;
};

const updateTimelineBackfillBatch = async (): Promise<number> => {
  const result = await pool.query(`
    WITH candidates AS (
      SELECT event.tenant_id, event.outlet_id, event.id, event.entity_id AS subject_lead_id,
        md5(concat_ws(E'\\x1f', extract(epoch FROM event.event_time)::text,
          event.event_type, event.summary, event.payload::text)) AS version
      FROM crm.timeline_events event
      JOIN crm.leads lead ON lead.tenant_id = event.tenant_id
        AND lead.id = event.entity_id AND lead.outlet_id = event.outlet_id
      WHERE event.entity_type = 'lead'
        AND NOT EXISTS (
          SELECT 1 FROM crm.ai_retrieval_jobs job
          WHERE job.tenant_id = event.tenant_id AND job.source_type = 'timeline'
            AND job.source_id = event.id AND job.source_version = md5(concat_ws(E'\\x1f',
              extract(epoch FROM event.event_time)::text, event.event_type,
              event.summary, event.payload::text))
            AND job.status IN ('pending', 'indexing', 'indexed')
        )
      ORDER BY event.tenant_id, event.id
      LIMIT $1
    )
    INSERT INTO crm.ai_retrieval_jobs (
      tenant_id, outlet_id, source_type, source_id, subject_lead_id, source_version
    )
    SELECT tenant_id, outlet_id, 'timeline', id, subject_lead_id, version FROM candidates
    ON CONFLICT (tenant_id, source_type, source_id) DO UPDATE SET
      source_version = EXCLUDED.source_version, status = 'pending',
      attempt_count = 0, available_at = now(), lease_token = NULL,
      lease_until = NULL, last_error_code = NULL, updated_at = now()
    WHERE crm.ai_retrieval_jobs.source_version IS DISTINCT FROM EXCLUDED.source_version
       OR crm.ai_retrieval_jobs.status = 'failed'
  `, [BATCH_SIZE]);
  return result.rowCount ?? 0;
};

const run = async () => {
  if (backfill) {
    let queued = 0;
    while (true) {
      const count = await enqueueBackfillBatch() + await updateTimelineBackfillBatch();
      queued += count;
      if (count === 0) break;
      console.info(JSON.stringify({ event: "AI_RETRIEVAL_BACKFILL_QUEUED", count, totalQueued: queued }));
    }
  }

  let processed = 0;
  while (processed < MAX_JOBS_PER_RUN) {
    const job = await claimJob();
    if (!job) break;
    processed++;
    try {
      await processJob(job);
    } catch (error) {
      await markFailed(job, error);
    }
  }
  console.info(JSON.stringify({
    event: "AI_RETRIEVAL_INDEX_RUN_COMPLETE",
    processed,
    limit: MAX_JOBS_PER_RUN,
    limitReached: processed === MAX_JOBS_PER_RUN,
  }));
};

try {
  await run();
} finally {
  await pool.end();
}
