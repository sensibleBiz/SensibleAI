import { z } from "zod";

const idempotencyKeySchema = z.string().trim().min(8).max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const commonProposalFields = {
  outletId: z.string().uuid(),
  targetId: z.string().uuid(),
  decisionSummary: z.string().trim().min(1).max(500),
  reasonCodes: z.array(z.enum([
    "RELEVANT_CONTEXT",
    "STALE_FOLLOW_UP",
    "CUSTOMER_REQUEST",
    "PIPELINE_REVIEW",
    "ASSIGNMENT_BALANCE",
    "INBOUND_REQUEST",
    "OTHER",
  ])).min(1).max(12),
  contextRefs: z.array(z.object({
    type: z.enum(["lead", "timeline", "customer"]),
    id: z.string().uuid(),
  }).strict()).max(20).default([]),
  idempotencyKey: idempotencyKeySchema,
};

const proposalVariants = [
  z.object({
    ...commonProposalFields,
    actionType: z.literal("lead.follow_up_suggestion"),
    targetType: z.literal("lead"),
    proposedPayload: z.object({ suggestion: z.string().trim().min(1).max(300) }).strict(),
  }).strict(),
  z.object({
    ...commonProposalFields,
    actionType: z.literal("lead.stage_change"),
    targetType: z.literal("lead"),
    proposedPayload: z.object({
      stage: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/).transform((stage) => stage.toUpperCase()),
    }).strict(),
  }).strict(),
  z.object({
    ...commonProposalFields,
    actionType: z.literal("lead.assign"),
    targetType: z.literal("lead"),
    proposedPayload: z.object({ assigneeUserId: z.string().uuid() }).strict(),
  }).strict(),
  z.object({
    ...commonProposalFields,
    actionType: z.literal("lead.disqualify"),
    targetType: z.literal("lead"),
    proposedPayload: z.object({
      reasonCode: z.enum(["DUPLICATE", "OUT_OF_SCOPE", "INVALID_CONTACT", "NO_REQUIREMENT", "OTHER"]),
    }).strict(),
  }).strict(),
  z.object({
    ...commonProposalFields,
    actionType: z.literal("customer.message.send"),
    targetType: z.literal("customer"),
    proposedPayload: z.object({
      channel: z.literal("whatsapp"),
      templateKey: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
    }).strict(),
  }).strict(),
] as const;

export const aiAgentActionProposalSchema = z.discriminatedUnion("actionType", proposalVariants);
export type AiAgentActionProposalInput = z.infer<typeof aiAgentActionProposalSchema>;

export const aiAgentActionReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(500).optional(),
}).strict();

export const aiAgentActionListQuerySchema = z.object({
  outletId: z.string().uuid(),
  status: z.enum(["PROPOSED", "APPROVED", "REJECTED", "EXECUTED", "FAILED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
}).strict();

export const aiAgentActionParamsSchema = z.object({
  actionId: z.string().uuid(),
}).strict();

export const aiAgentActionOutletQuerySchema = z.object({
  outletId: z.string().uuid(),
}).strict();
