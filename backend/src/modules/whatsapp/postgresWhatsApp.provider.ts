import { env } from "../../config/env.js";

export interface WhatsAppTextSendInput {
  recipientNumber: string;
  integratedNumber: string;
  contentType: "text" | "document";
  text: string;
}

export interface WhatsAppTextSendResult {
  success: boolean;
  requestId?: string;
  error?: string;
}

export interface WhatsAppTextProvider {
  send(input: WhatsAppTextSendInput): Promise<WhatsAppTextSendResult>;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readRequestId = (payload: unknown): string | undefined => {
  const record = asRecord(Array.isArray(payload) ? payload[0] : payload);
  if (!record) return undefined;
  const nested = asRecord(record.data);
  const value = record.request_id ?? record.requestId ?? nested?.request_id ?? nested?.requestId;
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
};

const readProviderError = (payload: unknown): string | undefined => {
  const record = asRecord(Array.isArray(payload) ? payload[0] : payload);
  if (!record) return undefined;
  const value = record.message ?? record.error;
  return typeof value === "string" && value.trim() ? value : undefined;
};

export class Msg91WhatsAppTextProvider implements WhatsAppTextProvider {
  async send(input: WhatsAppTextSendInput): Promise<WhatsAppTextSendResult> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        accept: "application/json",
      };
      if (env.whatsapp.authKey) headers.authkey = env.whatsapp.authKey;
      const response = await fetch(env.whatsapp.messageApiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          recipient_number: input.recipientNumber,
          integrated_number: input.integratedNumber,
          content_type: input.contentType,
          text: input.text,
        }),
      });
      const responseText = await response.text();
      let payload: unknown;
      try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = { message: responseText }; }
      const first = asRecord(Array.isArray(payload) ? payload[0] : payload);
      const providerRejected = first?.status === false || first?.success === false;
      if (!response.ok || providerRejected) {
        const requestId = readRequestId(payload);
        return {
          success: false,
          ...(requestId ? { requestId } : {}),
          error: readProviderError(payload) ?? `WhatsApp provider returned HTTP ${response.status}`,
        };
      }
      const requestId = readRequestId(payload);
      return { success: true, ...(requestId ? { requestId } : {}) };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "WhatsApp provider request failed" };
    }
  }
}

export const msg91WhatsAppTextProvider = new Msg91WhatsAppTextProvider();
