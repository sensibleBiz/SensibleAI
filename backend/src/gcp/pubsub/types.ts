/**
 * Event Schemas for Sensible AI CRM Event Bus (Google Cloud Pub/Sub)
 */

export type CrmEventType =
  | "crm.payments.completed"
  | "crm.payments.failed"
  | "crm.whatsapp.inbound"
  | "crm.whatsapp.status"
  | "crm.calls.completed"
  | "crm.leads.created";

export interface BaseCrmEvent<TType extends CrmEventType, TPayload> {
  eventId: string;
  eventType: TType;
  timestamp: string; // ISO-8601
  tenantId?: string;
  outletId?: string;
  payload: TPayload;
  metadata?: {
    source: "cloud_run_function" | "exotel" | "meta" | "phonepe" | "crm_core";
    correlationId?: string;
    version: "v1" | "v2";
  };
}

// 1. Payment Events
export interface PaymentCompletedPayload {
  orderId: string;
  orderRef: string;
  merchantTransactionId: string;
  phonePeTransactionId?: string;
  amountInr: string;
  amountPaise: number;
  paymentMode?: string;
  paymentState: "COMPLETED" | "FAILED" | "PENDING";
  outletId: string;
  tenantId: string;
  userId?: string;
  rawResponse?: Record<string, unknown>;
}

export type PaymentCompletedEvent = BaseCrmEvent<
  "crm.payments.completed",
  PaymentCompletedPayload
>;

// 2. WhatsApp Inbound Events
export interface WhatsAppInboundPayload {
  messageId: string;
  senderPhone: string; // E.164 (e.g. +919876543210)
  senderName?: string;
  businessPhoneNumberId: string;
  messageType: "text" | "interactive" | "button" | "image" | "document" | "audio" | "location";
  text?: string;
  buttonPayload?: string;
  interactiveListId?: string;
  mediaUrl?: string;
  latitude?: number;
  longitude?: number;
  receivedAt: string;
  outletId?: string;
  tenantId?: string;
}

export type WhatsAppInboundEvent = BaseCrmEvent<
  "crm.whatsapp.inbound",
  WhatsAppInboundPayload
>;

// 3. Lead Created Events (Meta Ads / IndiaMART / Forms)
export interface LeadCreatedPayload {
  source: "meta_ads" | "indiamart" | "justdial" | "website" | "manual";
  externalLeadId?: string;
  fullName: string;
  phone: string; // E.164
  email?: string;
  city?: string;
  requirementDescription?: string;
  campaignName?: string;
  formName?: string;
  adId?: string;
  outletId?: string;
  tenantId?: string;
  rawPayload?: Record<string, unknown>;
}

export type LeadCreatedEvent = BaseCrmEvent<
  "crm.leads.created",
  LeadCreatedPayload
>;

// 4. Voice Call Completed Events (Exotel + Gemini)
export interface CallCompletedPayload {
  callSid: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  durationSeconds: number;
  recordingUrl?: string;
  transcript?: string;
  aiSummary?: string;
  sentiment?: "positive" | "neutral" | "negative";
  leadId?: string;
  outletId?: string;
  tenantId?: string;
}

export type CallCompletedEvent = BaseCrmEvent<
  "crm.calls.completed",
  CallCompletedPayload
>;

export type AnyCrmEvent =
  | PaymentCompletedEvent
  | WhatsAppInboundEvent
  | LeadCreatedEvent
  | CallCompletedEvent;
