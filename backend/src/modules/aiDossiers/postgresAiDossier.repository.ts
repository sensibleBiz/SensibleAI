import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import type { AiCustomerDossier, DossierSubjectType, DossierStatus } from "./aiDossier.types.js";

interface DossierRow extends QueryResultRow {
  id: string;
  outlet_id: string;
  subject_type: DossierSubjectType;
  subject_id: string;
  status: DossierStatus;
  attempt_count: number;
  source_version: string | null;
  source_watermark: Record<string, unknown>;
  factual_summary: string;
  summary_evidence: AiCustomerDossier["summaryEvidence"];
  facts: AiCustomerDossier["facts"];
  stated_needs: AiCustomerDossier["statedNeeds"];
  explicit_budget: Record<string, unknown> | null;
  decision_makers: unknown[];
  risks: unknown[];
  suggested_next_actions: unknown[];
  win_probability: string | null;
  churn_risk: string | null;
  estimates_calibrated: false;
  synthesis_provider: string | null;
  synthesis_model: string | null;
  synthesis_model_version: string | null;
  synthesized_at: Date | string | null;
  synthesis_duration_ms: number | null;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_micros: string | number;
  last_error_code: string | null;
  retain_until: Date | string | null;
  updated_at: Date | string;
}

const iso = (value: Date | string | null) => value
  ? (value instanceof Date ? value : new Date(value)).toISOString()
  : null;

const mapDossier = (row: DossierRow): AiCustomerDossier => ({
  id: row.id,
  subjectType: row.subject_type,
  subjectId: row.subject_id,
  outletId: row.outlet_id,
  status: row.status,
  attemptCount: row.attempt_count,
  sourceVersion: row.source_version?.trim() ?? null,
  sourceWatermark: row.source_watermark,
  factualSummary: row.factual_summary,
  summaryEvidence: row.summary_evidence,
  facts: row.facts,
  statedNeeds: row.stated_needs,
  explicitBudget: row.explicit_budget,
  decisionMakers: row.decision_makers,
  risks: row.risks,
  suggestedNextActions: row.suggested_next_actions,
  estimates: {
    winProbability: row.win_probability === null ? null : Number(row.win_probability),
    churnRisk: row.churn_risk === null ? null : Number(row.churn_risk),
    calibrated: false,
    caveat: "AI estimates are uncalibrated and must not be treated as measured probabilities.",
  },
  synthesis: {
    provider: row.synthesis_provider,
    model: row.synthesis_model,
    modelVersion: row.synthesis_model_version,
    synthesizedAt: iso(row.synthesized_at),
    durationMs: row.synthesis_duration_ms,
  },
  lastErrorCode: row.last_error_code,
  usage: {
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCostMicros: Number(row.estimated_cost_micros),
  },
  retainUntil: iso(row.retain_until),
  updatedAt: iso(row.updated_at)!,
});

const SELECT_COLUMNS = `
  id, outlet_id, subject_type, subject_id, status, attempt_count,
  source_version, source_watermark, factual_summary, summary_evidence,
  facts, stated_needs, explicit_budget, decision_makers, risks,
  suggested_next_actions, win_probability, churn_risk, estimates_calibrated,
  synthesis_provider, synthesis_model, synthesis_model_version, synthesized_at,
  synthesis_duration_ms, input_tokens, output_tokens, estimated_cost_micros,
  last_error_code, retain_until, updated_at
`;

export class PostgresAiDossierRepository {
  async hasOutletFeature(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
  ): Promise<boolean> {
    const result = await database.client.query<{ enabled: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM tenancy.outlet_features
        WHERE tenant_id = $1 AND outlet_id = $2
          AND feature_key = 'ai_customer_dossiers' AND enabled
      ) AS enabled
    `, [tenantId, outletId]);
    return result.rows[0]?.enabled === true;
  }

  async subjectExists(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    subjectType: DossierSubjectType,
    subjectId: string,
  ): Promise<boolean> {
    const sql = subjectType === "lead"
      ? `SELECT EXISTS (SELECT 1 FROM crm.leads WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3) AS found`
      : `SELECT EXISTS (SELECT 1 FROM crm.customer_outlets WHERE tenant_id = $1 AND outlet_id = $2 AND customer_id = $3) AS found`;
    const result = await database.client.query<{ found: boolean }>(sql, [tenantId, outletId, subjectId]);
    return result.rows[0]?.found === true;
  }

  async get(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    subjectType: DossierSubjectType,
    subjectId: string,
  ): Promise<AiCustomerDossier | null> {
    const result = await database.client.query<DossierRow>(`
      SELECT ${SELECT_COLUMNS}
      FROM crm.ai_customer_dossiers
      WHERE tenant_id = $1 AND outlet_id = $2
        AND subject_type = $3 AND subject_id = $4
      LIMIT 1
    `, [tenantId, outletId, subjectType, subjectId]);
    return result.rows[0] ? mapDossier(result.rows[0]) : null;
  }

  async request(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    subjectType: DossierSubjectType,
    subjectId: string,
  ): Promise<void> {
    await database.client.query(
      "SELECT crm.request_ai_customer_dossier($1::uuid, $2::uuid, $3::text, $4::uuid)",
      [tenantId, outletId, subjectType, subjectId],
    );
  }

  async recordFeedback(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    subjectType: DossierSubjectType,
    subjectId: string,
    useful: boolean,
    note?: string,
  ): Promise<void> {
    await database.client.query(
      "SELECT crm.record_ai_customer_dossier_feedback($1::uuid, $2::uuid, $3::text, $4::uuid, $5::boolean, $6::text)",
      [tenantId, outletId, subjectType, subjectId, useful, note ?? null],
    );
  }
}

export const postgresAiDossierRepository = new PostgresAiDossierRepository();
