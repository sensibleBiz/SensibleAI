import { z } from "zod";

const uuid = (name: string) => z.string().trim().uuid(`${name} must be a PostgreSQL UUID`);
const optionalQuery = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => value === "" ? undefined : value, schema.optional());
const occurredAt = z.number().int().nonnegative().optional();

export const postgresWhatsAppListQuerySchema = z.object({
  outletId: uuid("outletId"),
  startDate: optionalQuery(z.coerce.number().int().nonnegative()),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: optionalQuery(z.string().trim().min(1).max(2048)),
}).strict();

export const postgresWhatsAppConversationParamsSchema = z.object({ conversationId: uuid("conversationId") }).strict();
export const postgresWhatsAppReadBodySchema = z.object({ outletId: uuid("outletId") }).strict();
export const postgresWhatsAppSendBodySchema = z.object({
  outletId: uuid("outletId"),
  text: z.string().trim().min(1).max(10_000),
  contentType: z.enum(["text", "document"]).default("text"),
}).strict();

const inboundEvent = z.object({
  eventType: z.literal("INBOUND"),
  outletId: uuid("outletId"),
  mobile: z.string().trim().min(6).max(32),
  integratedNumber: z.string().trim().max(32).optional(),
  messageUuid: z.string().trim().min(1).max(500),
  contentType: z.string().trim().min(1).max(50),
  text: z.string().max(50_000).optional(),
  url: z.string().url().max(4_000).optional(),
  customerName: z.string().trim().max(500).optional(),
  repliedMessageId: z.string().trim().max(500).optional(),
  occurredAt,
}).strict();

const statusEvent = z.object({
  eventType: z.literal("STATUS"),
  outletId: uuid("outletId"),
  mobile: z.string().trim().min(6).max(32),
  messageUuid: z.string().trim().min(1).max(500),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  failureReason: z.string().trim().max(2_000).optional(),
  occurredAt,
}).strict();

export const postgresWhatsAppEventBodySchema = z.discriminatedUnion("eventType", [inboundEvent, statusEvent]);
