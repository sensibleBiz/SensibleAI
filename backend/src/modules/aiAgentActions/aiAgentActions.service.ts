import { env } from "../../config/env.js";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import {
  postgresAuthorizationRepository,
} from "../authorization/postgresAuthorization.repository.js";
import {
  aiAgentActionsRepository,
  type AiAgentActionRecord,
  type AiAgentActionsRepository,
  type AiAgentActionStatus,
} from "./aiAgentActions.repository.js";
import type { AiAgentActionProposalInput } from "./aiAgentActions.validator.js";

interface OutletAuthorizer {
  hasOutletPermission(
    database: TransactionDatabase,
    userId: string,
    tenantId: string,
    outletId: string,
    permissionKey: string,
  ): Promise<boolean>;
}

interface TargetState {
  type: "lead" | "customer";
  stage?: string;
  businessId?: string;
  assignedToUserId?: string | null;
  status?: string;
}

const requirePermission = async (
  authorize: OutletAuthorizer,
  database: TransactionDatabase,
  tenantId: string,
  userId: string,
  outletId: string,
  permission: string,
) => {
  if (!await authorize.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
    throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
  }
};

const capabilityPermission = (actionType: string): string => {
  switch (actionType) {
    case "lead.follow_up_suggestion": return "leads.read";
    case "lead.stage_change":
    case "lead.disqualify": return "leads.update";
    case "lead.assign": return "leads.assign";
    case "customer.message.send": return "whatsapp.messages.send";
    default: throw new AppError(400, "Unsupported AI action type", "AI_ACTION_TYPE_UNSUPPORTED");
  }
};

const scrubText = (value: string): string => value
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
  .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, "[redacted]")
  .replace(/\s+/g, " ")
  .trim();

export const isValidAiActionTransition = (
  from: AiAgentActionStatus,
  to: AiAgentActionStatus,
): boolean =>
  (from === "PROPOSED" && ["APPROVED", "REJECTED", "CANCELLED"].includes(to))
  || (from === "APPROVED" && ["EXECUTED", "FAILED", "CANCELLED"].includes(to))
  || (from === "FAILED" && to === "CANCELLED");

export class AiAgentActionsService {
  constructor(
    private readonly repository: Pick<
      AiAgentActionsRepository,
      "createProposal" | "get" | "list" | "history" | "review" | "finishMockExecution" | "cancel"
    > = aiAgentActionsRepository,
    private readonly authorize: OutletAuthorizer = postgresAuthorizationRepository,
  ) {}

  async propose(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: AiAgentActionProposalInput,
  ): Promise<{ action: AiAgentActionRecord; replayed: boolean }> {
    await requirePermission(this.authorize, database, tenantId, userId, input.outletId, "ai_actions.propose");
    await requirePermission(this.authorize, database, tenantId, userId, input.outletId, "ai_actions.read");
    await requirePermission(
      this.authorize, database, tenantId, userId, input.outletId, capabilityPermission(input.actionType),
    );
    await requirePermission(
      this.authorize,
      database,
      tenantId,
      userId,
      input.outletId,
      input.targetType === "lead" ? "leads.read" : "customers.read",
    );

    const target = await this.loadTarget(database, tenantId, input.outletId, input.targetType, input.targetId);
    if (!target) throw new AppError(404, "AI action target not found in this outlet", "AI_ACTION_TARGET_NOT_FOUND");

    const decisionSummary = scrubText(input.decisionSummary).slice(0, 500);
    if (!decisionSummary) {
      throw new AppError(400, "Decision summary is empty after privacy filtering", "AI_ACTION_SUMMARY_INVALID");
    }
    let proposedPayload: Record<string, unknown> = input.proposedPayload;
    if (input.actionType === "lead.follow_up_suggestion") {
      const suggestion = scrubText(input.proposedPayload.suggestion).slice(0, 300);
      if (!suggestion) {
        throw new AppError(400, "Suggested follow-up is empty after privacy filtering", "AI_ACTION_PAYLOAD_INVALID");
      }
      proposedPayload = { suggestion };
    }

    const inserted = await this.repository.createProposal(database, {
      tenantId,
      outletId: input.outletId,
      agentId: "sensible-crm-assistant",
      modelId: env.googleAi.assistantModel,
      actionType: input.actionType,
      targetType: input.targetType,
      targetId: input.targetId,
      contextRefs: input.contextRefs,
      decisionSummary,
      reasonCodes: input.reasonCodes,
      proposedPayload,
      createdByUserId: userId,
      idempotencyKey: input.idempotencyKey,
    });
    if (!inserted.sameRequest) {
      throw new AppError(409, "Idempotency key was already used for a different AI action", "AI_ACTION_IDEMPOTENCY_CONFLICT");
    }
    return { action: inserted.action, replayed: !inserted.created };
  }

  async list(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: { outletId: string; status?: AiAgentActionStatus | undefined; limit: number; offset: number },
  ) {
    await requirePermission(this.authorize, database, tenantId, userId, input.outletId, "ai_actions.read");
    return this.repository.list(database, tenantId, input.outletId, input.status, input.limit, input.offset);
  }

  async get(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    actionId: string,
  ) {
    await requirePermission(this.authorize, database, tenantId, userId, outletId, "ai_actions.read");
    const action = await this.getRequired(database, tenantId, outletId, actionId);
    const history = await this.repository.history(database, tenantId, outletId, actionId);
    return { action, history };
  }

  async review(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    actionId: string,
    decision: "approve" | "reject",
    comment?: string,
  ) {
    await requirePermission(this.authorize, database, tenantId, userId, outletId, "ai_actions.review");
    await requirePermission(this.authorize, database, tenantId, userId, outletId, "ai_actions.read");
    const action = await this.getRequired(database, tenantId, outletId, actionId);
    if (action.createdByUserId === userId) {
      throw new AppError(403, "A proposer cannot review their own AI action", "AI_ACTION_SELF_REVIEW_DENIED");
    }
    if (action.status !== "PROPOSED") {
      throw new AppError(409, "Only proposed AI actions can be reviewed", "AI_ACTION_STATE_CONFLICT");
    }
    await requirePermission(
      this.authorize, database, tenantId, userId, outletId, capabilityPermission(action.actionType),
    );
    const updated = await this.repository.review(
      database,
      tenantId,
      outletId,
      actionId,
      decision === "approve" ? "APPROVED" : "REJECTED",
      comment ? scrubText(comment).slice(0, 500) : null,
    );
    if (updated) return updated;
    throw new AppError(409, "AI action was reviewed by another request", "AI_ACTION_STATE_CONFLICT");
  }

  async executeMock(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    actionId: string,
  ) {
    await requirePermission(this.authorize, database, tenantId, userId, outletId, "ai_actions.review");
    await requirePermission(this.authorize, database, tenantId, userId, outletId, "ai_actions.read");
    let action = await this.getRequired(database, tenantId, outletId, actionId);
    if (action.status === "EXECUTED") return { action, replayed: true };
    if (action.status !== "APPROVED") {
      throw new AppError(409, "Only approved AI actions can be executed", "AI_ACTION_STATE_CONFLICT");
    }
    await requirePermission(
      this.authorize, database, tenantId, userId, outletId, capabilityPermission(action.actionType),
    );
    await requirePermission(
      this.authorize,
      database,
      tenantId,
      userId,
      outletId,
      action.targetType === "lead" ? "leads.read" : "customers.read",
    );

    const target = await this.loadTarget(database, tenantId, outletId, action.targetType, action.targetId);
    const validationError = await this.validateMockExecution(
      database, tenantId, outletId, action, target,
    );
    const executionResult = validationError
      ? { mode: "mock", simulated: true, validation: "failed" }
      : {
        mode: "mock",
        simulated: true,
        wouldPerform: action.actionType,
        targetType: action.targetType,
        targetId: action.targetId,
      };
    const updated = await this.repository.finishMockExecution(
      database,
      tenantId,
      outletId,
      actionId,
      validationError ? "FAILED" : "EXECUTED",
      executionResult,
      validationError,
    );
    if (updated) return { action: updated, replayed: false };

    action = await this.getRequired(database, tenantId, outletId, actionId);
    if (action.status === "EXECUTED") return { action, replayed: true };
    throw new AppError(409, "AI action was executed by another request", "AI_ACTION_STATE_CONFLICT");
  }

  async cancel(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    outletId: string,
    actionId: string,
  ) {
    await requirePermission(this.authorize, database, tenantId, userId, outletId, "ai_actions.review");
    await requirePermission(this.authorize, database, tenantId, userId, outletId, "ai_actions.read");
    const cancelled = await this.repository.cancel(database, tenantId, outletId, actionId);
    if (cancelled) return cancelled;
    throw new AppError(409, "AI action cannot be cancelled from its current state", "AI_ACTION_STATE_CONFLICT");
  }

  private async getRequired(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    actionId: string,
  ) {
    const action = await this.repository.get(database, tenantId, outletId, actionId);
    if (!action) throw new AppError(404, "AI action not found", "AI_ACTION_NOT_FOUND");
    return action;
  }

  private async loadTarget(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    targetType: "lead" | "customer",
    targetId: string,
  ): Promise<TargetState | null> {
    if (targetType === "lead") {
      const result = await database.client.query<{
        stage: string; assigned_to_user_id: string | null; business_id: string;
      }>(`
        SELECT stage::text, assigned_to_user_id, business_id
        FROM crm.leads WHERE tenant_id = $1 AND outlet_id = $2 AND id = $3
      `, [tenantId, outletId, targetId]);
      const row = result.rows[0];
      return row ? {
        type: "lead",
        stage: row.stage,
        businessId: row.business_id,
        assignedToUserId: row.assigned_to_user_id,
      } : null;
    }
    const result = await database.client.query<{ status: string }>(`
      SELECT customer.status::text AS status
      FROM crm.customers customer
      JOIN crm.customer_outlets customer_outlet
        ON customer_outlet.tenant_id = customer.tenant_id
        AND customer_outlet.customer_id = customer.id
      WHERE customer.tenant_id = $1 AND customer_outlet.outlet_id = $2
        AND customer.id = $3
    `, [tenantId, outletId, targetId]);
    return result.rows[0] ? { type: "customer", status: result.rows[0].status } : null;
  }

  private async validateMockExecution(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    action: AiAgentActionRecord,
    target: TargetState | null,
  ): Promise<string | null> {
    if (!target) return "TARGET_NOT_FOUND_OR_OUT_OF_SCOPE";
    if (action.actionType === "lead.stage_change") {
      const stage = action.proposedPayload.stage;
      if (typeof stage !== "string" || stage === target.stage) return "STAGE_CHANGE_NOT_VALID";
      const configuredStage = await database.client.query<{ stage_category: string }>(`
        SELECT stage_category
        FROM crm.business_pipeline_stages
        WHERE tenant_id = $1 AND business_id = $2 AND pipeline_type = 'lead'
          AND stage_key = $3 AND is_active
      `, [tenantId, target.businessId, stage]);
      if (!configuredStage.rows[0]) return "STAGE_NOT_CONFIGURED_FOR_BUSINESS";
    }
    if (action.actionType === "lead.disqualify"
      && ["WON", "LOST", "DISQUALIFIED"].includes(target.stage ?? "")) {
      return "LEAD_NOT_ELIGIBLE_FOR_DISQUALIFICATION";
    }
    if (action.actionType === "lead.disqualify") {
      const disqualifiedStage = await database.client.query(`
        SELECT 1
        FROM crm.business_pipeline_stages
        WHERE tenant_id = $1 AND business_id = $2 AND pipeline_type = 'lead'
          AND stage_key = 'DISQUALIFIED' AND stage_category = 'DISQUALIFIED' AND is_active
      `, [tenantId, target.businessId]);
      if (disqualifiedStage.rowCount !== 1) return "DISQUALIFIED_STAGE_UNAVAILABLE";
    }
    if (action.actionType === "lead.assign") {
      const assigneeId = action.proposedPayload.assigneeUserId;
      const assignee = await database.client.query<{ allowed: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM iam.users usr
          JOIN tenancy.tenant_memberships membership
            ON membership.tenant_id = $1 AND membership.user_id = usr.id AND membership.active
          JOIN tenancy.outlet_assignments assignment
            ON assignment.tenant_id = $1 AND assignment.outlet_id = $2
              AND assignment.user_id = usr.id AND assignment.active
          WHERE usr.id = $3 AND usr.active
        ) AS allowed
      `, [tenantId, outletId, assigneeId]);
      if (assignee.rows[0]?.allowed !== true) return "ASSIGNEE_NOT_ACTIVE_IN_OUTLET";
      if (target.stage === "NEW") {
        const defaultAssignedStage = await database.client.query(`
          SELECT 1 FROM crm.business_pipeline_stages
          WHERE tenant_id = $1 AND business_id = $2 AND pipeline_type = 'lead'
            AND stage_key = 'ASSIGNED' AND is_active
        `, [tenantId, target.businessId]);
        if (defaultAssignedStage.rowCount === 0) return "ASSIGNMENT_STAGE_NOT_CONFIGURED";
      }
    }
    if (action.actionType === "customer.message.send" && target.status !== "ACTIVE") {
      return "CUSTOMER_NOT_ACTIVE";
    }
    return null;
  }
}

export const aiAgentActionsService = new AiAgentActionsService();
