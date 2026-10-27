import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import type {
  WhatsAppSendPayload,
  WhatsAppSendResult,
} from "../modules/whatsapp/whatsappAutomation.types.js";

export const isAutomatedTestRuntime = () =>
  env.nodeEnv === "test" || process.env.NODE_TEST_CONTEXT !== undefined;

/**
 * Normalizes phone number into international format (e.g., 919876543210).
 * Assumes 10-digit numbers belong to India (+91).
 */
export const normalizeWhatsAppNumber = (phone: string): string => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

/**
 * Builds dynamic WhatsApp payload components matching MSG91 / Meta format
 */
export const buildWhatsAppTemplateContent = (
  templateName: string,
  parameters: Record<string, string>,
  languageCode = "en",
) => {
  const paramEntries = Object.entries(parameters).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

  const parameterComponents = paramEntries.map(([, val]) => ({
    type: "text",
    text: String(val ?? ""),
  }));

  const dynamicBodyRecord: Record<string, { type: "text"; text: string }> = {};
  paramEntries.forEach(([key, val], idx) => {
    const bodyKey = key.startsWith("body_") ? key : `body_${idx + 1}`;
    dynamicBodyRecord[bodyKey] = {
      type: "text",
      text: String(val ?? ""),
    };
  });

  return {
    messaging_product: "whatsapp",
    template: {
      name: templateName,
      language: {
        code: languageCode,
        policy: "deterministic",
      },
      components: [
        {
          type: "body",
          parameters: parameterComponents,
        },
      ],
    },
    ...dynamicBodyRecord,
  };
};

export const whatsappService = {
  /** Dispatches a WhatsApp template message. CRM chat persistence is PostgreSQL-owned. */
  async sendTemplateMessage(
    outletId: string,
    payload: WhatsAppSendPayload,
  ): Promise<WhatsAppSendResult> {
    // Unit tests frequently mock the domain repository while exercising the
    // service that launches this notification asynchronously. Keep the guard
    // here at the external-side-effect boundary so a missed higher-level mock
    // can never send a real message or create Firestore data for fixture IDs.
    if (isAutomatedTestRuntime()) {
      return { success: true, requestId: "automated-test-suppressed" };
    }

    if (!env.whatsapp.authKey) {
      return { success: false, error: "WhatsApp integration is not configured" };
    }

    const recipient = normalizeWhatsAppNumber(payload.recipientNumber);
    if (!recipient) {
      return { success: false, error: "Invalid recipient phone number" };
    }

    const integratedNumber = env.whatsapp.integratedNumber;
    const templateContent = buildWhatsAppTemplateContent(
      payload.templateName,
      payload.parameters,
      payload.languageCode || "en",
    );

    const messageUuid = `outbound-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const isBulkEndpoint = env.whatsapp.apiUrl.includes("send_whatsapp_bulk");

    const text1 =
      payload.parameters.body_1 ||
      payload.parameters.text ||
      payload.originalMsgPreview ||
      "";
    const text2 =
      payload.parameters.body_2 ||
      payload.parameters.text2 ||
      "";

    // Determine bulk type: if template is welcome or lead_welcome, use 'welcome', otherwise templateName or 'simple'
    const bulkType =
      payload.templateName === "lead_welcome" ||
      payload.templateName === "welcome" ||
      payload.templateName.includes("welcome")
        ? "welcome"
        : payload.templateName || "simple";

    const requestPayload = isBulkEndpoint
      ? {
          outletId,
          text: text1,
          ...(text2 ? { text2 } : {}),
          link: "",
          type: bulkType,
          userMobileNumber: [recipient],
        }
      : {
          recipient_number: recipient,
          integrated_number: integratedNumber,
          content_type: "template",
          template_name: payload.templateName,
          language: { locale: payload.languageCode || "en" },
          content: templateContent,
          components: templateContent,
          text: payload.originalMsgPreview,
        };

    let apiSucceeded = false;
    let requestId: string | undefined;
    let errorMessage: string | undefined;

    try {
      const response = await fetch(env.whatsapp.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          authkey: env.whatsapp.authKey,
        },
        body: JSON.stringify(requestPayload),
      });

      if (response.ok) {
        const resJson = (await response.json().catch(() => ({}))) as
          | Record<string, unknown>
          | Array<Record<string, unknown>>;

        if (Array.isArray(resJson)) {
          const firstItem = resJson[0] || {};
          apiSucceeded = Boolean(firstItem.status);
          const innerData = (firstItem.data || {}) as Record<string, unknown>;
          requestId = (innerData.request_id || innerData.requestId) as string | undefined;
          if (!apiSucceeded && firstItem.message) {
            errorMessage = String(firstItem.message);
          }
        } else {
          apiSucceeded = true;
          requestId = (resJson.request_id || resJson.requestId) as string | undefined;
        }
      } else {
        const errorText = await response.text().catch(() => "");
        errorMessage = `HTTP ${response.status}: ${errorText || response.statusText}`;
        console.warn(`[WhatsApp API Warning] Outbound failed: ${errorMessage}`);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Network error";
      console.error("[WhatsApp API Error]", error);
    }

    return {
      success: apiSucceeded,
      messageUuid,
      requestId,
      error: errorMessage,
    };
  },
};
