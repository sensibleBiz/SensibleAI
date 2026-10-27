import { AppError } from "../../errors/appError.js";
import type { TransactionDatabase } from "../../db/context.js";
import {
  isAutomatedTestRuntime,
  whatsappService,
} from "../../services/whatsapp.service.js";
import type {
  CreateWhatsAppTemplatePayload,
  TestWhatsAppMessageInput,
  WhatsAppAutomationRule,
  WhatsAppAutomationTrigger,
  WhatsAppSendResult,
  WhatsAppTemplateStatus,
  WhatsAppTriggerContext,
} from "./whatsappAutomation.types.js";

export const DEFAULT_AUTOMATION_RULES: Omit<WhatsAppAutomationRule, "id" | "outletId">[] = [
  {
    triggerEvent: "LEAD_CREATED",
    name: "New Lead Welcome Message",
    isActive: true,
    templateName: "lead_welcome",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
      body_2: "{{businessName}}",
      body_3: "{{requirement}}",
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    triggerEvent: "LEAD_ASSIGNED",
    name: "Lead Assignment Executive Alert",
    isActive: true,
    templateName: "lead_assigned_alert",
    languageCode: "en",
    recipientType: "ASSIGNED_USER",
    parameterMapping: {
      body_1: "{{assignedToName}}",
      body_2: "{{customerName}}",
      body_3: "{{mobile}}",
      body_4: "{{requirement}}",
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    triggerEvent: "LEAD_ASSIGNED",
    name: "Customer Intro on Executive Assignment",
    isActive: false,
    templateName: "lead_assigned_customer_intro",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
      body_2: "{{assignedToName}}",
      body_3: "{{businessName}}",
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    triggerEvent: "STAGE_CHANGED",
    name: "Demo Scheduled Confirmation",
    isActive: false,
    templateName: "demo_scheduled",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
      body_2: "{{date}}",
      body_3: "{{assignedToName}}",
    },
    conditions: {
      stages: ["DEMO_SCHEDULED", "DEMO_DONE"],
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    triggerEvent: "STAGE_CHANGED",
    name: "Follow-up Reminder to Customer",
    isActive: false,
    templateName: "followup_reminder",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
      body_2: "{{date}}",
      body_3: "{{businessName}}",
    },
    conditions: {
      stages: ["FOLLOWUP", "CALL_BACK"],
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    triggerEvent: "QUOTATION_SENT",
    name: "Quotation Generated Notification",
    isActive: true,
    templateName: "quotation_share",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
      body_2: "{{quotationNo}}",
      body_3: "{{quotationAmount}}",
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    triggerEvent: "STAGE_CHANGED",
    name: "Deal Won / Welcome Onboarding",
    isActive: false,
    templateName: "deal_won_welcome",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
      body_2: "{{businessName}}",
    },
    conditions: {
      stages: ["WON", "CLOSED_WON", "SUCCESS"],
    },
    createdAt: 0,
    updatedAt: 0,
  },
  {
    triggerEvent: "RENEWAL_ALERT",
    name: "Subscription Renewal Reminder",
    isActive: true,
    templateName: "renewal_template",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
      body_2: "{{businessName}}",
      body_3: "{{expiryDate}}",
      body_4: "{{branchName}}",
    },
    createdAt: 0,
    updatedAt: 0,
  },
];

export const interpolateVariables = (
  template: string,
  context: WhatsAppTriggerContext,
): string => {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = context[key];
    return value !== undefined && value !== null ? String(value).trim() : "";
  });
};

const CREATE_WHATSAPP_TEMPLATE_URL =
  process.env.WHATSAPP_TEMPLATE_CREATE_URL ||
  "https://create-whatsapp-template-700529442570.asia-south1.run.app/createTemplate";
const GET_WHATSAPP_TEMPLATE_URL =
  process.env.WHATSAPP_TEMPLATE_GET_URL ||
  "https://create-whatsapp-template-700529442570.asia-south1.run.app/getTemplate";

const PROVIDER_TRIGGER_NAMES: Record<WhatsAppAutomationTrigger, string> = {
  LEAD_CREATED: "new_lead",
  LEAD_ASSIGNED: "lead_assigned",
  STAGE_CHANGED: "stage_changed",
  QUOTATION_SENT: "quotation_sent",
  RENEWAL_ALERT: "renewal_alert",
};

const stripTemplateBraces = (value: string): string =>
  value.trim().replace(/^\{\{\s*/, "").replace(/\s*\}\}$/, "");

const getExampleValue = (value: string, index: number): string => {
  const name = stripTemplateBraces(value);
  const examples: Record<string, string> = {
    customerName: "Ritesh",
    businessName: "Sensible Connect",
    companyName: "Sensible Connect",
    requirement: "CRM software",
    assignedToName: "Sales Executive",
    quotationNo: "QT-1001",
    quotationAmount: "25000",
    expiryDate: "30 September 2026",
    branchName: "Main Branch",
    date: "30 September 2026",
  };
  return examples[name] || `Sample value ${index + 1}`;
};

const getOrderedBodyMappings = (mapping: Record<string, string>) =>
  Object.entries(mapping)
    .filter(([key]) => /^body_\d+$/i.test(key))
    .sort(([first], [second]) =>
      Number(first.replace(/\D/g, "")) - Number(second.replace(/\D/g, "")),
    );

export const buildCreateWhatsAppTemplatePayload = (
  rule: WhatsAppAutomationRule,
): CreateWhatsAppTemplatePayload => {
  const bodyMappings = getOrderedBodyMappings(rule.parameterMapping);
  const components: Array<Record<string, unknown>> = [];

  if (rule.headerText?.trim()) {
    components.push({ type: "HEADER", format: "TEXT", text: rule.headerText.trim() });
  }

  const body: Record<string, unknown> = {
    type: "BODY",
    text: rule.messageBody?.trim() || "",
  };
  if (bodyMappings.length) {
    body.example = {
      body_text: [bodyMappings.map(([, value], index) => getExampleValue(value, index))],
    };
  }
  components.push(body);

  if (rule.footerText?.trim()) {
    components.push({ type: "FOOTER", text: rule.footerText.trim() });
  }

  if (rule.buttonText?.trim() && rule.buttonUrl?.trim()) {
    const button: Record<string, unknown> = {
      type: "URL",
      text: rule.buttonText.trim(),
      url: rule.buttonUrl.trim(),
    };
    if (rule.buttonUrlExample?.trim()) {
      button.example = [rule.buttonUrlExample.trim()];
    }
    components.push({ type: "BUTTONS", buttons: [button] });
  }

  return {
    outletId: rule.outletId,
    template_name: rule.templateName,
    language: rule.languageCode,
    category: rule.category || "UTILITY",
    button_url: Boolean(rule.buttonText?.trim() && rule.buttonUrl?.trim()),
    components,
    name: rule.name,
    recipientType: rule.recipientType,
    triggerEvent: PROVIDER_TRIGGER_NAMES[rule.triggerEvent],
    parameterMapping: Object.fromEntries(
      bodyMappings.map(([, value], index) => [String(index + 1), stripTemplateBraces(value)]),
    ),
    isActive: rule.isActive,
  };
};

interface ProviderLanguage {
  msg91_template_id?: string | number;
  language?: string;
  status?: string;
  rejection_reason?: string;
  variables?: string[];
  code?: Array<Record<string, unknown>>;
}

interface ProviderTemplateGroup {
  category?: string;
  name?: string;
  languages?: ProviderLanguage[];
}

const normalizeTemplateStatus = (value: unknown): WhatsAppTemplateStatus => {
  const status = String(value || "").toUpperCase();
  return status === "PENDING" || status === "APPROVED" || status === "REJECTED"
    ? status
    : "UNKNOWN";
};

const readProviderGroups = (payload: unknown): ProviderTemplateGroup[] => {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const wrapper = root.data && typeof root.data === "object"
    ? root.data as Record<string, unknown>
    : undefined;
  const groups = wrapper?.data;
  return Array.isArray(groups) ? groups as ProviderTemplateGroup[] : [];
};

const getComponent = (language: ProviderLanguage, type: string) =>
  language.code?.find((component) => String(component.type).toUpperCase() === type);

export const isMissingWhatsAppConfigurationResponse = (
  status: number,
  responseText: string,
) =>
  status === 500 &&
  responseText
    .toLowerCase()
    .includes("active whatsapp messaging configuration not found");

const getProviderRules = async (
  outletId: string,
): Promise<WhatsAppAutomationRule[] | null> => {
  if (isAutomatedTestRuntime()) return [];
  const url = new URL(GET_WHATSAPP_TEMPLATE_URL);
  url.searchParams.set("outletId", outletId);
  url.searchParams.set("pagination", "true");
  url.searchParams.set("page_size", "100");
  url.searchParams.set("page_num", "1");

  const response = await fetch(url, { headers: { accept: "application/json" } });
  const responseText = await response.text();
  if (!response.ok) {
    if (isMissingWhatsAppConfigurationResponse(response.status, responseText)) {
      return null;
    }
    throw new AppError(
      502,
      `WhatsApp template lookup failed (HTTP ${response.status}): ${responseText || response.statusText}`,
      "WHATSAPP_TEMPLATE_GET_FAILED",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new AppError(502, "WhatsApp template service returned invalid JSON.", "WHATSAPP_TEMPLATE_GET_FAILED");
  }
  if ((payload as Record<string, unknown>).success === false) {
    throw new AppError(502, "WhatsApp template service could not load templates.", "WHATSAPP_TEMPLATE_GET_FAILED");
  }

  const groups = readProviderGroups(payload);
  return groups.flatMap((group) =>
    (group.languages || []).map((language) => {
      const templateName = String(group.name || "").trim();
      const languageCode = String(language.language || "en").trim();
      const body = getComponent(language, "BODY");
      const header = getComponent(language, "HEADER");
      const footer = getComponent(language, "FOOTER");
      const buttonsComponent = getComponent(language, "BUTTONS");
      const buttons = Array.isArray(buttonsComponent?.buttons)
        ? buttonsComponent.buttons as Array<Record<string, unknown>>
        : [];
      const urlButton = buttons.find((button) => String(button.type).toUpperCase() === "URL");
      const bodyVariables = (language.variables || []).filter((value) => /^body_\d+$/i.test(value));

      return {
        id: `msg91-${language.msg91_template_id || `${templateName}-${languageCode}`}`,
        outletId,
        triggerEvent: "LEAD_CREATED" as const,
        name: templateName.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        isActive: false,
        templateName,
        languageCode,
        messageBody: typeof body?.text === "string" ? body.text : undefined,
        headerText: typeof header?.text === "string" ? header.text : undefined,
        footerText: typeof footer?.text === "string" ? footer.text : undefined,
        buttonText: typeof urlButton?.text === "string" ? urlButton.text : undefined,
        buttonUrl: typeof urlButton?.url === "string" ? urlButton.url : undefined,
        buttonUrlExample: Array.isArray(urlButton?.example) && typeof urlButton.example[0] === "string"
          ? urlButton.example[0]
          : undefined,
        category: ["UTILITY", "MARKETING", "AUTHENTICATION"].includes(String(group.category).toUpperCase())
          ? String(group.category).toUpperCase() as "UTILITY" | "MARKETING" | "AUTHENTICATION"
          : "UTILITY",
        templateStatus: normalizeTemplateStatus(language.status),
        rejectionReason: String(language.rejection_reason || "").trim() || undefined,
        msg91TemplateId: language.msg91_template_id,
        recipientType: "CUSTOMER" as const,
        parameterMapping: Object.fromEntries(
          bodyVariables.map((key, index) => [key, `{{parameter${index + 1}}}`]),
        ),
        createdAt: 0,
        updatedAt: 0,
      };
    }),
  ).filter((rule) => Boolean(rule.templateName));
};

const submitWhatsAppTemplateForApproval = async (
  rule: WhatsAppAutomationRule,
): Promise<boolean> => {
  if (!rule.messageBody?.trim()) {
    throw new AppError(
      400,
      "WhatsApp template body is required for a new automation.",
      "WHATSAPP_TEMPLATE_BODY_REQUIRED",
    );
  }

  const bodyVariableNumbers = [
    ...new Set(
      [...rule.messageBody.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])),
    ),
  ].sort((first, second) => first - second);
  const staticBodyWordCount = rule.messageBody
    .replace(/\{\{\d+\}\}/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const mappedNumbers = getOrderedBodyMappings(rule.parameterMapping).map(([key]) =>
    Number(key.replace(/\D/g, "")),
  );
  if (
    bodyVariableNumbers.some((value, index) => value !== index + 1) ||
    bodyVariableNumbers.length !== mappedNumbers.length ||
    bodyVariableNumbers.some((value, index) => value !== mappedNumbers[index])
  ) {
    throw new AppError(
      400,
      "Every numbered body variable must have a matching body_N parameter mapping.",
      "WHATSAPP_TEMPLATE_PARAMETER_MAPPING_INVALID",
    );
  }
  if (
    bodyVariableNumbers.length > 0 &&
    staticBodyWordCount < bodyVariableNumbers.length * 4
  ) {
    throw new AppError(
      400,
      `The template has too many variables for its length. Add more fixed message text or reduce the ${bodyVariableNumbers.length} variables before submitting to Message91.`,
      "WHATSAPP_TEMPLATE_VARIABLE_DENSITY_INVALID",
    );
  }
  if (rule.buttonUrl?.includes("{{") && !rule.buttonUrlExample?.trim()) {
    throw new AppError(
      400,
      "An example URL is required when the button URL contains a variable.",
      "WHATSAPP_TEMPLATE_BUTTON_EXAMPLE_REQUIRED",
    );
  }

  if (isAutomatedTestRuntime()) return true;

  const response = await fetch(CREATE_WHATSAPP_TEMPLATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(buildCreateWhatsAppTemplatePayload(rule)),
  });

  const responseText = await response.text().catch(() => "");
  let responsePayload: Record<string, unknown> | undefined;
  try {
    responsePayload = responseText
      ? JSON.parse(responseText) as Record<string, unknown>
      : undefined;
  } catch {
    responsePayload = undefined;
  }
  if (!response.ok || responsePayload?.success === false) {
    if (isMissingWhatsAppConfigurationResponse(response.status, responseText)) {
      return false;
    }
    const msg91Response =
      responsePayload?.msg91Response && typeof responsePayload.msg91Response === "object"
        ? responsePayload.msg91Response as Record<string, unknown>
        : undefined;
    const providerError = String(
      msg91Response?.errors ||
        msg91Response?.data ||
        responsePayload?.message ||
        response.statusText ||
        "Template validation failed",
    ).replace(/[.\s]+$/, "");
    const guidance = /too many variables for its length/i.test(providerError)
      ? ". Add more fixed message text or reduce the number of variables."
      : "";
    throw new AppError(
      response.status >= 400 && response.status < 500 ? 400 : 502,
      `Message91 rejected the template: ${providerError}${guidance || "."}`,
      response.status >= 400 && response.status < 500
        ? "WHATSAPP_TEMPLATE_INVALID"
        : "WHATSAPP_TEMPLATE_CREATE_FAILED",
    );
  }
  return true;
};

export const whatsappAutomationService = {
  async getRules(database: TransactionDatabase, tenantId: string, outletId: string): Promise<WhatsAppAutomationRule[]> {
    const snapshot = await database.client.query<{
      id: string; trigger_event: WhatsAppAutomationTrigger; name: string; active: boolean;
      template_name: string; language_code: string; recipient_type: WhatsAppAutomationRule["recipientType"];
      parameter_mapping: Record<string,string>; conditions: WhatsAppAutomationRule["conditions"] | null;
      template_payload: Partial<WhatsAppAutomationRule>; created_at: Date; updated_at: Date;
    }>(`SELECT id,trigger_event,name,active,template_name,language_code,recipient_type,
      parameter_mapping,conditions,template_payload,created_at,updated_at
      FROM crm.whatsapp_automation_rules WHERE tenant_id=$1 AND outlet_id=$2`, [tenantId,outletId]);
    const persisted: WhatsAppAutomationRule[] = snapshot.rows.map((row) => ({
      ...row.template_payload,
      id: row.id,
      outletId,
      triggerEvent: row.trigger_event,
      name: row.name,
      isActive: row.active,
      templateName: row.template_name,
      languageCode: row.language_code,
      recipientType: row.recipient_type,
      parameterMapping: row.parameter_mapping,
      conditions: row.conditions ?? undefined,
      createdAt: row.created_at.getTime(),
      updatedAt: row.updated_at.getTime(),
    }));
    const providerRules = await getProviderRules(outletId);
    if (providerRules === null) {
      return persisted.map((rule) => ({ ...rule, outletId, isActive: false }));
    }
    const persistedByTemplate = new Map(
      persisted.map((rule) => [`${rule.templateName}:${rule.languageCode || "en"}`, rule]),
    );
    const defaultByTemplate = new Map(
      DEFAULT_AUTOMATION_RULES.map((rule) => [`${rule.templateName}:${rule.languageCode || "en"}`, rule]),
    );
    const foundKeys = new Set<string>();

    const merged = providerRules.map((providerRule) => {
      const key = `${providerRule.templateName}:${providerRule.languageCode}`;
      foundKeys.add(key);
      const saved = persistedByTemplate.get(key);
      const fallback = defaultByTemplate.get(key);
      const automationConfigured = Boolean(
        saved && (saved.automationConfigured ?? saved.templateStatus !== "PENDING"),
      );
      return {
        ...(fallback || {}),
        ...providerRule,
        ...(saved || {}),
        outletId,
        isActive:
          providerRule.templateStatus === "APPROVED" && automationConfigured
            ? Boolean(saved?.isActive ?? fallback?.isActive ?? false)
            : false,
        automationConfigured,
        templateStatus: providerRule.templateStatus,
        rejectionReason: providerRule.rejectionReason,
        msg91TemplateId: providerRule.msg91TemplateId,
        messageBody: providerRule.messageBody || saved?.messageBody,
        headerText: providerRule.headerText || saved?.headerText,
        footerText: providerRule.footerText || saved?.footerText,
        buttonText: providerRule.buttonText || saved?.buttonText,
        buttonUrl: providerRule.buttonUrl || saved?.buttonUrl,
        buttonUrlExample: providerRule.buttonUrlExample || saved?.buttonUrlExample,
        category: providerRule.category || saved?.category,
      } as WhatsAppAutomationRule;
    });

    const awaitingProvider = persisted.filter((rule) => {
      const key = `${rule.templateName}:${rule.languageCode || "en"}`;
      return (
        !foundKeys.has(key) &&
        (rule.templateStatus === "PENDING" || rule.templateStatus === "UNKNOWN")
      );
    });

    return [...merged, ...awaitingProvider];
  },

  async saveRule(
    database: TransactionDatabase,
    tenantId: string,
    outletId: string,
    rule: Omit<WhatsAppAutomationRule, "outletId" | "createdAt" | "updatedAt"> & { id?: string },
  ): Promise<WhatsAppAutomationRule> {
    const now = Date.now();
    const existingResult = await database.client.query<{id:string;template_payload:Partial<WhatsAppAutomationRule>;created_at:Date}>(
      `SELECT id,template_payload,created_at FROM crm.whatsapp_automation_rules
       WHERE tenant_id=$1 AND outlet_id=$2 AND template_name=$3 AND language_code=$4 LIMIT 1`,
      [tenantId,outletId,rule.templateName.trim(),rule.languageCode?.trim() || "en"],
    );
    const existing = existingResult.rows[0];
    const existingTemplateStatus = normalizeTemplateStatus(existing?.template_payload.templateStatus);
    const shouldSubmitTemplate = Boolean(
      rule.submitTemplateForApproval && (!existing || existingTemplateStatus === "UNKNOWN"),
    );
    let providerTemplate: WhatsAppAutomationRule | undefined;
    if (!shouldSubmitTemplate) {
      providerTemplate = (await getProviderRules(outletId))?.find(
        (template) =>
          template.templateName === rule.templateName.trim() &&
          template.languageCode === (rule.languageCode?.trim() || "en"),
      );
    }

    if (!shouldSubmitTemplate && rule.isActive && providerTemplate?.templateStatus !== "APPROVED") {
      throw new AppError(
        409,
        "Only Message91-approved WhatsApp templates can be activated.",
        "WHATSAPP_TEMPLATE_NOT_APPROVED",
      );
    }

    const ruleData: WhatsAppAutomationRule = {
      id: existing?.id ?? "",
      outletId,
      triggerEvent: rule.triggerEvent,
      name: rule.name,
      isActive: Boolean(rule.isActive),
      automationConfigured: Boolean(rule.automationConfigured),
      templateName: rule.templateName.trim(),
      languageCode: rule.languageCode?.trim() || "en",
      messageBody: rule.messageBody?.trim() || undefined,
      headerText: rule.headerText?.trim() || undefined,
      footerText: rule.footerText?.trim() || undefined,
      buttonText: rule.buttonText?.trim() || undefined,
      buttonUrl: rule.buttonUrl?.trim() || undefined,
      buttonUrlExample: rule.buttonUrlExample?.trim() || undefined,
      category: rule.category || "UTILITY",
      templateStatus: shouldSubmitTemplate
        ? "PENDING"
        : providerTemplate?.templateStatus || existingTemplateStatus,
      rejectionReason: providerTemplate?.rejectionReason || existing?.template_payload.rejectionReason,
      msg91TemplateId: providerTemplate?.msg91TemplateId || existing?.template_payload.msg91TemplateId,
      recipientType: rule.recipientType,
      customRecipientNumber: rule.customRecipientNumber?.trim() || undefined,
      parameterMapping: rule.parameterMapping || {},
      conditions: rule.conditions,
      createdAt: existing?.created_at.getTime() ?? now,
      updatedAt: now,
    };

    if (shouldSubmitTemplate) {
      const submitted = await submitWhatsAppTemplateForApproval(ruleData);
      ruleData.isActive = false;
      ruleData.templateStatus = submitted ? "PENDING" : "UNKNOWN";
    }

    const templatePayload = {
      automationConfigured: ruleData.automationConfigured, messageBody: ruleData.messageBody,
      headerText: ruleData.headerText, footerText: ruleData.footerText, buttonText: ruleData.buttonText,
      buttonUrl: ruleData.buttonUrl, buttonUrlExample: ruleData.buttonUrlExample, category: ruleData.category,
      templateStatus: ruleData.templateStatus, rejectionReason: ruleData.rejectionReason,
      msg91TemplateId: ruleData.msg91TemplateId, customRecipientNumber: ruleData.customRecipientNumber,
    };
    const saved = await database.client.query<{id:string;created_at:Date;updated_at:Date}>(
      `INSERT INTO crm.whatsapp_automation_rules (id,tenant_id,outlet_id,trigger_event,name,active,template_name,
        language_code,recipient_type,parameter_mapping,conditions,template_payload)
       VALUES (COALESCE($1::uuid,public.uuid_generate_v7()),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id,outlet_id,template_name,language_code) DO UPDATE SET
        trigger_event=EXCLUDED.trigger_event,name=EXCLUDED.name,active=EXCLUDED.active,
        recipient_type=EXCLUDED.recipient_type,parameter_mapping=EXCLUDED.parameter_mapping,
        conditions=EXCLUDED.conditions,template_payload=EXCLUDED.template_payload,updated_at=now()
       RETURNING id,created_at,updated_at`,
      [existing?.id ?? null,tenantId,outletId,ruleData.triggerEvent,ruleData.name,ruleData.isActive,ruleData.templateName,
        ruleData.languageCode,ruleData.recipientType,JSON.stringify(ruleData.parameterMapping),
        ruleData.conditions ? JSON.stringify(ruleData.conditions) : null,JSON.stringify(templatePayload)],
    );
    return {...ruleData,id:saved.rows[0]!.id,createdAt:saved.rows[0]!.created_at.getTime(),updatedAt:saved.rows[0]!.updated_at.getTime()};
  },

  async trigger(
    database: TransactionDatabase,
    tenantId: string,
    event: WhatsAppAutomationTrigger,
    context: WhatsAppTriggerContext,
  ): Promise<WhatsAppSendResult[]> {
    const outletId = context.outletId;
    if (!outletId) return [];

    try {
      const rules = await this.getRules(database, tenantId, outletId);
      const matchingRules = rules.filter(
        (rule) =>
          rule.triggerEvent === event &&
          rule.isActive &&
          rule.automationConfigured === true &&
          rule.templateStatus === "APPROVED",
      );

      if (matchingRules.length === 0) return [];

      const results: WhatsAppSendResult[] = [];

      for (const rule of matchingRules) {
        if (rule.conditions?.stages && rule.conditions.stages.length > 0) {
          if (!context.stage || !rule.conditions.stages.includes(context.stage.toUpperCase())) continue;
        }
        if (rule.conditions?.sources && rule.conditions.sources.length > 0) {
          if (!context.source || !rule.conditions.sources.includes(context.source)) continue;
        }

        let targetPhone = "";
        if (rule.recipientType === "CUSTOMER") {
          targetPhone = context.mobile || "";
        } else if (rule.recipientType === "ASSIGNED_USER") {
          targetPhone = context.assignedToMobile || "";
        } else if (rule.recipientType === "CUSTOM_NUMBER") {
          targetPhone = rule.customRecipientNumber || "";
        }

        if (!targetPhone) {
          console.warn(`[WhatsApp Automation] No phone found for rule '${rule.name}' (type: ${rule.recipientType})`);
          continue;
        }

        const resolvedParameters: Record<string, string> = {};
        for (const [key, placeholder] of Object.entries(rule.parameterMapping)) {
          resolvedParameters[key] = interpolateVariables(placeholder, context);
        }

        const previewMsg = Object.values(resolvedParameters).filter(Boolean).join(" | ");
        const category = rule.triggerEvent === "RENEWAL_ALERT" ? "renewal" : "crm";

        const result = await whatsappService.sendTemplateMessage(outletId, {
          recipientNumber: targetPhone,
          templateName: rule.templateName,
          languageCode: rule.languageCode,
          parameters: resolvedParameters,
          category,
          originalMsgPreview: previewMsg,
        });

        results.push(result);
      }

      return results;
    } catch (err) {
      console.error("[WhatsApp Automation Execution Error]", err);
      return [];
    }
  },

  async testSend(database: TransactionDatabase, tenantId: string, input: TestWhatsAppMessageInput): Promise<WhatsAppSendResult> {
    const rules = await this.getRules(database, tenantId, input.outletId);
    const template = rules.find(
      (rule) =>
        rule.templateName === input.templateName &&
        (rule.languageCode || "en") === (input.languageCode || "en"),
    );
    if (!template || template.templateStatus !== "APPROVED") {
      return {
        success: false,
        error: "This template is not approved by Message91 yet. Refresh after approval before sending.",
      };
    }
    return whatsappService.sendTemplateMessage(input.outletId, {
      recipientNumber: input.recipientNumber,
      templateName: input.templateName,
      languageCode: input.languageCode || "en",
      parameters: input.parameters,
      category: "crm",
      originalMsgPreview: `[Test] Template: ${input.templateName}`,
    });
  },
};
