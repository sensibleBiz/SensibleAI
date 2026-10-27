import assert from "node:assert/strict";
import { test } from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import type { PostgresAuthorizationRepository } from "../src/modules/authorization/postgresAuthorization.repository.js";
import type { WhatsAppTextProvider } from "../src/modules/whatsapp/postgresWhatsApp.provider.js";
import type { PostgresWhatsAppRepository, PostgresWhatsAppConversationRow } from "../src/modules/whatsapp/postgresWhatsApp.repository.js";
import { PostgresWhatsAppService } from "../src/modules/whatsapp/postgresWhatsApp.service.js";
import { postgresWhatsAppEventBodySchema, postgresWhatsAppSendBodySchema } from "../src/modules/whatsapp/postgresWhatsApp.validator.js";

const row = (overrides: Partial<PostgresWhatsAppConversationRow> = {}): PostgresWhatsAppConversationRow => ({
  id: "0199a11c-37b5-7000-8000-000000000001",
  legacy_id: null,
  mobile: "919876543210",
  integrated_number: "918669966793",
  is_read: true,
  unread_count: 0,
  last_read_at: null,
  sent_messages: [],
  reply_messages: [],
  metadata: {},
  created_at: new Date("2026-09-28T10:00:00.000Z"),
  updated_at: new Date("2026-09-28T10:00:00.000Z"),
  ...overrides,
});

const database = {} as TransactionDatabase;
const authorization = {
  hasOutletPermission: async () => true,
} as unknown as PostgresAuthorizationRepository;

test("PostgreSQL WhatsApp validators accept sends and reject incomplete events", () => {
  assert.equal(postgresWhatsAppSendBodySchema.safeParse({
    outletId: "0199a11c-37b5-7000-8000-000000000002",
    text: "Hello from PostgreSQL",
    contentType: "text",
  }).success, true);
  assert.equal(postgresWhatsAppEventBodySchema.safeParse({
    eventType: "INBOUND",
    outletId: "0199a11c-37b5-7000-8000-000000000002",
    mobile: "9876543210",
    messageUuid: "provider-message-1",
    contentType: "text",
    text: "Hello",
  }).success, true);
  assert.equal(postgresWhatsAppEventBodySchema.safeParse({
    eventType: "STATUS",
    outletId: "0199a11c-37b5-7000-8000-000000000002",
    mobile: "9876543210",
    status: "read",
  }).success, false);
});

test("manual WhatsApp sends are dispatched by the backend and appended to PostgreSQL", async () => {
  let appended: Record<string, unknown> | undefined;
  const repository = {
    get: async () => row(),
    appendOutbound: async (_database: TransactionDatabase, _tenantId: string, _outletId: string, _conversationId: string, message: Record<string, unknown>) => {
      appended = message;
      return row({ sent_messages: [message] });
    },
  } as unknown as PostgresWhatsAppRepository;
  const provider: WhatsAppTextProvider = {
    send: async (input) => {
      assert.equal(input.recipientNumber, "919876543210");
      assert.equal(input.text, "Hello from the CRM");
      return { success: true, requestId: "provider-request-1" };
    },
  };
  let metered = false;
  const usage = {
    checkWalletExists: async () => undefined,
    meterUsage: async () => {
      metered = true;
      return {} as never;
    },
  };
  const service = new PostgresWhatsAppService(repository, authorization, provider, usage);
  const result = await service.sendMessage(
    database,
    "0199a11c-37b5-7000-8000-000000000003",
    "0199a11c-37b5-7000-8000-000000000004",
    "0199a11c-37b5-7000-8000-000000000001",
    {
      outletId: "0199a11c-37b5-7000-8000-000000000002",
      text: "Hello from the CRM",
      contentType: "text",
    },
  );
  assert.equal(result.sent, true);
  assert.equal(appended?.request_id, "provider-request-1");
  assert.equal(appended?.status, "sent");
  assert.equal(result.conversation.sentMsgList.length, 1);
  assert.equal(metered, true);
});

test("inbound WhatsApp events normalize the sender and build PostgreSQL reply messages", async () => {
  let captured: { mobile: string; message: Record<string, unknown> } | undefined;
  const repository = {
    upsertInbound: async (_database: TransactionDatabase, _tenantId: string, input: { mobile: string; message: Record<string, unknown> }) => {
      captured = input;
      return row({ mobile: input.mobile, reply_messages: [input.message], is_read: false, unread_count: 1 });
    },
  } as unknown as PostgresWhatsAppRepository;
  const provider = { send: async () => ({ success: true }) } as WhatsAppTextProvider;
  const service = new PostgresWhatsAppService(repository, authorization, provider);
  const result = await service.ingestEvent(
    database,
    "0199a11c-37b5-7000-8000-000000000003",
    "0199a11c-37b5-7000-8000-000000000004",
    {
      eventType: "INBOUND",
      outletId: "0199a11c-37b5-7000-8000-000000000002",
      mobile: "+91 98765 43210",
      integratedNumber: "918669966793",
      messageUuid: "provider-message-2",
      contentType: "text",
      text: "Inbound hello",
      occurredAt: 1_800_000_000_000,
    },
  );
  assert.equal(captured?.mobile, "919876543210");
  assert.equal(captured?.message.message_uuid, "provider-message-2");
  assert.equal(captured?.message.text, "Inbound hello");
  assert.equal(result.conversation.unreadCount, 1);
  assert.equal(result.conversation.isRead, false);
});
