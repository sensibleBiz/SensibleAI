import { apiRequest } from "@/shared/api/apiClient";

export type WhatsAppAutomationTrigger =
  | "LEAD_CREATED"
  | "LEAD_ASSIGNED"
  | "STAGE_CHANGED"
  | "QUOTATION_SENT"
  | "RENEWAL_ALERT";

export type WhatsAppRecipientType = "CUSTOMER" | "ASSIGNED_USER" | "CUSTOM_NUMBER";
export type WhatsAppTemplateStatus = "PENDING" | "APPROVED" | "REJECTED" | "UNKNOWN";

export interface WhatsAppAutomationRule {
  id: string;
  outletId?: string;
  triggerEvent: WhatsAppAutomationTrigger;
  name: string;
  isActive: boolean;
  automationConfigured?: boolean;
  templateName: string;
  languageCode: string;
  messageBody?: string;
  headerText?: string;
  footerText?: string;
  buttonText?: string;
  buttonUrl?: string;
  buttonUrlExample?: string;
  category?: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  templateStatus?: WhatsAppTemplateStatus;
  rejectionReason?: string;
  msg91TemplateId?: string | number;
  submitTemplateForApproval?: boolean;
  recipientType: WhatsAppRecipientType;
  customRecipientNumber?: string;
  parameterMapping: Record<string, string>;
  conditions?: {
    sources?: string[];
    stages?: string[];
  };
  createdAt?: number;
  updatedAt?: number;
}

export interface TestWhatsAppPayload {
  recipientNumber: string;
  templateName: string;
  languageCode?: string;
  parameters: Record<string, string>;
}

export interface TestWhatsAppResponse {
  success: boolean;
  messageUuid?: string;
  requestId?: string;
  error?: string;
}

export const whatsappAutomationApi = {
  getRules(outletId: string, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<WhatsAppAutomationRule[]>(
      `/api/v1/whatsapp-automation/rules?${searchParams.toString()}`,
      { signal },
    );
  },

  saveRule(
    outletId: string,
    rule: WhatsAppAutomationRule,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<WhatsAppAutomationRule>(
      `/api/v1/whatsapp-automation/rules?${searchParams.toString()}`,
      {
        method: "POST",
        body: rule,
        signal,
      },
    );
  },

  testSend(
    outletId: string,
    payload: TestWhatsAppPayload,
    signal?: AbortSignal,
  ) {
    const searchParams = new URLSearchParams({ outletId });
    return apiRequest<TestWhatsAppResponse>(
      `/api/v1/whatsapp-automation/test?${searchParams.toString()}`,
      {
        method: "POST",
        body: payload,
        signal,
      },
    );
  },
};
