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
  outletId: string;
  triggerEvent: WhatsAppAutomationTrigger;
  name: string;
  isActive: boolean;
  automationConfigured?: boolean | undefined;
  templateName: string;
  languageCode: string;
  messageBody?: string | undefined;
  headerText?: string | undefined;
  footerText?: string | undefined;
  buttonText?: string | undefined;
  buttonUrl?: string | undefined;
  buttonUrlExample?: string | undefined;
  category?: "UTILITY" | "MARKETING" | "AUTHENTICATION" | undefined;
  templateStatus?: WhatsAppTemplateStatus | undefined;
  rejectionReason?: string | undefined;
  msg91TemplateId?: string | number | undefined;
  submitTemplateForApproval?: boolean | undefined;
  recipientType: WhatsAppRecipientType;
  customRecipientNumber?: string | undefined;
  /**
   * Parameter mappings matching template placeholders.
   * e.g. { body_1: "{{customerName}}", body_2: "{{businessName}}" }
   */
  parameterMapping: Record<string, string>;
  conditions?: {
    sources?: string[] | undefined;
    stages?: string[] | undefined;
  } | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface WhatsAppSendPayload {
  recipientNumber: string;
  templateName: string;
  languageCode?: string | undefined;
  parameters: Record<string, string>;
  category?: "crm" | "renewal" | "event" | "others" | undefined;
  originalMsgPreview?: string | undefined;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageUuid?: string | undefined;
  requestId?: string | undefined;
  error?: string | undefined;
}

export interface WhatsAppTriggerContext {
  outletId: string;
  leadId?: string | undefined;
  customerName?: string | undefined;
  businessName?: string | undefined;
  businessType?: string | undefined;
  mobile?: string | undefined;
  email?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  requirement?: string | undefined;
  source?: string | undefined;
  stage?: string | undefined;
  assignedToName?: string | undefined;
  assignedToMobile?: string | undefined;
  assignedToEmail?: string | undefined;
  quotationNo?: string | undefined;
  quotationAmount?: string | number | undefined;
  expiryDate?: string | undefined;
  branchName?: string | undefined;
  crmLeadUrl?: string | undefined;
  [key: string]: unknown;
}

export interface TestWhatsAppMessageInput {
  outletId: string;
  recipientNumber: string;
  templateName: string;
  languageCode?: string | undefined;
  parameters: Record<string, string>;
}

export interface CreateWhatsAppTemplatePayload {
  outletId: string;
  template_name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  button_url: boolean;
  components: Array<Record<string, unknown>>;
  name: string;
  recipientType: WhatsAppRecipientType;
  triggerEvent: string;
  parameterMapping: Record<string, string>;
  isActive: boolean;
}
