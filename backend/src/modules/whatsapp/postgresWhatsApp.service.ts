import { v7 as uuidv7 } from "uuid";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { usageService, type UsageService } from "../billing/usage.service.js";
import { msg91WhatsAppTextProvider, type WhatsAppTextProvider } from "./postgresWhatsApp.provider.js";
import { PostgresWhatsAppRepository, postgresWhatsAppRepository, type PostgresWhatsAppConversationRow } from "./postgresWhatsApp.repository.js";

export interface PostgresWhatsAppSendInput {
  outletId: string;
  text: string;
  contentType: "text" | "document";
}

export type PostgresWhatsAppEventInput =
  | {
      eventType: "INBOUND";
      outletId: string;
      mobile: string;
      integratedNumber?: string;
      messageUuid: string;
      contentType: string;
      text?: string;
      url?: string;
      customerName?: string;
      repliedMessageId?: string;
      occurredAt?: number;
    }
  | {
      eventType: "STATUS";
      outletId: string;
      mobile: string;
      messageUuid: string;
      status: "sent" | "delivered" | "read" | "failed";
      failureReason?: string;
      occurredAt?: number;
    };

const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

const toItem = (row: PostgresWhatsAppConversationRow) => ({
  ...row.metadata,
  id: row.id,
  legacyId: row.legacy_id,
  mobile: row.mobile,
  integrated_number: row.integrated_number,
  isRead: row.is_read,
  unreadCount: row.unread_count,
  lastReadAt: row.last_read_at?.toISOString(),
  lastReadAtMili: row.last_read_at?.getTime(),
  sentMsgList: Array.isArray(row.sent_messages) ? row.sent_messages : [],
  replyMsgList: Array.isArray(row.reply_messages) ? row.reply_messages : [],
  createdDateTime: row.created_at.toISOString(),
  createdDateTimeMili: row.created_at.getTime(),
  updatedDateTime: row.updated_at.toISOString(),
  updatedDateTimeMili: row.updated_at.getTime(),
});

export class PostgresWhatsAppService {
  constructor(
    private readonly repository: PostgresWhatsAppRepository = postgresWhatsAppRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
    private readonly provider: WhatsAppTextProvider = msg91WhatsAppTextProvider,
    private readonly usage: Pick<UsageService, "checkWalletExists" | "meterUsage"> = usageService,
  ) {}

  private async requirePermission(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, permission: string) {
    if (!await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission)) {
      throw new AppError(403, `Permission denied for ${permission}`, "PERMISSION_DENIED");
    }
  }

  async list(database: TransactionDatabase, tenantId: string, userId: string, query: { outletId: string; startDate?: number; limit: number; cursor?: string }) {
    await this.requirePermission(database, tenantId, userId, query.outletId, "whatsapp.read");
    try {
      const result = await this.repository.list(database, tenantId, query);
      return { items: result.rows.map(toItem), nextCursor: result.nextCursor };
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_CURSOR") throw new AppError(400, "Invalid pagination cursor", "INVALID_CURSOR");
      throw error;
    }
  }

  async markRead(database: TransactionDatabase, tenantId: string, userId: string, outletId: string, conversationId: string) {
    await this.requirePermission(database, tenantId, userId, outletId, "whatsapp.read");
    const row = await this.repository.markRead(database, tenantId, outletId, conversationId);
    if (!row) throw new AppError(404, "WhatsApp conversation not found", "WHATSAPP_CONVERSATION_NOT_FOUND");
    return toItem(row);
  }

  async sendMessage(database: TransactionDatabase, tenantId: string, userId: string, conversationId: string, input: PostgresWhatsAppSendInput) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "whatsapp.read");
    const conversation = await this.repository.get(database, tenantId, input.outletId, conversationId);
    if (!conversation) throw new AppError(404, "WhatsApp conversation not found", "WHATSAPP_CONVERSATION_NOT_FOUND");

    // Pre-flight: confirm wallet is configured before making the external call.
    // This does not guarantee sufficient balance — the debit in meterUsage does.
    await this.usage.checkWalletExists(database, tenantId, input.outletId);

    const messageUuid = uuidv7();
    const occurredAt = Date.now();
    const providerResult = await this.provider.send({
      recipientNumber: conversation.mobile,
      integratedNumber: conversation.integrated_number,
      contentType: input.contentType,
      text: input.text,
    });
    const message = {
      message_uuid: messageUuid,
      request_id: providerResult.requestId ?? messageUuid,
      content_type: input.contentType,
      status: providerResult.success ? "sent" : "failed",
      message_type: "text",
      direction: "outbound",
      failure_reason: providerResult.error ?? null,
      sent_at: occurredAt,
      submitted_at: occurredAt,
      delivered_at: 0,
      createdDateTimeMili: occurredAt,
      text: input.text,
      content: { text: input.text },
      to: conversation.mobile,
      integrated_number: conversation.integrated_number,
    };
    const updated = await this.repository.appendOutbound(database, tenantId, input.outletId, conversationId, message);
    if (!updated) throw new AppError(404, "WhatsApp conversation not found", "WHATSAPP_CONVERSATION_NOT_FOUND");

    // Bill only on successful provider dispatch; failed sends are not charged.
    // Billable unit: whatsapp.service — one message.
    // idempotencyKey = messageUuid (stable UUID generated before the send).
    if (providerResult.success) {
      await this.usage.meterUsage(database, {
        tenantId,
        outletId: input.outletId,
        serviceType: "whatsapp.service",
        quantity: "1.0000",
        idempotencyKey: `wa:${messageUuid}`,
        actorUserId: userId,
        referenceType: "whatsapp_message",
        referenceId: messageUuid,
        providerRef: providerResult.requestId ?? messageUuid,
        metadata: { contentType: input.contentType },
      });
    }

    return { conversation: toItem(updated), sent: providerResult.success, error: providerResult.error };
  }

  async ingestEvent(database: TransactionDatabase, tenantId: string, userId: string, input: PostgresWhatsAppEventInput) {
    await this.requirePermission(database, tenantId, userId, input.outletId, "whatsapp.read");
    const mobile = normalizePhone(input.mobile);
    if (!mobile) throw new AppError(400, "A valid WhatsApp mobile number is required", "INVALID_WHATSAPP_MOBILE");
    const occurredAt = input.occurredAt ?? Date.now();
    if (input.eventType === "INBOUND") {
      const integratedNumber = normalizePhone(input.integratedNumber ?? "");
      const message = {
        company_id: 0,
        content_type: input.contentType,
        createdDateTimeMili: occurredAt,
        customer_name: input.customerName?.trim() || mobile,
        integrated_number: integratedNumber,
        message_uuid: input.messageUuid,
        received_at: new Date(occurredAt).toISOString(),
        replied_message_id: input.repliedMessageId ?? null,
        sender: mobile,
        text: input.text ?? "",
        ...(input.url ? { url: input.url } : {}),
      };
      const row = await this.repository.upsertInbound(database, tenantId, {
        outletId: input.outletId,
        mobile,
        integratedNumber,
        message,
        messageUuid: input.messageUuid,
      });
      return { accepted: true, conversation: toItem(row) };
    }
    const row = await this.repository.updateOutboundStatus(database, tenantId, {
      outletId: input.outletId,
      mobile,
      messageUuid: input.messageUuid,
      status: input.status,
      occurredAt,
      ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    });
    if (!row) throw new AppError(404, "WhatsApp message was not found", "WHATSAPP_MESSAGE_NOT_FOUND");
    return { accepted: true, conversation: toItem(row) };
  }
}

export const postgresWhatsAppService = new PostgresWhatsAppService();
