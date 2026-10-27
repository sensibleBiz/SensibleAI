import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";

export type AiAgentActionStatus =
  | "PROPOSED"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTED"
  | "FAILED"
  | "CANCELLED";

export interface AiAgentActionRecord {
  id: string;
  tenantId: string;
  outletId: string;
  agentId: string;
  modelId: string;
  actionType: string;
  targetType: "lead" | "customer";
  targetId: string;
  contextRefs: Array<{ type: string; id: string }>;
  decisionSummary: string;
  reasonCodes: string[];
  proposedPayload: Record<string, unknown>;
  status: AiAgentActionStatus;
  createdByUserId: string;
  lastChangedByUserId: string;
  reviewerUserId: string | null;
  reviewComment: string | null;
  reviewedAt: Date | null;
  executedByUserId: string | null;
  executedAt: Date | null;
  failedAt: Date | null;
  cancelledByUserId: string | null;
  cancelledAt: Date | null;
  executionMode: "mock";
  executionResult: Record<string, unknown> | null;
  errorCode: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  estimatedCost: string | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposalInsert {
  tenantId: string;
  outletId: string;
  agentId: string;
  modelId: string;
  actionType: string;
  targetType: "lead" | "customer";
  targetId: string;
  contextRefs: Array<{ type: string; id: string }>;
  decisionSummary: string;
  reasonCodes: string[];
  proposedPayload: Record<string, unknown>;
  createdByUserId: string;
  idempotencyKey: string;
}

interface ActionRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  outlet_id: string;
  agent_id: string;
  model_id: string;
  action_type: string;
  target_type: "lead" | "customer";
  target_id: string;
  context_refs: Array<{ type: string; id: string }>;
  decision_summary: string;
  reason_codes: string[];
  proposed_payload: Record<string, unknown>;
  status: AiAgentActionStatus;
  created_by_user_id: string;
  last_changed_by_user_id: string;
  reviewer_user_id: string | null;
  review_comment: string | null;
  reviewed_at: Date | null;
  executed_by_user_id: string | null;
  executed_at: Date | null;
  failed_at: Date | null;
  cancelled_by_user_id: string | null;
  cancelled_at: Date | null;
  execution_mode: "mock";
  execution_result: Record<string, unknown> | null;
  error_code: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  estimated_cost: string | null;
  idempotency_key: string;
  created_at: Date;
  updated_at: Date;
}

const ACTION_COLUMNS = `
  id, tenant_id, outlet_id, agent_id, model_id, action_type, target_type,
  target_id, context_refs, decision_summary, reason_codes, proposed_payload,
  status, created_by_user_id, last_changed_by_user_id, reviewer_user_id,
  review_comment, reviewed_at, executed_by_user_id, executed_at, failed_at,
  cancelled_by_user_id, cancelled_at, execution_mode, execution_result,
  error_code, prompt_tokens, completion_tokens, estimated_cost, idempotency_key,
  created_at, updated_at
`;

const mapAction = (row: ActionRow): AiAgentActionRecord => ({
  id: row.id,
  tenantId: row.tenant_id,
  outletId: row.outlet_id,
  agentId: row.agent_id,
  modelId: row.model_id,
  actionType: row.action_type,
  targetType: row.target_type,
  targetId: row.target_id,
  contextRefs: row.context_refs,
  decisionSummary: row.decision_summary,
  reasonCodes: row.reason_codes,
  proposedPayload: row.proposed_payload,
  status: row.status,
  createdByUserId: row.created_by_user_id,
  lastChangedByUserId: row.last_changed_by_user_id,
  reviewerUserId: row.reviewer_user_id,
  reviewComment: row.review_comment,
  reviewedAt: row.reviewed_at,
  executedByUserId: row.executed_by_user_id,
  executedAt: row.executed_at,
  failedAt: row.failed_at,
  cancelledByUserId: row.cancelled_by_user_id,
  cancelledAt: row.cancelled_at,
  executionMode: "mock",
  executionResult: row.execution_result,
  errorCode: row.error_code,
  promptTokens: row.prompt_tokens,
  completionTokens: row.completion_tokens,
  estimatedCost: row.estimated_cost,
  idempotencyKey: row.idempotency_key,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class AiAgentActionsRepository {
  async createProposal(
    database: TransactionDatabase,
    input: ProposalInsert,
  ): Promise<{ action: AiAgentActionRecord; created: boolean; sameRequest: boolean }> {
    const inserted = await database.client.query<ActionRow>(`
      INSERT INTO crm.ai_agent_actions (
        tenant_id, outlet_id, agent_id, model_id, action_type, target_type, target_id,
        target_lead_id, target_customer_id, context_refs, decision_summary, reason_codes,
        proposed_payload, status, created_by_user_id, last_changed_by_user_id,
        idempotency_key, execution_mode
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        CASE WHEN $6 = 'lead' THEN $7::uuid END,
        CASE WHEN $6 = 'customer' THEN $7::uuid END,
        $8::jsonb, $9, $10::varchar[], $11::jsonb, 'PROPOSED', $12, $12, $13, 'mock'
      )
      ON CONFLICT (tenant_id, outlet_id, created_by_user_id, idempotency_key) DO NOTHING
      RETURNING ${ACTION_COLUMNS}
    `, [
      input.tenantId, input.outletId, input.agentId, input.modelId, input.actionType,
      input.targetType, input.targetId, JSON.stringify(input.contextRefs),
      input.decisionSummary, input.reasonCodes, JSON.stringify(input.proposedPayload),
      input.createdByUserId, input.idempotencyKey,
    ]);
    if (inserted.rows[0]) {
      return { action: mapAction(inserted.rows[0]), created: true, sameRequest: true };
    }

    const existing = await database.client.query<ActionRow & { same_request: boolean }>(`
      SELECT ${ACTION_COLUMNS},
        action_type = $3
        AND target_type = $4
        AND target_id = $5
        AND context_refs = $6::jsonb
        AND decision_summary = $7
        AND reason_codes = $8::varchar[]
        AND proposed_payload = $9::jsonb AS same_request
      FROM crm.ai_agent_actions
      WHERE tenant_id = $1 AND outlet_id = $2
        AND created_by_user_id = $10 AND idempotency_key = $11
    `, [
      input.tenantId, input.outletId, input.actionType, input.targetType, input.targetId,
      JSON.stringify(input.contextRefs), input.decisionSummary, input.reasonCodes,
      JSON.stringify(input.proposedPayload), input.createdByUserId, input.idempotencyKey,
    ]);
    const row = existing.rows[0];
    if (!row) throw new Error("AI action idempotency conflict did not resolve to an existing proposal");
    return { action: mapAction(row), created: false, sameRequest: row.same_request };
  }

  async get(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    actionId: string,
  ): Promise<AiAgentActionRecord | null> {
    const result = await database.client.query<ActionRow>(`
      SELECT ${ACTION_COLUMNS} FROM crm.ai_agent_actions
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
    `, [tenantId, outletId, actionId]);
    return result.rows[0] ? mapAction(result.rows[0]) : null;
  }

  async list(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    status: AiAgentActionStatus | undefined,
    limit: number,
    offset: number,
  ): Promise<AiAgentActionRecord[]> {
    const result = await database.client.query<ActionRow>(`
      SELECT ${ACTION_COLUMNS} FROM crm.ai_agent_actions
      WHERE tenant_id = $1 AND outlet_id = $2 AND ($3::text IS NULL OR status = $3)
      ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5
    `, [tenantId, outletId, status ?? null, limit, offset]);
    return result.rows.map(mapAction);
  }

  async history(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    actionId: string,
  ) {
    const result = await database.client.query(`
      SELECT event_type, from_status, to_status, actor_user_id, reason_codes,
        error_code, created_at
      FROM crm.ai_agent_action_history
      WHERE tenant_id = $1 AND outlet_id = $2 AND action_id = $3
      ORDER BY created_at, id
    `, [tenantId, outletId, actionId]);
    return result.rows;
  }

  async review(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    actionId: string,
    status: "APPROVED" | "REJECTED",
    comment: string | null,
  ): Promise<AiAgentActionRecord | null> {
    const result = await database.client.query<ActionRow>(`
      UPDATE crm.ai_agent_actions
      SET status = $4, review_comment = $5
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 AND status = 'PROPOSED'
      RETURNING ${ACTION_COLUMNS}
    `, [tenantId, outletId, actionId, status, comment]);
    return result.rows[0] ? mapAction(result.rows[0]) : null;
  }

  async finishMockExecution(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    actionId: string,
    status: "EXECUTED" | "FAILED",
    result: Record<string, unknown>,
    errorCode: string | null,
  ): Promise<AiAgentActionRecord | null> {
    const updated = await database.client.query<ActionRow>(`
      UPDATE crm.ai_agent_actions
      SET status = $4, execution_result = $5::jsonb, error_code = $6
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3 AND status = 'APPROVED'
      RETURNING ${ACTION_COLUMNS}
    `, [tenantId, outletId, actionId, status, JSON.stringify(result), errorCode]);
    return updated.rows[0] ? mapAction(updated.rows[0]) : null;
  }

  async cancel(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    actionId: string,
  ): Promise<AiAgentActionRecord | null> {
    const result = await database.client.query<ActionRow>(`
      UPDATE crm.ai_agent_actions
      SET status = 'CANCELLED'
      WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
        AND status IN ('PROPOSED', 'APPROVED', 'FAILED')
      RETURNING ${ACTION_COLUMNS}
    `, [tenantId, outletId, actionId]);
    return result.rows[0] ? mapAction(result.rows[0]) : null;
  }
}

export const aiAgentActionsRepository = new AiAgentActionsRepository();
