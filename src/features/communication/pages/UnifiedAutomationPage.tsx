import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Typography,
} from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Eye,
  PauseCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  User,
  X,
  Zap,
} from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { useMessageApi } from "@/shared/hooks";
import {
  whatsappAutomationApi,
  type WhatsAppAutomationRule,
  type WhatsAppAutomationTrigger,
  type WhatsAppRecipientType,
} from "@/features/whatsapp";

const { Paragraph, Text } = Typography;
const NAVY = "#0a3750";
const RED = "#ff3228";

export type AutomationChannel = "whatsapp" | "email" | "sms";
type StatusFilter = "all" | "active" | "inactive";

interface UnifiedAutomationPageProps {
  channel: AutomationChannel;
  description: string;
  icon: React.ReactNode;
  title: string;
}

interface AutomationRule {
  automationConfigured?: boolean;
  createdAt?: number;
  customRecipientNumber?: string;
  id: string;
  isActive: boolean;
  languageCode?: string;
  messageBody?: string;
  headerText?: string;
  footerText?: string;
  buttonText?: string;
  buttonUrl?: string;
  buttonUrlExample?: string;
  category?: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  templateStatus?: "PENDING" | "APPROVED" | "REJECTED" | "UNKNOWN";
  rejectionReason?: string;
  msg91TemplateId?: string | number;
  name: string;
  outletId?: string;
  parameterMapping: Record<string, string>;
  previewText?: string;
  recipientType: WhatsAppRecipientType;
  replyTo?: string;
  senderId?: string;
  senderName?: string;
  subject?: string;
  templateName: string;
  triggerEvent: WhatsAppAutomationTrigger;
  updatedAt?: number;
}

const TRIGGER_META: Record<
  WhatsAppAutomationTrigger,
  { description: string; label: string; tone: string }
> = {
  LEAD_CREATED: {
    description: "Sends the moment a new lead is added to the CRM.",
    label: "New Lead Created",
    tone: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  LEAD_ASSIGNED: {
    description: "Sends the moment a lead is assigned to a team member.",
    label: "Lead Assigned",
    tone: "bg-teal-50 text-teal-700 ring-teal-200",
  },
  STAGE_CHANGED: {
    description: "Sends when a lead moves to another sales stage.",
    label: "Stage Changed",
    tone: "bg-violet-50 text-violet-700 ring-violet-200",
  },
  QUOTATION_SENT: {
    description: "Sends when a quotation is generated in the CRM.",
    label: "Quotation Generated",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  RENEWAL_ALERT: {
    description: "Goes out on a schedule before a customer's plan expires.",
    label: "Subscription Renewal Due",
    tone: "bg-amber-50 text-amber-700 ring-amber-200",
  },
};

const PLACEHOLDERS = [
  "{{customerName}}",
  "{{businessName}}",
  "{{mobile}}",
  "{{email}}",
  "{{city}}",
  "{{requirement}}",
  "{{assignedToName}}",
  "{{quotationNo}}",
  "{{quotationAmount}}",
  "{{expiryDate}}",
  "{{branchName}}",
  "{{date}}",
];

const SAMPLE_VALUES: Record<string, string> = {
  assignedToName: "Aarav Patil",
  branchName: "Pune Branch",
  businessName: "Sensible CRM",
  city: "Pune",
  customerName: "Priya kulkarni",
  date: "10 Sep 2026",
  email: "priya@example.com",
  expiryDate: "30 Sep 2026",
  mobile: "98765 43210",
  quotationAmount: "₹24,500",
  quotationNo: "QT-1042",
  requirement: "CRM software",
};

const renderSampleText = (value = "") =>
  value.replace(/{{\s*([^}]+)\s*}}/g, (_, key: string) => {
    const normalizedKey = key.trim();
    return SAMPLE_VALUES[normalizedKey] ?? `Sample ${normalizedKey}`;
  });

const getDemoRules = (channel: AutomationChannel): AutomationRule[] => {
  if (channel === "email") {
    return [
      {
        id: "email-lead-welcome",
        triggerEvent: "LEAD_CREATED",
        name: "New Lead Welcome Email",
        templateName: "lead_welcome_email",
        recipientType: "CUSTOMER",
        subject: "Thanks for contacting {{businessName}}",
        previewText: "We received your enquiry and will contact you shortly.",
        senderName: "Sales Team",
        replyTo: "sales@example.com",
        messageBody:
          "Hi {{customerName}},\n\nThank you for your interest in {{requirement}}. {{assignedToName}} will contact you shortly.\n\nRegards,\n{{businessName}}",
        parameterMapping: {
          customer: "{{customerName}}",
          business: "{{businessName}}",
          owner: "{{assignedToName}}",
        },
        isActive: true,
      },
      {
        id: "email-quotation",
        triggerEvent: "QUOTATION_SENT",
        name: "Quotation Follow-up",
        templateName: "quotation_followup_email",
        recipientType: "CUSTOMER",
        subject: "Quotation {{quotationNo}} from {{businessName}}",
        previewText: "Your quotation is ready to review.",
        senderName: "Sales Team",
        replyTo: "sales@example.com",
        messageBody:
          "Hello {{customerName}},\n\nYour quotation {{quotationNo}} for {{quotationAmount}} is ready. Reply to this email if you have any questions.",
        parameterMapping: {
          customer: "{{customerName}}",
          quotation: "{{quotationNo}}",
          amount: "{{quotationAmount}}",
        },
        isActive: false,
      },
    ];
  }

  if (channel === "sms") {
    return [
      {
        id: "sms-lead-assigned",
        triggerEvent: "LEAD_ASSIGNED",
        name: "Lead Assignment SMS",
        templateName: "lead_assignment_sms",
        senderId: "SENSBL",
        recipientType: "CUSTOMER",
        messageBody:
          "Hi {{customerName}}, {{assignedToName}} will contact you shortly about {{requirement}}. - {{businessName}}",
        parameterMapping: {
          customer: "{{customerName}}",
          owner: "{{assignedToName}}",
          requirement: "{{requirement}}",
        },
        isActive: true,
      },
      {
        id: "sms-renewal-reminder",
        triggerEvent: "RENEWAL_ALERT",
        name: "Renewal Reminder SMS",
        templateName: "renewal_reminder_sms",
        senderId: "SENSBL",
        recipientType: "CUSTOMER",
        messageBody:
          "Hi {{customerName}}, your subscription expires on {{expiryDate}}. Contact {{businessName}} to renew.",
        parameterMapping: {
          customer: "{{customerName}}",
          expiry: "{{expiryDate}}",
        },
        isActive: false,
      },
    ];
  }

  return [];
};

const toUiRule = (rule: WhatsAppAutomationRule): AutomationRule => ({
  ...rule,
});

const toWhatsAppRule = (
  rule: AutomationRule,
  outletId: string,
  submitTemplateForApproval = false,
): WhatsAppAutomationRule => ({
  id: rule.id,
  outletId,
  triggerEvent: rule.triggerEvent,
  name: rule.name,
  isActive: rule.isActive,
  automationConfigured: rule.automationConfigured,
  templateName: rule.templateName,
  languageCode: rule.languageCode || "en",
  messageBody: rule.messageBody,
  headerText: rule.headerText,
  footerText: rule.footerText,
  buttonText: rule.buttonText,
  buttonUrl: rule.buttonUrl,
  buttonUrlExample: rule.buttonUrlExample,
  category: rule.category || "UTILITY",
  templateStatus: rule.templateStatus,
  rejectionReason: rule.rejectionReason,
  msg91TemplateId: rule.msg91TemplateId,
  submitTemplateForApproval,
  recipientType: rule.recipientType,
  customRecipientNumber: rule.customRecipientNumber,
  parameterMapping: rule.parameterMapping,
  createdAt: rule.createdAt,
  updatedAt: rule.updatedAt,
});

const getChannelLabel = (channel: AutomationChannel) =>
  channel === "whatsapp" ? "WhatsApp" : channel === "email" ? "Email" : "SMS";

const getRecipientLabel = (
  channel: AutomationChannel,
  type: WhatsAppRecipientType,
) => {
  if (type === "ASSIGNED_USER") {
    return channel === "email"
      ? "Assigned Executive Email"
      : "Assigned Executive Mobile";
  }
  if (type === "CUSTOM_NUMBER") {
    return channel === "email" ? "Custom Email Address" : "Custom Mobile Number";
  }
  return channel === "email" ? "Customer Email" : "Customer Mobile";
};

const getTemplateMeta = (channel: AutomationChannel, rule: AutomationRule) => {
  if (channel === "whatsapp") {
    return `Language: ${(rule.languageCode || "en").toUpperCase()}`;
  }
  if (channel === "email") {
    return rule.subject ? `Subject: ${rule.subject}` : "Subject not set";
  }
  return `Sender: ${rule.senderId || "Not set"}`;
};

const StatCard: React.FC<{
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  label: string;
  tint: string;
  value: number;
}> = ({ icon: Icon, label, tint, value }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tint}`}
    >
      <Icon size={18} strokeWidth={2.25} />
    </div>
    <div className="leading-tight">
      <p className="text-xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-500">{label}</p>
    </div>
  </div>
);

const CopyChip: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-[12px] text-slate-600 transition-colors hover:border-slate-300 hover:bg-white"
      title="Copy placeholder"
    >
      {text}
      {copied ? (
        <Check size={12} className="text-emerald-600" />
      ) : (
        <Copy
          size={12}
          className="text-slate-400 group-hover:text-slate-500"
        />
      )}
    </button>
  );
};

const UnifiedAutomationPage: React.FC<UnifiedAutomationPageProps> = ({
  channel,
  description,
  icon,
  title,
}) => {
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id,
  );
  const messageApi = useMessageApi();
  const channelLabel = getChannelLabel(channel);
  const [rules, setRules] = useState<AutomationRule[]>(() =>
    getDemoRules(channel),
  );
  const [loading, setLoading] = useState(channel === "whatsapp");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [editorMode, setEditorMode] = useState<"template" | "rule">("rule");
  const [assigningTemplate, setAssigningTemplate] = useState<AutomationRule | null>(null);
  const [selectedExistingRuleId, setSelectedExistingRuleId] = useState<string>();
  const [previewRule, setPreviewRule] = useState<AutomationRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [ruleForm] = Form.useForm();
  const [testForm] = Form.useForm();

  const loadWhatsAppRules = async (signal?: AbortSignal) => {
    if (channel !== "whatsapp" || !outletId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await whatsappAutomationApi.getRules(outletId, signal);
      setRules(response.map(toUiRule));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("Failed to load WhatsApp automation rules", error);
      messageApi.error("Failed to load WhatsApp automation rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (channel !== "whatsapp") return;
    const controller = new AbortController();
    void loadWhatsAppRules(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, outletId]);

  const activeCount = useMemo(
    () => rules.filter((rule) => rule.automationConfigured && rule.isActive).length,
    [rules],
  );
  const configuredRules = useMemo(
    () => rules.filter((rule) => rule.automationConfigured),
    [rules],
  );
  const pendingCount = useMemo(
    () => rules.filter((rule) => rule.templateStatus === "PENDING").length,
    [rules],
  );

  const filteredRules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rules.filter((rule) => {
      const trigger = TRIGGER_META[rule.triggerEvent];
      const matchesQuery =
        !normalizedQuery ||
        rule.name.toLowerCase().includes(normalizedQuery) ||
        rule.templateName.toLowerCase().includes(normalizedQuery) ||
        trigger.label.toLowerCase().includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && rule.isActive) ||
        (statusFilter === "inactive" && !rule.isActive);
      return matchesQuery && matchesStatus;
    });
  }, [query, rules, statusFilter]);

  const openRuleForm = (rule?: AutomationRule, mode: "template" | "rule" = "rule") => {
    const emptyRule: AutomationRule = {
      id: "",
      triggerEvent: "LEAD_CREATED",
      name: "",
      // A new WhatsApp template cannot run until Message91 approves it.
      isActive: channel !== "whatsapp",
      templateName: "",
      languageCode: "en",
      category: "UTILITY",
      recipientType: "CUSTOMER",
      messageBody: "",
      parameterMapping: { body_1: "{{customerName}}" },
      automationConfigured: channel !== "whatsapp",
    };
    const nextRule = rule ?? emptyRule;
    setEditorMode(mode);
    setEditingRule(nextRule);
    ruleForm.resetFields();
    ruleForm.setFieldsValue({
      ...nextRule,
      parameters: Object.entries(nextRule.parameterMapping || {}).map(
        ([key, value]) => ({ key, value }),
      ),
    });
  };

  const openTemplateForm = () => openRuleForm(undefined, "template");

  const getTemplateParameterMapping = (messageBody = "") => {
    const variableNumbers = [
      ...new Set(
        [...messageBody.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])),
      ),
    ].sort((first, second) => first - second);
    return Object.fromEntries(
      variableNumbers.map((number) => [`body_${number}`, `{{parameter${number}}}`]),
    );
  };

  const saveRule = async () => {
    if (!editingRule) return;
    try {
      const values = await ruleForm.validateFields();
      const isTemplateCreation = channel === "whatsapp" && editorMode === "template";
      const parameterMapping = isTemplateCreation
        ? getTemplateParameterMapping(values.messageBody)
        : Object.fromEntries(
            (values.parameters || [])
              .filter((parameter: { key?: string; value?: string }) =>
                Boolean(parameter.key?.trim() && parameter.value?.trim()),
              )
              .map((parameter: { key: string; value: string }) => [
                parameter.key.trim(),
                parameter.value.trim(),
              ]),
          );
      const templateDisplayName = String(values.templateName || editingRule.templateName)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
      const requestedRule: AutomationRule = {
        ...editingRule,
        ...values,
        id:
          editingRule.id ||
          `${channel}-${isTemplateCreation ? "template" : "rule"}-${Date.now()}`,
        name: isTemplateCreation ? templateDisplayName : values.name,
        triggerEvent: isTemplateCreation ? "LEAD_CREATED" : values.triggerEvent,
        recipientType: isTemplateCreation ? "CUSTOMER" : values.recipientType,
        isActive: isTemplateCreation ? false : Boolean(values.isActive ?? editingRule.isActive),
        automationConfigured: !isTemplateCreation,
        parameterMapping,
      };
      const nextRule: AutomationRule =
        channel === "whatsapp" && requestedRule.templateStatus !== "APPROVED"
          ? { ...requestedRule, isActive: false }
          : requestedRule;

      setSaving(true);
      let savedRule = nextRule;
      if (channel === "whatsapp") {
        if (!outletId) {
          messageApi.error("Select an outlet before saving this rule.");
          return;
        }
        const response = await whatsappAutomationApi.saveRule(
          outletId,
          toWhatsAppRule(
            nextRule,
            outletId,
            isTemplateCreation,
          ),
        );
        savedRule = toUiRule(response);
      }

      setRules((currentRules) => {
        const exists = currentRules.some((rule) => rule.id === savedRule.id);
        return exists
          ? currentRules.map((rule) =>
              rule.id === savedRule.id ? savedRule : rule,
            )
          : [...currentRules, savedRule];
      });
      setEditingRule(null);
      if (channel === "whatsapp" && savedRule.templateStatus === "UNKNOWN") {
        messageApi.warning(
          "Saved as an inactive draft. Connect WhatsApp messaging to submit it to Message91.",
        );
      } else {
        messageApi.success(
          channel === "whatsapp"
            ? isTemplateCreation || savedRule.templateStatus === "PENDING"
              ? "Template submitted to Message91. Approval can take up to 48 hours."
              : "WhatsApp automation rule saved."
            : `${channelLabel} template updated in this UI preview.`,
        );
      }
    } catch (error) {
      console.error(`Failed to save ${channelLabel} automation rule`, error);
      messageApi.error(
        error instanceof Error
          ? error.message
          : "Please complete all required fields.",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (rule: AutomationRule) => {
    const isActive = !rule.isActive;
    if (channel === "whatsapp") {
      if (!outletId) return;
      if (isActive && rule.templateStatus !== "APPROVED") {
        messageApi.warning("This template can be enabled after Message91 approves it.");
        return;
      }
      try {
        const response = await whatsappAutomationApi.saveRule(
          outletId,
          toWhatsAppRule({ ...rule, isActive }, outletId),
        );
        setRules((currentRules) =>
          currentRules.map((item) =>
            item.id === rule.id ? toUiRule(response) : item,
          ),
        );
        return;
      } catch (error) {
        console.error("Failed to update WhatsApp automation status", error);
        messageApi.error("Failed to update the automation status.");
        return;
      }
    }

    setRules((currentRules) =>
      currentRules.map((item) =>
        item.id === rule.id ? { ...item, isActive } : item,
      ),
    );
  };

  const assignExistingRule = async () => {
    if (!outletId || !assigningTemplate || !selectedExistingRuleId) return;
    const existingRule = rules.find((rule) => rule.id === selectedExistingRuleId);
    if (!existingRule) return;
    const sortParameterEntries = (mapping: Record<string, string>) =>
      Object.entries(mapping).sort(([first], [second]) =>
        Number(first.replace(/\D/g, "")) - Number(second.replace(/\D/g, "")),
      );
    const existingValues = sortParameterEntries(existingRule.parameterMapping).map(
      ([, value]) => value,
    );
    const parameterMapping = Object.fromEntries(
      sortParameterEntries(assigningTemplate.parameterMapping).map(([key, fallback], index) => [
        key,
        existingValues[index] || fallback,
      ]),
    );

    setSaving(true);
    try {
      await whatsappAutomationApi.saveRule(
        outletId,
        toWhatsAppRule(
          {
            ...existingRule,
            id: assigningTemplate.id,
            templateName: assigningTemplate.templateName,
            languageCode: assigningTemplate.languageCode,
            messageBody: assigningTemplate.messageBody,
            headerText: assigningTemplate.headerText,
            footerText: assigningTemplate.footerText,
            buttonText: assigningTemplate.buttonText,
            buttonUrl: assigningTemplate.buttonUrl,
            buttonUrlExample: assigningTemplate.buttonUrlExample,
            category: assigningTemplate.category,
            templateStatus: assigningTemplate.templateStatus,
            msg91TemplateId: assigningTemplate.msg91TemplateId,
            automationConfigured: true,
            isActive: false,
            parameterMapping,
          },
          outletId,
        ),
      );
      setAssigningTemplate(null);
      setSelectedExistingRuleId(undefined);
      await loadWhatsAppRules();
      messageApi.success("The approved template is now used by the selected rule.");
    } catch (error) {
      console.error("Failed to assign approved template to an existing rule", error);
      messageApi.error(error instanceof Error ? error.message : "Failed to update the rule.");
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = (ruleId: string) => {
    if (channel === "whatsapp") {
      messageApi.info("Delete API is not available yet.");
      return;
    }
    setRules((currentRules) =>
      currentRules.filter((rule) => rule.id !== ruleId),
    );
  };

  const reset = () => {
    setQuery("");
    setStatusFilter("all");
    if (channel === "whatsapp") {
      void loadWhatsAppRules();
      return;
    }
    setRules(getDemoRules(channel));
    messageApi.success(`${channelLabel} preview reset.`);
  };

  const openPreview = (rule: AutomationRule) => {
    setPreviewRule(rule);
    if (channel === "whatsapp") {
      const parameterValues = Object.fromEntries(
        Object.keys(rule.parameterMapping || {}).map((key) => [
          key,
          `Sample ${key}`,
        ]),
      );
      testForm.setFieldsValue({
        recipientNumber: "",
        ...parameterValues,
      });
    }
  };

  const sendWhatsAppTest = async () => {
    if (channel !== "whatsapp" || !previewRule || !outletId) return;
    try {
      const values = await testForm.validateFields();
      const parameters = Object.fromEntries(
        Object.keys(previewRule.parameterMapping || {}).map((key) => [
          key,
          values[key] || "",
        ]),
      );
      setTestSending(true);
      const response = await whatsappAutomationApi.testSend(outletId, {
        recipientNumber: values.recipientNumber,
        templateName: previewRule.templateName,
        languageCode: previewRule.languageCode || "en",
        parameters,
      });
      if (!response.success) {
        messageApi.error(response.error || "Test message failed.");
        return;
      }
      messageApi.success("Test WhatsApp message dispatched.");
      setPreviewRule(null);
    } catch (error) {
      console.error("Failed to send WhatsApp test message", error);
      messageApi.error("Complete the test message fields and try again.");
    } finally {
      setTestSending(false);
    }
  };

  const previewOnly = channel !== "whatsapp";

  return (
    <div className="min-h-full w-full bg-slate-50 font-sans">
      <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-2xl px-6 py-7 sm:px-8"
          style={{ backgroundColor: NAVY }}
        >
          <div
            className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full opacity-10"
            style={{ backgroundColor: RED }}
          />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-[22px] text-white">
                {icon}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white sm:text-2xl">
                  {title}
                </h1>
                <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-slate-300">
                  {description}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={reset}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-60"
              >
                <RotateCcw size={15} className={loading ? "animate-spin" : ""} />
                {channel === "whatsapp" ? "Refresh templates" : "Reset preview"}
              </button>
              <button
                type="button"
                onClick={channel === "whatsapp" ? openTemplateForm : () => openRuleForm()}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: RED }}
              >
                <Plus size={15} />
                {channel === "whatsapp" ? "New template" : "New rule"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Zap}
            label={channel === "whatsapp" ? "Templates" : "Total rules"}
            value={rules.length}
            tint="bg-slate-100 text-slate-600"
          />
          <StatCard
            icon={CheckCircle2}
            label="Active"
            value={activeCount}
            tint="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            icon={Clock3}
            label="Pending approval"
            value={pendingCount}
            tint="bg-amber-50 text-amber-600"
          />
          <StatCard
            icon={PauseCircle}
            label="Inactive"
            value={
              channel === "whatsapp"
                ? configuredRules.length - activeCount
                : rules.length - activeCount
            }
            tint="bg-slate-100 text-slate-500"
          />
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3.5">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <span className="text-[11px] font-bold">i</span>
          </div>
          <p className="text-[13px] leading-relaxed text-sky-900">
            {previewOnly
              ? `This is a preview workspace. Create, edit, enable and preview templates with sample data — nothing is saved to the server and no ${channelLabel} is sent from here.`
              : "Step 1: create a template for this outlet. Message91 approval may take up to 48 hours. Step 2: after approval, create a new automation rule or reuse an existing rule configuration."}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={channel === "whatsapp" ? "Search templates" : "Search rules"}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-[13px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-100"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 self-start rounded-lg border border-slate-200 bg-white p-1 sm:self-auto">
            {(
              [
                { key: "all", label: "All" },
                { key: "active", label: "Active" },
                { key: "inactive", label: "Inactive" },
              ] as const
            ).map((filter) => (
              <button
                type="button"
                key={filter.key}
                onClick={() => setStatusFilter(filter.key)}
                className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  statusFilter === filter.key
                    ? "text-white"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                style={
                  statusFilter === filter.key
                    ? { backgroundColor: NAVY }
                    : undefined
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white py-14 text-center text-[13px] text-slate-400">
              Loading rules…
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white py-14 text-center">
              <p className="text-[13px] text-slate-400">
                {rules.length
                  ? `No ${channel === "whatsapp" ? "templates" : "rules"} match your filters.`
                  : `No ${channel === "whatsapp" ? "templates" : "automation rules"} configured yet.`}
              </p>
            </div>
          ) : (
            filteredRules.map((rule) => {
              const trigger = TRIGGER_META[rule.triggerEvent];
              return (
                <article
                  key={rule.id}
                  className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  style={{
                    borderLeft: `4px solid ${rule.isActive ? "#0f9d68" : "#cbd5e1"}`,
                  }}
                >
                  <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {rule.automationConfigured ? (
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${trigger.tone}`}
                          >
                            {trigger.label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
                            Template only
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            rule.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {rule.isActive ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <PauseCircle size={12} />
                          )}
                          {rule.automationConfigured
                            ? rule.isActive
                              ? "Active"
                              : "Off"
                            : "No automation rule"}
                        </span>
                        {channel === "whatsapp" && rule.templateStatus && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              rule.templateStatus === "APPROVED"
                                ? "bg-emerald-50 text-emerald-700"
                                : rule.templateStatus === "REJECTED"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                            title={rule.rejectionReason || undefined}
                          >
                            {rule.templateStatus === "REJECTED" ? (
                              <TriangleAlert size={12} />
                            ) : rule.templateStatus === "APPROVED" ? (
                              <CheckCircle2 size={12} />
                            ) : (
                              <Clock3 size={12} />
                            )}
                            {rule.templateStatus === "PENDING"
                              ? "Pending approval (up to 48 hours)"
                              : rule.templateStatus === "REJECTED"
                                ? `Rejected${rule.rejectionReason && rule.rejectionReason !== "NONE" ? `: ${rule.rejectionReason}` : ""}`
                                : rule.templateStatus === "APPROVED"
                                  ? "Message91 approved"
                                  : "Status unavailable"}
                          </span>
                        )}
                      </div>

                      <h2 className="mt-2 text-[15px] font-semibold text-slate-900">
                        {rule.name}
                      </h2>
                      <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-slate-500">
                        {rule.automationConfigured
                          ? trigger.description
                          : rule.templateStatus === "APPROVED"
                            ? "This template is approved and ready to be connected to an automation rule."
                            : "Create an automation rule after Message91 approves this template."}
                      </p>

                      <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Template
                          </p>
                          <div className="mt-1 flex max-w-md flex-wrap items-center gap-2">
                            <code className="rounded-md bg-slate-50 px-2 py-1 text-[12.5px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">
                              {rule.templateName}
                            </code>
                            <span className="max-w-[260px] truncate text-[11px] text-slate-400">
                              {getTemplateMeta(channel, rule)}
                            </span>
                          </div>
                        </div>

                        {rule.automationConfigured && (
                          <>
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Recipient
                          </p>
                          <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-[12.5px] font-medium text-sky-700 ring-1 ring-inset ring-sky-100">
                            <User size={13} />
                            {rule.recipientType === "CUSTOM_NUMBER"
                              ? rule.customRecipientNumber || "Custom recipient"
                              : getRecipientLabel(channel, rule.recipientType)}
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                            Parameters
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {Object.entries(rule.parameterMapping || {}).length ? (
                              Object.entries(rule.parameterMapping).map(
                                ([key, value]) => (
                                  <span
                                    key={key}
                                    className="rounded-md bg-slate-50 px-2 py-0.5 text-[12px] text-slate-600 ring-1 ring-inset ring-slate-200"
                                  >
                                    <span className="text-slate-400">{key}:</span>{" "}
                                    {value}
                                  </span>
                                ),
                              )
                            ) : (
                              <span className="text-[12px] text-slate-400">
                                No parameters
                              </span>
                            )}
                          </div>
                        </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-end lg:gap-3">
                      {(channel !== "whatsapp" || rule.automationConfigured) && (
                        <button
                        type="button"
                        role="switch"
                        aria-checked={rule.isActive}
                        aria-label={`${rule.isActive ? "Disable" : "Enable"} ${rule.name}`}
                        onClick={() => void toggleRule(rule)}
                        disabled={
                          channel === "whatsapp" &&
                          !rule.isActive &&
                          rule.templateStatus !== "APPROVED"
                        }
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                          rule.isActive ? "bg-[#0a3750]" : "bg-slate-300"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            rule.isActive ? "translate-x-[22px]" : "translate-x-0.5"
                          }`}
                        />
                        </button>
                      )}

                      <div className="flex items-center gap-1.5">
                        {channel === "whatsapp" && rule.templateStatus === "UNKNOWN" && (
                          <button
                            type="button"
                            onClick={() => openRuleForm(rule, "template")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12.5px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
                          >
                            <RotateCcw size={13} />
                            Retry submission
                          </button>
                        )}
                        {(channel !== "whatsapp" || rule.templateStatus === "APPROVED") && (
                          <button
                            type="button"
                            onClick={() => openRuleForm(rule, "rule")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                          >
                            {rule.automationConfigured ? <Pencil size={13} /> : <Plus size={13} />}
                            {channel === "whatsapp"
                              ? rule.automationConfigured
                                ? "Edit rule"
                                : "Create rule"
                              : "Edit"}
                          </button>
                        )}
                        {channel === "whatsapp" &&
                          rule.templateStatus === "APPROVED" &&
                          !rule.automationConfigured &&
                          configuredRules.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setAssigningTemplate(rule);
                                setSelectedExistingRuleId(undefined);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[12.5px] font-medium text-sky-700 transition-colors hover:bg-sky-100"
                            >
                              <RotateCcw size={13} />
                              Use existing rule
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => openPreview(rule)}
                          disabled={
                            channel === "whatsapp" && rule.templateStatus !== "APPROVED"
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                          style={{ backgroundColor: NAVY }}
                        >
                          <Eye size={13} />
                          {channel === "whatsapp" ? "Test" : "Preview"}
                        </button>
                        {channel !== "whatsapp" && (
                          <button
                          type="button"
                          onClick={() => deleteRule(rule.id)}
                          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          title="Delete rule"
                        >
                          <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[13px] font-semibold text-slate-800">
              Available variable placeholders
            </h2>
            <span className="shrink-0 text-[11px] text-slate-400">Tap to copy</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PLACEHOLDERS.map((placeholder) => (
              <CopyChip key={placeholder} text={placeholder} />
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(editingRule)}
        title={
          channel === "whatsapp" && editorMode === "template"
            ? "Create WhatsApp template"
            : `${editingRule?.automationConfigured ? "Edit" : "Create"} ${channelLabel} automation rule`
        }
        onCancel={() => setEditingRule(null)}
        onOk={() => void saveRule()}
        confirmLoading={saving}
        width={720}
        okText={channel === "whatsapp" && editorMode === "template" ? "Submit template" : "Save rule"}
        okButtonProps={{ style: { backgroundColor: NAVY, borderColor: NAVY } }}
        forceRender
        destroyOnHidden
      >
        <Form form={ruleForm} layout="vertical" className="mt-4">
          {channel === "whatsapp" && editorMode === "rule" && (
            <Alert
              type="success"
              showIcon
              className="mb-4"
              message={`Approved template: ${editingRule?.templateName || ""}`}
              description="Configure when this template is sent, who receives it, and how CRM values map to its variables."
            />
          )}
          {(channel !== "whatsapp" || editorMode === "rule") && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="name"
              label="Rule name"
              rules={[{ required: true, message: "Please enter a rule name" }]}
            >
              <Input placeholder={`e.g. New Lead Welcome ${channelLabel}`} />
            </Form.Item>
            <Form.Item
              name="triggerEvent"
              label="Automation trigger"
              rules={[{ required: true }]}
            >
              <Select
                options={Object.entries(TRIGGER_META).map(([value, meta]) => ({
                  label: meta.label,
                  value,
                }))}
              />
            </Form.Item>
            </div>
          )}

          {channel === "whatsapp" && editorMode === "template" && (
            <>
              <Form.Item
                name="headerText"
                label="Header text (optional)"
                extra="Message91 allows up to 60 characters for a text header."
              >
                <Input maxLength={60} showCount placeholder="We're Ready to Assist You!" />
              </Form.Item>
              <Form.Item
                name="messageBody"
                label="WhatsApp template body"
                extra="Use sequential variables such as {{1}}, {{2}}. CRM field mappings are configured only after Message91 approves the template."
                rules={[
                  { required: true, message: "Please enter message content" },
                  {
                    validator: (_, value: string) => {
                      const numbers = [
                        ...new Set(
                          [...String(value || "").matchAll(/\{\{(\d+)\}\}/g)].map(
                            (match) => Number(match[1]),
                          ),
                        ),
                      ].sort((first, second) => first - second);
                      if (!numbers.every((number, index) => number === index + 1)) {
                        return Promise.reject(
                            new Error("Variables must start at {{1}} and remain sequential."),
                        );
                      }
                      const staticWordCount = String(value || "")
                        .replace(/\{\{\d+\}\}/g, " ")
                        .trim()
                        .split(/\s+/)
                        .filter(Boolean).length;
                      return numbers.length > 0 && staticWordCount < numbers.length * 4
                        ? Promise.reject(
                            new Error(
                              `Message91 requires more fixed text for ${numbers.length} variables. Add more wording or reduce the variables.`,
                            ),
                          )
                        : Promise.resolve();
                    },
                  },
                ]}
              >
                <Input.TextArea
                  rows={5}
                  maxLength={4096}
                  showCount
                  placeholder="Hello {{1}}, welcome to {{2}}. We have received your enquiry about {{3}}, and our team will contact you shortly. Thank you!"
                />
              </Form.Item>
              <Form.Item name="footerText" label="Footer text (optional)">
                <Input maxLength={60} showCount placeholder="Sensible Connect Solutions Pvt Ltd" />
              </Form.Item>
            </>
          )}

          {(channel !== "whatsapp" || editorMode === "template") && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="templateName"
              label={`${channelLabel} template name`}
              rules={[
                { required: true, message: "Please enter a template name" },
                ...(channel === "whatsapp"
                  ? [{ pattern: /^[a-z0-9_]+$/, message: "Use lowercase letters, numbers, and underscores only" }]
                  : []),
              ]}
            >
              <Input placeholder={`${channel}_template_name`} />
            </Form.Item>
            {channel === "whatsapp" ? (
              <div className="grid grid-cols-2 gap-3">
                <Form.Item
                  name="languageCode"
                  label="Language"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { label: "English (en)", value: "en" },
                      { label: "Hindi (hi)", value: "hi" },
                      { label: "Marathi (mr)", value: "mr" },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { label: "Utility", value: "UTILITY" },
                      { label: "Marketing", value: "MARKETING" },
                      { label: "Authentication", value: "AUTHENTICATION" },
                    ]}
                  />
                </Form.Item>
              </div>
            ) : channel === "email" ? (
              <Form.Item
                name="senderName"
                label="Sender name"
                rules={[{ required: true, message: "Please enter a sender name" }]}
              >
                <Input placeholder="e.g. Sensible Sales Team" />
              </Form.Item>
            ) : (
              <Form.Item
                name="senderId"
                label="Sender ID"
                extra="Usually a 6-character approved sender ID"
                rules={[{ required: true, message: "Please enter a sender ID" }]}
              >
                <Input maxLength={6} placeholder="SENSBL" />
              </Form.Item>
            )}
            </div>
          )}

          {channel === "whatsapp" && editorMode === "template" && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Form.Item name="buttonText" label="URL button label (optional)">
                <Input maxLength={25} placeholder="Visit Our Website" />
              </Form.Item>
              <Form.Item
                name="buttonUrl"
                label="Button URL"
                rules={[{ type: "url", message: "Enter a valid URL" }]}
              >
                <Input placeholder="https://m.9m.io/{{1}}" />
              </Form.Item>
              <Form.Item
                name="buttonUrlExample"
                label="Example URL"
                rules={[{ type: "url", message: "Enter a valid example URL" }]}
              >
                <Input placeholder="https://sensible.biz/home" />
              </Form.Item>
            </div>
          )}

          {channel === "email" && (
            <>
              <Form.Item
                name="subject"
                label="Subject line"
                rules={[{ required: true, message: "Please enter a subject" }]}
              >
                <Input placeholder="Thanks for contacting {{businessName}}" />
              </Form.Item>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Form.Item name="previewText" label="Preview text">
                  <Input placeholder="Short inbox preview text" />
                </Form.Item>
                <Form.Item
                  name="replyTo"
                  label="Reply-to email"
                  rules={[{ type: "email", message: "Enter a valid email" }]}
                >
                  <Input placeholder="sales@example.com" />
                </Form.Item>
              </div>
            </>
          )}

          {(channel !== "whatsapp" || editorMode === "rule") && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="recipientType"
              label="Send to"
              rules={[{ required: true }]}
            >
              <Select
                options={(
                  ["CUSTOMER", "ASSIGNED_USER", "CUSTOM_NUMBER"] as const
                ).map((value) => ({
                  label: getRecipientLabel(channel, value),
                  value,
                }))}
              />
            </Form.Item>
            <Form.Item
              noStyle
              shouldUpdate={(previous, current) =>
                previous.recipientType !== current.recipientType
              }
            >
              {({ getFieldValue }) =>
                getFieldValue("recipientType") === "CUSTOM_NUMBER" ? (
                  <Form.Item
                    name="customRecipientNumber"
                    label={
                      channel === "email"
                        ? "Custom email address"
                        : "Custom phone number"
                    }
                    rules={
                      channel === "email"
                        ? [
                            { required: true, message: "Please enter an email" },
                            { type: "email", message: "Enter a valid email" },
                          ]
                        : [
                            {
                              required: true,
                              message: "Please enter a phone number",
                            },
                          ]
                    }
                  >
                    <Input
                      placeholder={
                        channel === "email"
                          ? "customer@example.com"
                          : "919876543210"
                      }
                    />
                  </Form.Item>
                ) : null
              }
            </Form.Item>
            </div>
          )}

          {channel !== "whatsapp" && (
            <Form.Item
              name="messageBody"
              label={channel === "email" ? "Email body" : "SMS message"}
              extra={
                channel === "sms"
                  ? "The counter helps plan SMS length before provider integration."
                  : "Plain-text editor for now; a rich email builder can be connected later."
              }
              rules={[{ required: true, message: "Please enter message content" }]}
            >
              <Input.TextArea
                rows={channel === "email" ? 8 : 5}
                maxLength={channel === "sms" ? 480 : undefined}
                showCount={channel === "sms"}
                placeholder={`Write the ${channelLabel} content and add variables such as {{customerName}}`}
              />
            </Form.Item>
          )}

          {(channel !== "whatsapp" || editorMode === "rule") && (
            <>
              <Divider orientation="left" className="!text-xs !text-gray-500">
                Template parameter mapping
              </Divider>
              <Form.List name="parameters">
            {(fields, { add, remove }) => (
              <div className="space-y-2">
                {!fields.length && (
                  <Text type="secondary" className="text-xs">
                    No parameters mapped yet.
                  </Text>
                )}
                {fields.map(({ key, name, ...restField }) => (
                  <div
                    key={key}
                    className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2"
                  >
                    <Form.Item
                      {...restField}
                      name={[name, "key"]}
                      className="!mb-0 w-1/3"
                      rules={[{ required: true, message: "Key required" }]}
                    >
                      <Input disabled={channel === "whatsapp"} placeholder="e.g. body_1" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, "value"]}
                      className="!mb-0 flex-1"
                      rules={[{ required: true, message: "Value required" }]}
                    >
                      {channel === "whatsapp" ? (
                        <Select
                          showSearch
                          placeholder="Select a CRM value"
                          options={PLACEHOLDERS.map((value) => ({ value, label: value }))}
                        />
                      ) : (
                        <Input placeholder="e.g. {{customerName}}" />
                      )}
                    </Form.Item>
                    {channel !== "whatsapp" && (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(name)}
                      />
                    )}
                  </div>
                ))}
                {channel !== "whatsapp" && (
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      add({ key: `parameter_${fields.length + 1}`, value: "" })
                    }
                    block
                    className="mt-2 rounded-lg"
                  >
                    Add parameter
                  </Button>
                )}
              </div>
            )}
              </Form.List>
            </>
          )}
        </Form>
      </Modal>

      <Modal
        open={Boolean(assigningTemplate)}
        title="Use an existing automation rule"
        onCancel={() => {
          setAssigningTemplate(null);
          setSelectedExistingRuleId(undefined);
        }}
        onOk={() => void assignExistingRule()}
        confirmLoading={saving}
        okText="Use selected rule"
        okButtonProps={{
          disabled: !selectedExistingRuleId,
          style: { backgroundColor: NAVY, borderColor: NAVY },
        }}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          className="mb-4 mt-3"
          message={`Template: ${assigningTemplate?.templateName || ""}`}
          description="This copies the selected rule's trigger, recipient, and CRM mappings to the approved template. The new rule starts inactive so you can review it before enabling."
        />
        <Select
          value={selectedExistingRuleId}
          onChange={setSelectedExistingRuleId}
          className="w-full"
          placeholder="Select an existing rule"
          options={configuredRules
            .filter((rule) => rule.id !== assigningTemplate?.id)
            .map((rule) => ({
              value: rule.id,
              label: `${rule.name} — ${TRIGGER_META[rule.triggerEvent].label} (${rule.templateName})`,
            }))}
        />
      </Modal>

      <Modal
        open={Boolean(previewRule)}
        title={`${channel === "whatsapp" ? "Test" : "Preview"} ${channelLabel}: ${previewRule?.templateName || ""}`}
        onCancel={() => setPreviewRule(null)}
        onOk={
          channel === "whatsapp"
            ? () => void sendWhatsAppTest()
            : () => setPreviewRule(null)
        }
        confirmLoading={testSending}
        okText={channel === "whatsapp" ? "Send test message" : "Done"}
        cancelButtonProps={previewOnly ? { style: { display: "none" } } : undefined}
        okButtonProps={{ style: { backgroundColor: NAVY, borderColor: NAVY } }}
        forceRender
        destroyOnHidden
      >
        {channel === "whatsapp" ? (
          <Form form={testForm} layout="vertical" className="mt-4">
            <Form.Item
              name="recipientNumber"
              label="Recipient phone number"
              extra="Include country code without '+'"
              rules={[{ required: true, message: "Enter a recipient number" }]}
            >
              <Input placeholder="919876543210" />
            </Form.Item>
            <Divider orientation="left" className="!text-xs !text-gray-500">
              Test parameter values
            </Divider>
            {!Object.keys(previewRule?.parameterMapping || {}).length && (
              <Badge status="default" text="This template has no parameters." />
            )}
            {Object.keys(previewRule?.parameterMapping || {}).map((key) => (
              <Form.Item
                key={key}
                name={key}
                label={`Value for ${key}`}
                rules={[{ required: true }]}
              >
                <Input placeholder={`Sample value for ${key}`} />
              </Form.Item>
            ))}
          </Form>
        ) : (
          <div className="pt-3">
            <Alert
              type="warning"
              showIcon
              message="Preview only — no message will be sent"
              className="mb-4 rounded-lg"
            />
            {channel === "email" ? (
              <Card size="small" className="overflow-hidden rounded-xl">
                <div className="mb-3 space-y-1 border-b border-gray-100 pb-3 text-sm">
                  <div>
                    <Text type="secondary">From: </Text>
                    <Text strong>
                      {previewRule?.senderName || "Your Sales Team"}
                    </Text>
                  </div>
                  <div>
                    <Text type="secondary">To: </Text>
                    <Text>priya@example.com</Text>
                  </div>
                  <div>
                    <Text type="secondary">Subject: </Text>
                    <Text strong>{renderSampleText(previewRule?.subject)}</Text>
                  </div>
                </div>
                {previewRule?.previewText && (
                  <Text type="secondary" className="mb-3 block text-xs">
                    {renderSampleText(previewRule.previewText)}
                  </Text>
                )}
                <Paragraph className="!mb-0 whitespace-pre-wrap">
                  {renderSampleText(previewRule?.messageBody)}
                </Paragraph>
              </Card>
            ) : (
              <div className="rounded-2xl bg-gray-100 p-4">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-white p-4 shadow-sm">
                  <Paragraph className="!mb-2 whitespace-pre-wrap text-sm">
                    {renderSampleText(previewRule?.messageBody)}
                  </Paragraph>
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      status="processing"
                      text={previewRule?.senderId || "Sender"}
                    />
                    <Text type="secondary" className="text-[10px]">
                      {renderSampleText(previewRule?.messageBody).length} characters
                    </Text>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default UnifiedAutomationPage;
