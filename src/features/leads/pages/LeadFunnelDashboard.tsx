import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dropdown, Empty, message, Modal, Select, Spin, type MenuProps } from "antd";
import dayjs from "dayjs";
import "./LeadFunnelDashboard.css";
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  Footprints,
  Globe2,
  Handshake,
  Mail,
  Megaphone,
  MessageCircle,
  Download,
  Phone,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  XCircle,
} from "lucide-react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { LeadsManagement, QuotationRecord } from "../types/types";
import { TeamTreeDTO } from "@/features/team";
import { WhatsAppMessageLog } from "@/features/whatsapp";
import { RootState } from "@/app/store";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { whatsappChatApi } from "@/features/whatsapp/api/whatsappChatApi";
import { leadApi } from "../api/leadApi";
import { formatEmployeeName, formatLeadSourceLabel, toTitleCase } from "@/shared/utils/helperFunctions";
import { LogoIcon } from "@/shared/components";
import { useThemeMode } from "@/shared/hooks";
import { exportToExcel, type TableColumn } from "@/shared/utils/fileExport";

interface FunnelStage {
  key: FunnelStageKey;
  label: string;
  value: number;
  percent: number;
  description: string;
  icon: React.ReactNode;
  light: string;
  mid: string;
  dark: string;
  textColor: string;
  cardBorder: string;
  cardBg: string;
  iconBg: string;
}

type FunnelStageKey =
  | "total"
  | "new"
  | "assigned"
  | "followup"
  | "closed"
  | "lost"
  | "disqualified";

interface EmployeeOption {
  label: string;
  value: string;
}

const PERIOD_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "last week", label: "Last Week" },
  { key: "month", label: "This Month" },
  { key: "last month", label: "Last Month" },
  { key: "year", label: "This Year" },
] as const;

type PeriodKey = (typeof PERIOD_OPTIONS)[number]["key"];

interface LeadFunnelCardProps {
  title: string;
  subtitle: string;
  periodDescription: string;
  selectedPeriod?: PeriodKey;
  onSelectPeriod?: (period: PeriodKey) => void;
  selectedEmployeeId: string;
  selectedEmployeeName: string;
  employeeOptions: EmployeeOption[];
  onEmployeeChange: (value: string) => void;
  totalLeads: number;
  newLeads: number;
  assigned: number;
  followUp: number;
  closedWon: number;
  lost: number;
  disqualified: number;
  periodMenuItems: MenuProps["items"];
  onPeriodChange: MenuProps["onClick"];
  onStageClick: (stage: FunnelStageKey) => void;
  loading?: boolean;
  focusAreaText?: string;
  onQuotationClick?: () => void;
  onDownloadExcel?: () => void;
  quotationLoading?: boolean;
  downloadLoading?: boolean;
}

interface LeadFunnelCounts {
  totalLeads: number;
  newLeads: number;
  assigned: number;
  followUp: number;
  closedWon: number;
  lost: number;
  disqualified: number;
}

interface SourceDefinition {
  key: string;
  label: string;
  matchers: string[];
  accent: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

interface LeadSourceStat extends SourceDefinition {
  total: number;
  active: number;
  won: number;
  lost: number;
  disqualified: number;
  percent: number;
}

const ALL_EMPLOYEES_KEY = "__all_sales_employees";
const NAVY = "#0a3750";
const SOURCE_DIALOG_LEADS_LIMIT = 100;
const YEARLY_EXPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const YEARLY_EXPORT_STORAGE_PREFIX = "lead-funnel-yearly-export";
const yearlyExportTimestamps = new Map<string, number>();
const MONTHLY_EXPORT_LIMIT = 2;
const MONTHLY_EXPORT_STORAGE_PREFIX = "lead-funnel-monthly-exports";
const monthlyExportTimestamps = new Map<string, number[]>();

function getYearlyExportTimestamp(storageKey: string) {
  try {
    const storedValue = window.localStorage.getItem(storageKey);
    const timestamp = storedValue ? Number(storedValue) : NaN;

    if (Number.isFinite(timestamp) && timestamp > 0) {
      yearlyExportTimestamps.set(storageKey, timestamp);
      return timestamp;
    }
  } catch {
    // Fall back to the in-memory timestamp when browser storage is unavailable.
  }

  return yearlyExportTimestamps.get(storageKey) ?? null;
}

function setYearlyExportTimestamp(storageKey: string, timestamp: number) {
  yearlyExportTimestamps.set(storageKey, timestamp);

  try {
    window.localStorage.setItem(storageKey, String(timestamp));
  } catch {
    // The in-memory timestamp still prevents repeated downloads in this session.
  }
}

function getMonthlyExportTimestamps(storageKey: string) {
  try {
    const storedValue = window.localStorage.getItem(storageKey);
    const parsedValue: unknown = storedValue ? JSON.parse(storedValue) : [];

    if (Array.isArray(parsedValue)) {
      const timestamps = parsedValue.filter(
        (value): value is number => Number.isFinite(value) && value > 0
      ).sort((a, b) => a - b);
      monthlyExportTimestamps.set(storageKey, timestamps);
      return timestamps;
    }
  } catch {
    // Fall back to the in-memory timestamps when browser storage is unavailable.
  }

  return monthlyExportTimestamps.get(storageKey) ?? [];
}

function setMonthlyExportTimestamps(storageKey: string, timestamps: number[]) {
  monthlyExportTimestamps.set(storageKey, timestamps);

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(timestamps));
  } catch {
    // The in-memory timestamps still enforce the limit in this session.
  }
}

function formatCooldownRemaining(remainingMs: number) {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / (60 * 1000)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  if (minutes === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;

  return `${hours} hour${hours === 1 ? "" : "s"} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    key: "indiamart",
    label: "IndiaMART",
    matchers: ["indiamart", "indiamartlead"],
    accent: "#f87171",
    bg: "#fff1f2",
    border: "#fecdd3",
    icon: <LogoIcon src="/icons/indiamart.svg" alt="IndiaMART" size={24} />,
  },
  {
    key: "justdial",
    label: "Justdial",
    matchers: ["justdial", "justdail", "jd"],
    accent: "#2563eb",
    bg: "#eff6ff",
    border: "#bfdbfe",
    icon: <LogoIcon src="/icons/justdial.svg" alt="Justdial" size={24} />,
  },
  {
    key: "facebook",
    label: "Facebook",
    matchers: ["facebook", "fb", "meta"],
    accent: "#1877f2",
    bg: "#eff6ff",
    border: "#bfdbfe",
    icon: <Megaphone size={22} />,
  },
  {
    key: "instagram",
    label: "Instagram",
    matchers: ["instagram", "insta"],
    accent: "#db2777",
    bg: "#fdf2f8",
    border: "#fbcfe8",
    icon: <Megaphone size={22} />,
  },
  {
    key: "google",
    label: "Google Ads",
    matchers: ["googleads", "google"],
    accent: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
    icon: <Globe2 size={22} />,
  },
  {
    key: "website",
    label: "Website",
    matchers: ["website", "web"],
    accent: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    icon: <Globe2 size={22} />,
  },
  {
    key: "reference",
    label: "Reference",
    matchers: ["reference", "referral", "refer"],
    accent: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: <Handshake size={22} />,
  },
  {
    key: "self-generated",
    label: "Self Generated",
    matchers: ["selfgenerated", "selfgenrated"],
    accent: "#0891b2",
    bg: "#ecfeff",
    border: "#a5f3fc",
    icon: <User size={22} />,
  },
  {
    key: "cold-call",
    label: "Cold Call",
    matchers: ["coldcall", "calling"],
    accent: "#ea580c",
    bg: "#fff7ed",
    border: "#fed7aa",
    icon: <Phone size={22} />,
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    matchers: ["linkedin"],
    accent: "#0a66c2",
    bg: "#eff6ff",
    border: "#bfdbfe",
    icon: <Megaphone size={22} />,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    matchers: ["whatsapp"],
    accent: "#22c55e",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: <MessageCircle size={22} />,
  },
  {
    key: "email",
    label: "Email",
    matchers: ["email", "mail"],
    accent: "#475569",
    bg: "#f8fafc",
    border: "#cbd5e1",
    icon: <Mail size={22} />,
  },
  {
    key: "walk-in",
    label: "Walk In",
    matchers: ["walkin", "walk"],
    accent: "#ca8a04",
    bg: "#fefce8",
    border: "#fef08a",
    icon: <Footprints size={22} />,
  },
  {
    key: "other",
    label: "Other",
    matchers: ["other", "na", "n/a"],
    accent: "#64748b",
    bg: "#f8fafc",
    border: "#cbd5e1",
    icon: <Users size={22} />,
  },
];

type StageVisualSet = {
  light: string;
  mid: string;
  dark: string;
  textColor: string;
  cardBorder: string;
  cardBg: string;
  iconBg: string;
};

const STAGE_VISUALS = {
  muted: {
    light: "#cbd5e1",
    mid: "#94a3b8",
    dark: "#64748b",
    textColor: "#64748b",
    cardBorder: "#cbd5e1",
    cardBg: "#f8fafc",
    iconBg: "#94a3b8",
  },
  volume: {
    light: "#ff6662",
    mid: "#ef1f1d",
    dark: "#bd1515",
    textColor: "#ef1f1d",
    cardBorder: "#ef1f1d",
    cardBg: "#fff1f2",
    iconBg: "#ef1f1d",
  },
  lowVolume: {
    light: "#38bdf8",
    mid: "#0284c7",
    dark: "#075985",
    textColor: "#0284c7",
    cardBorder: "#38bdf8",
    cardBg: "#f0f9ff",
    iconBg: "#0284c7",
  },
  caution: {
    light: "#fde047",
    mid: "#facc15",
    dark: "#ca8a04",
    textColor: "#ca8a04",
    cardBorder: "#facc15",
    cardBg: "#fefce8",
    iconBg: "#eab308",
  },
  warning: {
    light: "#fb923c",
    mid: "#f97316",
    dark: "#c2410c",
    textColor: "#ea580c",
    cardBorder: "#fb923c",
    cardBg: "#fff7ed",
    iconBg: "#f97316",
  },
  danger: {
    light: "#ff6b66",
    mid: "#ef1f1d",
    dark: "#b91c1c",
    textColor: "#dc2626",
    cardBorder: "#ef4444",
    cardBg: "#fef2f2",
    iconBg: "#dc2626",
  },
  active: {
    light: "#25aaff",
    mid: "#0788df",
    dark: "#0069bd",
    textColor: "#0788df",
    cardBorder: "#25aaff",
    cardBg: "#eff6ff",
    iconBg: "#0788df",
  },
  healthy: {
    light: "#4ade80",
    mid: "#22c55e",
    dark: "#15803d",
    textColor: "#16a34a",
    cardBorder: "#22c55e",
    cardBg: "#f0fdf4",
    iconBg: "#16a34a",
  },
  strongHealthy: {
    light: "#86efac",
    mid: "#16a34a",
    dark: "#166534",
    textColor: "#15803d",
    cardBorder: "#16a34a",
    cardBg: "#ecfdf5",
    iconBg: "#15803d",
  },
  lowRisk: {
    light: "#94a3b8",
    mid: "#64748b",
    dark: "#475569",
    textColor: "#64748b",
    cardBorder: "#94a3b8",
    cardBg: "#f8fafc",
    iconBg: "#64748b",
  },
} as const satisfies Record<string, StageVisualSet>;

const STAGE_VISUALS_DARK: Record<keyof typeof STAGE_VISUALS, StageVisualSet> = {
  muted: {
    light: "#4b5563",
    mid: "#334155",
    dark: "#1e293b",
    textColor: "#e2e8f0",
    cardBorder: "#475569",
    cardBg: "#1e293b",
    iconBg: "#64748b",
  },
  volume: {
    ...STAGE_VISUALS.volume,
    textColor: "#fb7185",
    cardBorder: "#ef4444",
    cardBg: "#3f1214",
  },
  lowVolume: {
    ...STAGE_VISUALS.lowVolume,
    textColor: "#7dd3fc",
    cardBorder: "#0284c7",
    cardBg: "#0c2a3d",
  },
  caution: {
    ...STAGE_VISUALS.caution,
    textColor: "#fde047",
    cardBorder: "#ca8a04",
    cardBg: "#3f2e05",
  },
  warning: {
    ...STAGE_VISUALS.warning,
    textColor: "#fdba74",
    cardBorder: "#ea580c",
    cardBg: "#3d1c07",
  },
  danger: {
    ...STAGE_VISUALS.danger,
    textColor: "#f87171",
    cardBorder: "#ef4444",
    cardBg: "#3f1214",
  },
  active: {
    ...STAGE_VISUALS.active,
    textColor: "#7dd3fc",
    cardBorder: "#0788df",
    cardBg: "#0c2744",
  },
  healthy: {
    ...STAGE_VISUALS.healthy,
    textColor: "#4ade80",
    cardBorder: "#22c55e",
    cardBg: "#052e16",
  },
  strongHealthy: {
    ...STAGE_VISUALS.strongHealthy,
    textColor: "#86efac",
    cardBorder: "#16a34a",
    cardBg: "#052e16",
  },
  lowRisk: {
    light: "#64748b",
    mid: "#475569",
    dark: "#334155",
    textColor: "#cbd5e1",
    cardBorder: "#475569",
    cardBg: "#1e293b",
    iconBg: "#64748b",
  },
};

function buildEmptySourceStats() {
  return SOURCE_DEFINITIONS.map((source) => ({
    ...source,
    total: 0,
    active: 0,
    won: 0,
    lost: 0,
    disqualified: 0,
    percent: 0,
  }));
}

function mergeSourceStats(
  apiSources: Array<{
    key: string;
    total: number;
    active: number;
    won: number;
    lost: number;
    disqualified: number;
    percent: number;
  }>,
): LeadSourceStat[] {
  const byKey = new Map(apiSources.map((source) => [source.key, source]));

  return SOURCE_DEFINITIONS.map((source) => {
    const counts = byKey.get(source.key);
    return {
      ...source,
      total: counts?.total ?? 0,
      active: counts?.active ?? 0,
      won: counts?.won ?? 0,
      lost: counts?.lost ?? 0,
      disqualified: counts?.disqualified ?? 0,
      percent: counts?.percent ?? 0,
    };
  });
}

function isPeriodKey(key: React.Key): key is PeriodKey {
  return PERIOD_OPTIONS.some((option) => option.key === key);
}

function getPeriodRange(period: PeriodKey) {
  const now = dayjs();

  switch (period) {
    case "today":
    default:
      return {
        startDate: now.startOf("day").valueOf(),
        endDate: now.endOf("day").valueOf(),
        label: "Today",
        description: now.format("DD MMMM YYYY"),
      };

    case "yesterday":
      return {
        startDate: now.subtract(1, "day").startOf("day").valueOf(),
        endDate: now.subtract(1, "day").endOf("day").valueOf(),
        label: "Yesterday",
        description: now.subtract(1, "day").format("DD MMMM YYYY"),
      };

    case "last week":
      return {
        startDate: now.subtract(1, "week").startOf("week").valueOf(),
        endDate: now.subtract(1, "week").endOf("week").valueOf(),
        label: "Last Week",
        description: `${now.subtract(1, "week").startOf("week").format("DD MMM")} - ${now
          .subtract(1, "week")
          .endOf("week")
          .format("DD MMM YYYY")}`,
      };
    case "week":
      return {
        startDate: now.startOf("week").valueOf(),
        endDate: now.endOf("week").valueOf(),
        label: "This Week",
        description: `${now.startOf("week").format("DD MMM")} - ${now
          .endOf("week")
          .format("DD MMM YYYY")}`,
      };
    case "year":
      return {
        startDate: now.startOf("year").valueOf(),
        endDate: now.endOf("year").valueOf(),
        label: "This Year",
        description: now.format("YYYY"),
      };
    case "month":
      return {
        startDate: now.startOf("month").valueOf(),
        endDate: now.endOf("month").valueOf(),
        label: "This Month",
        description: now.format("MMMM YYYY"),
      };

    case "last month":
      return {
        startDate: now.subtract(1, "month").startOf("month").valueOf(),
        endDate: now.subtract(1, "month").endOf("month").valueOf(),
        label: "Last Month",
        description: now.subtract(1, "month").format("MMMM YYYY"),
      };
  }
}

function formatLeadCount(count: number) {
  return count + " " + (count === 1 ? "lead" : "leads");
}

function getDynamicFocusAreaText(
  counts: LeadFunnelCounts,
  selectedEmployeeName: string
) {
  const {
    totalLeads,
    newLeads,
    assigned,
    followUp,
    closedWon,
    lost,
    disqualified,
  } = counts;
  const employeeText =
    selectedEmployeeName === "All Sales Employees"
      ? "the sales team"
      : selectedEmployeeName;
  const closingRatio =
    totalLeads > 0 ? Math.round((closedWon / totalLeads) * 100) : 0;
  const lostRatio = totalLeads > 0 ? Math.round((lost / totalLeads) * 100) : 0;
  const disqualifiedRatio =
    totalLeads > 0 ? Math.round((disqualified / totalLeads) * 100) : 0;

  if (totalLeads === 0) {
    return `No leads found for ${employeeText} in this period. Add or assign new leads to start the funnel.`;
  }

  if (followUp > 0) {
    return `${formatLeadCount(
      followUp
    )} in follow-up need closure attention. Prioritize calls and next steps to improve the ${closingRatio}% conversion rate.`;
  }

  if (assigned > 0) {
    return `${formatLeadCount(
      assigned
    )} have an assigned owner. Review newly assigned leads and move untouched opportunities into follow-up.`;
  }

  if (newLeads > 0) {
    return `${formatLeadCount(
      newLeads
    )} are still new. Assign owners and start the first contact.`;
  }

  if (disqualified > 0 && disqualifiedRatio >= 30) {
    return `${formatLeadCount(
      disqualified
    )} are disqualified (${disqualifiedRatio}%). Review disqualification reasons and lead quality.`;
  }

  if (lost > closedWon && lostRatio >= 30) {
    return `${formatLeadCount(
      lost
    )} are lost (${lostRatio}%). Review loss reasons and recover qualified opportunities.`;
  }

  if (closedWon > 0) {
    return `${formatLeadCount(
      closedWon
    )} closed from ${formatLeadCount(
      totalLeads
    )}. Keep adding qualified leads to maintain the ${closingRatio}% closing ratio.`;
  }

  return `Pipeline has ${formatLeadCount(
    totalLeads
  )}. Review lead quality and move active opportunities toward follow-up.`;
}

function getStageVisual(
  stageKey: FunnelStageKey,
  value: number,
  percent: number,
  counts: LeadFunnelCounts,
  isDark = false
) {
  const visuals = isDark ? STAGE_VISUALS_DARK : STAGE_VISUALS;

  if (counts.totalLeads === 0 || value === 0) {
    return visuals.muted;
  }

  switch (stageKey) {
    case "total":
      return counts.totalLeads < 5 ? visuals.lowVolume : visuals.volume;
    case "new":
      if (percent >= 50) return visuals.warning;
      return visuals.caution;
    case "assigned":
      if (percent >= 40) return visuals.danger;
      if (percent >= 20) return visuals.warning;
      return visuals.caution;
    case "followup":
      if (counts.closedWon === 0 && percent >= 35) return visuals.warning;
      return visuals.active;
    case "closed":
      if (percent >= 35) return visuals.strongHealthy;
      return visuals.healthy;
    case "lost":
      if (percent >= 30) return visuals.danger;
      if (percent >= 15) return visuals.warning;
      return visuals.lowRisk;
    case "disqualified":
      if (percent >= 30) return visuals.danger;
      if (percent >= 15) return visuals.warning;
      return visuals.caution;
    default:
      return visuals.muted;
  }
}

function LeadFunnelCard({
  title,
  subtitle,
  periodDescription,
  selectedPeriod,
  onSelectPeriod,
  onQuotationClick,
  onDownloadExcel,
  quotationLoading,
  downloadLoading,
  selectedEmployeeId,
  selectedEmployeeName,
  employeeOptions,
  onEmployeeChange,
  totalLeads,
  newLeads,
  assigned,
  followUp,
  closedWon,
  lost,
  disqualified,
  periodMenuItems,
  onPeriodChange,
  onStageClick,
  loading,
  focusAreaText = "Convert follow-up leads into closures to improve the conversion rate.",
}: LeadFunnelCardProps) {
  const { isDark } = useThemeMode();
  const pct = (n: number) => (totalLeads > 0 ? (n / totalLeads) * 100 : 0);
  const stageCounts: LeadFunnelCounts = {
    totalLeads,
    newLeads,
    assigned,
    followUp,
    closedWon,
    lost,
    disqualified,
  };

  const stages: FunnelStage[] = [
    {
      key: "total",
      label: "Total Leads",
      value: totalLeads,
      percent: pct(totalLeads),
      description: "All leads received",
      icon: <Users className="h-full w-full" />,
      ...getStageVisual("total", totalLeads, pct(totalLeads), stageCounts, isDark),
    },
    {
      key: "new",
      label: "New Leads",
      value: newLeads,
      percent: pct(newLeads),
      description: "Leads awaiting first assignment",
      icon: <Sparkles className="h-full w-full" />,
      ...getStageVisual("new", newLeads, pct(newLeads), stageCounts, isDark),
    },
    {
      key: "assigned",
      label: "Assigned",
      value: assigned,
      percent: pct(assigned),
      description: "Leads in the assigned stage",
      icon: <User className="h-full w-full" />,
      ...getStageVisual("assigned", assigned, pct(assigned), stageCounts, isDark),
    },
    {
      key: "followup",
      label: "Follow Up",
      value: followUp,
      percent: pct(followUp),
      description: "Leads in follow-up stage",
      icon: <Phone className="h-full w-full" />,
      ...getStageVisual("followup", followUp, pct(followUp), stageCounts, isDark),
    },
    {
      key: "closed",
      label: "Closed (Won)",
      value: closedWon,
      percent: pct(closedWon),
      description: "Successfully converted leads",
      icon: <CheckCircle2 className="h-full w-full" />,
      ...getStageVisual("closed", closedWon, pct(closedWon), stageCounts, isDark),
    },
    {
      key: "lost",
      label: "Lost",
      value: lost,
      percent: pct(lost),
      description: "Lost / Unsuccessful leads",
      icon: <XCircle className="h-full w-full" />,
      ...getStageVisual("lost", lost, pct(lost), stageCounts, isDark),
    },
    {
      key: "disqualified",
      label: "Disqualified",
      value: disqualified,
      percent: pct(disqualified),
      description: "Leads that did not qualify",
      icon: <Ban className="h-full w-full" />,
      ...getStageVisual(
        "disqualified",
        disqualified,
        pct(disqualified),
        stageCounts,
        isDark
      ),
    },
  ];

  const closingRatio =
    totalLeads > 0 ? ((closedWon / totalLeads) * 100).toFixed(2) : "0.00";
  const stageAccents: Record<FunnelStageKey, string> = {
    total: "#2563eb", new: "#6366f1", assigned: "#3b82f6",
    followup: "#0891b2", closed: "#059669", lost: "#e05263", disqualified: "#94a3b8",
  };
  const summaries = [
    { label: "Total leads", value: totalLeads, stage: "total" as const, icon: <Users size={19} />, detail: "Received in this period" },
    { label: "Active pipeline", value: newLeads + assigned + followUp, icon: <TrendingUp size={19} />, detail: "New, assigned & follow-up" },
    { label: "Closed won", value: closedWon, stage: "closed" as const, icon: <CheckCircle2 size={19} />, detail: "Successfully converted" },
    { label: "Win rate", value: `${closingRatio}%`, icon: <Target size={19} />, detail: "Won / total leads" },
  ];

  return (
    <section className="funnel-overview" aria-busy={loading}>
      <header className="funnel-page-header">
        <div>
          <span className="funnel-eyebrow">LEADS MANAGEMENT</span>
          <h1>{title}</h1>
          <p>Track your pipeline, conversions and lead sources.</p>
        </div>
        <div className="funnel-header-actions">
          <button type="button" className="funnel-action" onClick={onQuotationClick} disabled={quotationLoading}>
            {quotationLoading ? <Spin size="small" /> : <FileText size={16} />} Today?s quotations
          </button>
          <button type="button" className="funnel-action funnel-action-primary" onClick={onDownloadExcel} disabled={downloadLoading || loading}>
            {downloadLoading ? <Spin size="small" /> : <Download size={16} />} Export Excel
          </button>
        </div>
      </header>

      <div className="funnel-filter-bar">
        <div className="funnel-period-tabs" role="group" aria-label="Reporting period">
          {PERIOD_OPTIONS.filter((period) => ["today", "week", "month"].includes(period.key)).map((period) => (
            <button key={period.key} type="button" aria-pressed={selectedPeriod === period.key}
              className={selectedPeriod === period.key ? "is-selected" : ""}
              onClick={() => onSelectPeriod?.(period.key)}>{period.label}</button>
          ))}
          <Dropdown menu={{ items: periodMenuItems, onClick: onPeriodChange }} trigger={["click"]}>
            <button type="button" className={selectedPeriod && !["today", "week", "month"].includes(selectedPeriod) ? "is-selected" : ""}>
              {selectedPeriod && !["today", "week", "month"].includes(selectedPeriod) ? subtitle : "More"}<ChevronDown size={14} />
            </button>
          </Dropdown>
        </div>
        <span className="funnel-filter-date">{periodDescription}</span>
        <div className="funnel-employee-filter">
          <label htmlFor="funnel-employee">Sales employee</label>
          <Select id="funnel-employee" showSearch value={selectedEmployeeId} onChange={onEmployeeChange}
            optionFilterProp="label" options={employeeOptions} popupMatchSelectWidth={false} style={{ width: "100%" }} />
        </div>
      </div>

      {loading ? <div className="funnel-loading"><Spin size="large" /><span>Loading pipeline overview?</span></div> : <>
        <div className="funnel-summary-grid">
          {summaries.map((summary, index) => {
            const content = <>
              <div className="funnel-summary-heading"><span>{summary.label}</span><span className="funnel-summary-icon">{summary.icon}</span></div>
              <strong className="funnel-summary-value">{typeof summary.value === "number" ? formatLeadCount(summary.value) : summary.value}</strong>
              <span className="funnel-summary-detail">{summary.detail}</span>
            </>;
            return summary.stage ? <button key={summary.label} type="button" className={`funnel-summary-card summary-${index}`}
              onClick={() => onStageClick(summary.stage)} aria-label={`View ${summary.label}`}>{content}</button>
              : <div key={summary.label} className={`funnel-summary-card summary-${index}`}>{content}</div>;
          })}
        </div>

        <div className="funnel-pipeline-panel">
          <div className="funnel-panel-heading">
            <div><h2>Pipeline breakdown</h2><p>Current stage of leads received in this period</p></div>
            <span className="funnel-scope-label">{selectedEmployeeName}</span>
          </div>
          <div className="funnel-stage-list">
            {stages.filter((stage) => stage.key !== "total").map((stage) => (
              <button type="button" key={stage.key} className="funnel-stage-row" onClick={() => onStageClick(stage.key)}
                aria-label={`View ${stage.label}: ${stage.value} leads, ${stage.percent.toFixed(1)} percent of total`}
                style={{ "--stage-accent": stageAccents[stage.key] } as React.CSSProperties}>
                <span className="funnel-stage-icon">{stage.icon}</span>
                <span className="funnel-stage-name"><strong>{stage.label}</strong><span>{stage.description}</span></span>
                <span className="funnel-stage-track"><span style={{ width: `${Math.min(100, Math.max(0, stage.percent))}%` }} /></span>
                <strong className="funnel-stage-count">{formatLeadCount(stage.value)}</strong>
                <span className="funnel-stage-percent">{stage.percent.toFixed(1)}%</span>
                <ExternalLink size={14} className="funnel-stage-link" />
              </button>
            ))}
          </div>
          {totalLeads === 0 && <p className="funnel-empty-note">No leads for this selection. Try another period or sales employee.</p>}
          <div className="funnel-focus-note"><Target size={18} /><div><strong>Focus area</strong><p>{focusAreaText}</p></div></div>
        </div>
      </>}
    </section>
  );
}

interface SourceWiseLeadCardsProps {
  sourceStats: LeadSourceStat[];
  totalLeads: number;
  selectedEmployeeName: string;
  periodLabel: string;
  onSourceClick: (source: LeadSourceStat) => void;
  loading?: boolean;
}

function SourceWiseLeadCards({
  sourceStats,
  totalLeads,
  selectedEmployeeName,
  periodLabel,
  onSourceClick,
  loading,
}: SourceWiseLeadCardsProps) {
  const { isDark } = useThemeMode();
  const headingColor = isDark ? "#f8fafc" : NAVY;

  return (
    <section className="funnel-sources">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2
            className="text-base font-semibold leading-tight sm:text-lg"
            style={{ color: headingColor }}
          >
            Lead sources
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{periodLabel}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>{selectedEmployeeName}</span>
          </div>
        </div>
        <span className="funnel-source-total">{formatLeadCount(totalLeads)} total leads</span>
      </div>

      {loading ? (
        <div className="flex min-h-32 items-center justify-center rounded-lg border border-slate-200 bg-white dark:border-[#303030] dark:bg-[#1f1f1f]">
          <Spin />
        </div>
      ) : (
        <div className="funnel-source-grid">
          {sourceStats.map((source) => (
            <button
              type="button"
              key={source.key}
              onClick={() => onSourceClick(source)}
              aria-label={`View ${source.label} leads for ${periodLabel}`}
              className="funnel-source-card"
              
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: isDark ? `${source.accent}22` : source.bg,
                    color: source.accent,
                  }}
                >
                  {source.icon}
                </div>
                <div
                  className="rounded-md px-2 py-1 text-xs font-semibold leading-none"
                  style={{
                    backgroundColor: isDark ? `${source.accent}22` : source.bg,
                    color: source.accent,
                  }}
                >
                  {source.percent}%
                </div>
              </div>

              <div className="mt-3 min-w-0">
                <div className="truncate text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
                  {source.label}
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="text-3xl font-semibold leading-none text-slate-950 dark:text-slate-100">
                    {source.total}
                  </div>
                  <div className="pb-1 text-right text-[11px] font-semibold leading-tight text-slate-500 dark:text-slate-400">
                    leads
                  </div>
                </div>
              </div>

              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(source.percent, 100)}%`,
                    backgroundColor: source.accent,
                  }}
                />
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                <div className="min-w-0 rounded-md bg-slate-50 dark:bg-slate-800 px-0.5 py-1.5">
                  <div className="truncate text-[11px] font-medium leading-none text-slate-500">
                    Active
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-none text-slate-900 dark:text-slate-100">
                    {source.active}
                  </div>
                </div>
                <div className="min-w-0 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-0.5 py-1.5">
                  <div className="truncate text-[11px] font-medium leading-none text-emerald-700">
                    Won
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-none text-emerald-700">
                    {source.won}
                  </div>
                </div>
                <div className="min-w-0 rounded-md bg-rose-50 dark:bg-rose-950/40 px-0.5 py-1.5">
                  <div className="truncate text-[11px] font-medium leading-none text-rose-700">
                    Lost
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-none text-rose-700">
                    {source.lost}
                  </div>
                </div>
                <div className="min-w-0 rounded-md bg-amber-50 dark:bg-amber-950/40 px-0.5 py-1.5">
                  <div className="truncate text-[11px] font-medium leading-none text-amber-700">
                    Disqualified
                  </div>
                  <div className="mt-1 text-sm font-semibold leading-none text-amber-700">
                    {source.disqualified}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

interface LeadSourceDialogProps {
  open: boolean;
  source: LeadSourceStat | null;
  leads: LeadsManagement[];
  teamTreeData: TeamTreeDTO[];
  periodLabel: string;
  loading: boolean;
  onClose: () => void;
}

function getLeadDisplayName(lead: LeadsManagement) {
  return toTitleCase(
    lead.businessName?.trim() ||
      lead.username?.trim() ||
      lead.followUpName?.trim(),
    "Unnamed Lead"
  );
}

function getLeadPhoneNumber(lead: LeadsManagement) {
  return lead.mobile?.trim() || lead.phone?.trim() || lead.mobileAlt?.trim() || "";
}

function formatLeadExportDate(value?: number | string): string {
  if (!value) return "";
  const timestamp = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  return dayjs(timestamp).format("DD/MM/YYYY HH:mm");
}

function formatLeadExportStage(stage?: string): string {
  const value = (stage ?? "").trim();
  if (!value) return "N/A";
  return value.toUpperCase();
}

function LeadSourceDialog({
  open,
  source,
  leads,
  teamTreeData,
  periodLabel,
  loading,
  onClose,
}: LeadSourceDialogProps) {
  const employeeById = useMemo(
    () =>
      new Map(
        teamTreeData
          .filter((employee) => Boolean(employee.userProfileId))
          .map((employee) => [employee.userProfileId.toLowerCase(), employee])
      ),
    [teamTreeData]
  );
  const assignedCount = leads.filter((lead) => Boolean(lead.assignedTo?.trim())).length;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      centered
      title={
        <div className="flex min-w-0 items-center gap-3 pr-8">
          {source && (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: source.bg, color: source.accent }}
            >
              {source.icon}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-slate-900">
              {source?.label || "Source"} leads
            </div>
            <div className="text-xs font-medium text-slate-500">
              {periodLabel}
            </div>
          </div>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-4 text-xs font-semibold">
        <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-700">
          {leads.length} total
        </span>
        <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
          {assignedCount} assigned
        </span>
        <span className="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-700">
          {leads.length - assignedCount} unassigned
        </span>
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center">
          <Spin />
        </div>
      ) : leads.length === 0 ? (
        <Empty
          description={`No ${source?.label || "source"} leads found for the selected period`}
        />
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(140px,0.8fr)_minmax(180px,1fr)] gap-3 px-3 pb-1 text-xs font-bold uppercase text-slate-500 sm:grid">
            <span>Lead</span>
            <span>Number</span>
            <span>Assignment</span>
          </div>
          {leads.map((lead) => {
            const phoneNumber = getLeadPhoneNumber(lead);
            const assignedTo = lead.assignedTo?.trim();
            const assignedEmployee = assignedTo
              ? employeeById.get(assignedTo.toLowerCase())
              : undefined;

            return (
              <div
                key={lead.id}
                className="grid min-w-0 gap-3 rounded-lg border border-slate-200 px-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(140px,0.8fr)_minmax(180px,1fr)] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900" title={getLeadDisplayName(lead)}>
                    {getLeadDisplayName(lead)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatLeadSourceLabel(lead.source, source?.label)}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-bold uppercase text-slate-400 sm:hidden">Number</div>
                  {phoneNumber ? (
                    <a
                      href={`tel:${phoneNumber}`}
                      className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
                    >
                      <Phone size={14} className="shrink-0" />
                      <span className="truncate">{phoneNumber}</span>
                    </a>
                  ) : (
                    <span className="text-sm text-slate-400">Not available</span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-bold uppercase text-slate-400 sm:hidden">Assignment</div>
                  {assignedTo ? (
                    <div className="inline-flex max-w-full items-center gap-2 rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
                      <CheckCircle2 size={15} className="shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-xs font-bold">Assigned</span>
                        {assignedEmployee?.userName && (
                          <span
                            className="block truncate text-[11px]"
                            title={formatEmployeeName(assignedEmployee.userName)}
                          >
                            {formatEmployeeName(assignedEmployee.userName)}
                          </span>
                        )}
                      </span>
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700">
                      <XCircle size={15} /> Unassigned
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

interface QuotationDialogProps {
  open: boolean;
  quotations: QuotationRecord[];
  teamTreeData: TeamTreeDTO[];
  selectedEmployeeName: string;
  loading: boolean;
  error: string;
  onClose: () => void;
}

function formatQuotationAmount(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

const WHATSAPP_TIMESTAMP_THRESHOLD = 946684800000;

function normalizeWhatsAppTimestamp(value?: number) {
  if (!value || !Number.isFinite(value)) return 0;
  return value < WHATSAPP_TIMESTAMP_THRESHOLD ? value * 1000 : value;
}

function normalizeMobileNumber(value?: string) {
  const digits = value?.replace(/\D/g, "") || "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function chunkValues<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size)
  );
}

function mapWhatsAppLogsToQuotations(
  chats: WhatsAppMessageLog[],
  startDate: number,
  endDate: number
) {
  return chats
    .flatMap((chat) =>
      (Array.isArray(chat.sentMsgList) ? chat.sentMsgList : []).flatMap(
        (message): QuotationRecord[] => {
          const parameters =
            message.content?.template?.components?.flatMap(
              (component) => component.parameters || []
            ) || [];
          const document = parameters.find(
            (parameter) => parameter.document
          )?.document;
          const filename = document?.filename?.trim() || "";
          const quotationNo = filename.match(/QT-\d{8}-\d+/i)?.[0];
          const sentAt = normalizeWhatsAppTimestamp(
            message.createdDateTimeMili || message.sent_at
          );

          if (
            !quotationNo ||
            sentAt < startDate ||
            sentAt > endDate ||
            message.status === "failed"
          ) {
            return [];
          }

          const recipientName = parameters
            .map((parameter) => parameter.text?.trim())
            .find(Boolean);

          return [
            {
              id: `${chat.id}:${message.message_uuid || message.request_id || sentAt}`,
              quotationNo,
              leadId: "",
              leadName: recipientName || "WhatsApp contact",
              leadMobile: chat.mobile || message.to || "",
              assignedTo: "",
              source: "WhatsApp",
              sentAt,
              sentBy: "",
              pdfUrl: document?.link || "",
              itemCount: 0,
              totalAmount: 0,
              status: "SENT",
            },
          ];
        }
      )
    )
    .sort((a, b) => b.sentAt - a.sentAt);
}

function QuotationDialog({
  open,
  quotations,
  teamTreeData,
  selectedEmployeeName,
  loading,
  error,
  onClose,
}: QuotationDialogProps) {
  const employeeById = useMemo(
    () =>
      new Map(
        teamTreeData
          .filter((employee) => Boolean(employee.userProfileId))
          .map((employee) => [employee.userProfileId.toLowerCase(), employee])
      ),
    [teamTreeData]
  );
  const totalAmount = quotations.reduce(
    (sum, quotation) => sum + (Number(quotation.totalAmount) || 0),
    0
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={900}
      centered
      title={
        <div className="flex min-w-0 items-center gap-3 pr-8">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <FileText size={18} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-base font-bold text-slate-900">
              Quotations Sent Today
            </div>
            <div className="truncate text-xs font-medium text-slate-500">
              {dayjs().format("DD MMMM YYYY")} - {selectedEmployeeName}
            </div>
          </div>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-4 text-xs font-semibold">
        <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-700">
          {quotations.length} sent
        </span>
        {totalAmount > 0 && (
          <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
            {formatQuotationAmount(totalAmount)} total value
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center">
          <Spin />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : quotations.length === 0 ? (
        <Empty description="No quotations were sent today" />
      ) : (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          <div className="hidden grid-cols-[minmax(120px,0.8fr)_minmax(0,1.35fr)_minmax(150px,1fr)_minmax(110px,0.7fr)_minmax(120px,0.8fr)] gap-3 px-3 pb-1 text-xs font-bold uppercase text-slate-500 md:grid">
            <span>Quotation</span>
            <span>Lead</span>
            <span>Assignment</span>
            <span>Sent</span>
            <span className="text-right">Value</span>
          </div>
          {quotations.map((quotation) => {
            const assignedTo = quotation.assignedTo?.trim();
            const assignedEmployee = assignedTo
              ? employeeById.get(assignedTo.toLowerCase())
              : undefined;

            return (
              <div
                key={quotation.id || quotation.quotationNo}
                className="grid min-w-0 gap-3 rounded-lg border border-slate-200 px-3 py-3 md:grid-cols-[minmax(120px,0.8fr)_minmax(0,1.35fr)_minmax(150px,1fr)_minmax(110px,0.7fr)_minmax(120px,0.8fr)] md:items-center"
              >
                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-bold uppercase text-slate-400 md:hidden">
                    Quotation
                  </div>
                  <div className="truncate text-sm font-bold text-slate-900">
                    {quotation.quotationNo}
                  </div>
                  {quotation.pdfUrl && (
                    <a
                      href={quotation.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                    >
                      View PDF <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-bold uppercase text-slate-400 md:hidden">
                    Lead
                  </div>
                  <div className="truncate text-sm font-bold text-slate-900">
                    {quotation.leadName
                      ? toTitleCase(quotation.leadName)
                      : "Unnamed Lead"}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {quotation.leadMobile || "Number not available"}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-bold uppercase text-slate-400 md:hidden">
                    Assignment
                  </div>
                  {assignedTo ? (
                    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                      <CheckCircle2 size={14} className="shrink-0" />
                      <span className="truncate">
                        {formatEmployeeName(
                          assignedEmployee?.userName,
                          "Assigned"
                        )}
                      </span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                      Not available
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="mb-1 text-[10px] font-bold uppercase text-slate-400 md:hidden">
                    Sent
                  </div>
                  <div className="text-sm font-semibold text-slate-700">
                    {dayjs(quotation.sentAt).format("hh:mm A")}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {quotation.itemCount > 0
                      ? `${quotation.itemCount} ${quotation.itemCount === 1 ? "item" : "items"}`
                      : "PDF quotation"}
                  </div>
                </div>

                <div className="min-w-0 md:text-right">
                  <div className="mb-1 text-[10px] font-bold uppercase text-slate-400 md:hidden">
                    Value
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {Number(quotation.totalAmount) > 0
                      ? formatQuotationAmount(Number(quotation.totalAmount))
                      : "Not recorded"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

export default function LeadFunnelDashboard() {
  const navigate = useNavigate();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id
  );
  const currentUserId = useSelector(
    (state: RootState) => state.auth.user?.id || state.auth.user?.uid || "anonymous"
  );
  const teamTreeData = useSelector(
    (state: RootState) => state.appState.teamTreeData || []
  );
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("today");
  const [selectedEmployeeId, setSelectedEmployeeId] =
    useState(ALL_EMPLOYEES_KEY);
  const [counts, setCounts] = useState<LeadFunnelCounts>({
    totalLeads: 0,
    newLeads: 0,
    assigned: 0,
    followUp: 0,
    closedWon: 0,
    lost: 0,
    disqualified: 0,
  });
  const [sourceStats, setSourceStats] = useState<LeadSourceStat[]>(() =>
    SOURCE_DEFINITIONS.map((source) => ({
      ...source,
      total: 0,
      active: 0,
      won: 0,
      lost: 0,
      disqualified: 0,
      percent: 0,
    }))
  );
  const [loading, setLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<LeadSourceStat | null>(null);
  const [sourceDialogLeads, setSourceDialogLeads] = useState<LeadsManagement[]>([]);
  const [sourceDialogLoading, setSourceDialogLoading] = useState(false);
  const [quotationDialogOpen, setQuotationDialogOpen] = useState(false);
  const [todayQuotations, setTodayQuotations] = useState<QuotationRecord[]>([]);
  const [quotationLoading, setQuotationLoading] = useState(false);
  const [quotationError, setQuotationError] = useState("");
  const [quotationCacheKey, setQuotationCacheKey] = useState("");
  const [exportingLeads, setExportingLeads] = useState(false);

  const periodRange = useMemo(
    () => getPeriodRange(selectedPeriod),
    [selectedPeriod]
  );
  const yearlyExportStorageKey = useMemo(
    () => `${YEARLY_EXPORT_STORAGE_PREFIX}:${outletId}:${currentUserId}`,
    [currentUserId, outletId]
  );
  const monthlyExportStorageKey = useMemo(
    () => `${MONTHLY_EXPORT_STORAGE_PREFIX}:${outletId}:${currentUserId}`,
    [currentUserId, outletId]
  );

  const salesEmployees = useMemo<TeamTreeDTO[]>(
    () =>
      [...teamTreeData]
        .filter(
          (employee) =>
            employee?.department === "SALES" &&
            employee?.isActive === true &&
            Boolean(employee?.userProfileId)
        )
        .sort((a, b) => (a.userName || "").localeCompare(b.userName || "")),
    [teamTreeData]
  );

  const employeeOptions = useMemo(
    () => [
      { label: "All Sales Employees", value: ALL_EMPLOYEES_KEY },
      ...salesEmployees.map((employee) => ({
        label: formatEmployeeName(employee.userName),
        value: employee.userProfileId,
      })),
    ],
    [salesEmployees]
  );

  const selectedEmployee = useMemo(
    () =>
      salesEmployees.find(
        (employee) => employee.userProfileId === selectedEmployeeId
      ),
    [salesEmployees, selectedEmployeeId]
  );

  const selectedEmployeeName =
    selectedEmployeeId === ALL_EMPLOYEES_KEY
      ? "All Sales Employees"
      : formatEmployeeName(selectedEmployee?.userName, "Selected Employee");


  const filteredTodayQuotations = useMemo(() => {
    if (selectedEmployeeId === ALL_EMPLOYEES_KEY) {
      return todayQuotations;
    }

    const employeeId = selectedEmployeeId.toLowerCase();
    return todayQuotations.filter(
      (quotation) => quotation.assignedTo?.trim().toLowerCase() === employeeId
    );
  }, [selectedEmployeeId, todayQuotations]);

  const focusAreaText = useMemo(
    () => getDynamicFocusAreaText(counts, selectedEmployeeName),
    [counts, selectedEmployeeName]
  );

  const periodMenuItems: MenuProps["items"] = useMemo(
    () =>
      PERIOD_OPTIONS.map((option) => ({
        key: option.key,
        label: option.label,
      })),
    []
  );

  const handlePeriodChange: MenuProps["onClick"] = useCallback(({ key }) => {
    if (isPeriodKey(key)) {
      setSelectedPeriod(key);
    }
  }, []);

  const handleEmployeeChange = useCallback((value: string) => {
    setSelectedEmployeeId(value || ALL_EMPLOYEES_KEY);
  }, []);

  const handleStageClick = useCallback(
    (stage: FunnelStageKey) => {
      const searchParams = new URLSearchParams({
        stage,
        startDate: String(periodRange.startDate),
        endDate: String(periodRange.endDate),
        period: periodRange.label,
        employeeName: selectedEmployeeName,
      });

      if (selectedEmployeeId !== ALL_EMPLOYEES_KEY) {
        searchParams.set("assignedTo", selectedEmployeeId);
      }

      const detailsUrl = `${ROUTES_PATHS.LEADS_FUNNEL_DETAILS}?${searchParams.toString()}`;
      navigate(detailsUrl);
    },
    [
      periodRange.endDate,
      periodRange.label,
      periodRange.startDate,
      navigate,
      selectedEmployeeId,
      selectedEmployeeName,
    ]
  );

  const handleDownloadFunnelLeads = useCallback(async () => {
    if (!outletId) return;

    const isMonthlyExport =
      selectedPeriod === "month" || selectedPeriod === "last month";

    if (selectedPeriod === "year") {
      const lastDownloadedAt = getYearlyExportTimestamp(yearlyExportStorageKey);

      if (lastDownloadedAt !== null) {
        const elapsedMs = Date.now() - lastDownloadedAt;

        if (elapsedMs < YEARLY_EXPORT_COOLDOWN_MS) {
          const remainingMs = Math.min(
            YEARLY_EXPORT_COOLDOWN_MS,
            YEARLY_EXPORT_COOLDOWN_MS - elapsedMs
          );
          message.warning(
            `Yearly Excel download limit exceeded. Please wait ${formatCooldownRemaining(remainingMs)} before downloading again.`
          );
          return;
        }
      }
    }

    if (isMonthlyExport) {
      const now = Date.now();
      let recentMonthlyExports = getMonthlyExportTimestamps(
        monthlyExportStorageKey
      );

      if (recentMonthlyExports.length >= MONTHLY_EXPORT_LIMIT) {
        const lastDownloadedAt = recentMonthlyExports.at(-1) ?? now;
        const elapsedMs = now - lastDownloadedAt;

        if (elapsedMs < YEARLY_EXPORT_COOLDOWN_MS) {
          const remainingMs = Math.min(
            YEARLY_EXPORT_COOLDOWN_MS,
            YEARLY_EXPORT_COOLDOWN_MS - elapsedMs
          );
          message.warning(
            `Monthly Excel download limit exceeded. You can download monthly data twice, then must wait 24 hours. Please wait ${formatCooldownRemaining(remainingMs)} before downloading again.`
          );
          return;
        }

        recentMonthlyExports = [];
      } else {
        recentMonthlyExports = recentMonthlyExports.filter(
          (timestamp) => now - timestamp < YEARLY_EXPORT_COOLDOWN_MS
        );
      }

      setMonthlyExportTimestamps(monthlyExportStorageKey, recentMonthlyExports);
    }

    setExportingLeads(true);

    try {
      const rows: LeadsManagement[] = [];
      let nextCursor: string | null | undefined = undefined;

      do {
        const response = await leadApi.getLeads({
          outletId,
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          assignedTo:
            selectedEmployeeId === ALL_EMPLOYEES_KEY
              ? undefined
              : selectedEmployeeId,
          limit: 100,
          cursor: nextCursor,
        });

        rows.push(...response.items);
        nextCursor = response.nextCursor ?? undefined;
      } while (nextCursor);

      const employeeMap = new Map(
        teamTreeData
          .filter((employee) => Boolean(employee.userProfileId))
          .map((employee) => [String(employee.userProfileId).toLowerCase(), employee])
      );

      const exportRows = rows.map((lead) => {
        const assignee =
          lead.assignedTo && employeeMap.get(String(lead.assignedTo).toLowerCase());

        return {
          "Lead Name": getLeadDisplayName(lead),
          "Business Name": lead.businessName || "",
          "Customer Name": lead.username || "",
          "Mobile": getLeadPhoneNumber(lead),
          "Alternate Mobile": lead.mobileAlt || "",
          "Email": lead.email || "",
          "Source": lead.source || "",
          "Stage": formatLeadExportStage(lead.stage),
          "Status": lead.status || "",
          "Assigned To": assignee ? formatEmployeeName(assignee.userName) : lead.assignedTo || "Unassigned",
          "Assigned By": lead.assignedBy || "",
          "Priority": lead.priority || "",
          "City": lead.city || "",
          "State": lead.state || "",
          "Area": lead.area || "",
          "Business Type": lead.businessType || "",
          "Requirement": lead.requirement || "",
          "Comments": lead.comments || "",
          "Follow Up Name": lead.followUpName || "",
          "Created Date": formatLeadExportDate(lead.createdDate),
          "Updated Date": formatLeadExportDate(lead.updatedDate),
          "Lead Date": lead.leadDate || "",
          "Filter": `${periodRange.label} (${periodRange.description})`,
          "Sales Employee":
            selectedEmployeeId === ALL_EMPLOYEES_KEY
              ? "All Sales Employees"
              : selectedEmployeeName,
        };
      });

      const columns: TableColumn<typeof exportRows[number]>[] = [
        { title: "Lead Name", dataIndex: "Lead Name" },
        { title: "Business Name", dataIndex: "Business Name" },
        { title: "Customer Name", dataIndex: "Customer Name" },
        { title: "Mobile", dataIndex: "Mobile" },
        { title: "Alternate Mobile", dataIndex: "Alternate Mobile" },
        { title: "Email", dataIndex: "Email" },
        { title: "Source", dataIndex: "Source" },
        { title: "Stage", dataIndex: "Stage" },
        { title: "Status", dataIndex: "Status" },
        { title: "Assigned To", dataIndex: "Assigned To" },
        { title: "Assigned By", dataIndex: "Assigned By" },
        { title: "Priority", dataIndex: "Priority" },
        { title: "City", dataIndex: "City" },
        { title: "State", dataIndex: "State" },
        { title: "Area", dataIndex: "Area" },
        { title: "Business Type", dataIndex: "Business Type" },
        { title: "Requirement", dataIndex: "Requirement" },
        { title: "Comments", dataIndex: "Comments" },
        { title: "Follow Up Name", dataIndex: "Follow Up Name" },
        { title: "Created Date", dataIndex: "Created Date" },
        { title: "Updated Date", dataIndex: "Updated Date" },
        { title: "Lead Date", dataIndex: "Lead Date" },
        { title: "Filter", dataIndex: "Filter" },
        { title: "Sales Employee", dataIndex: "Sales Employee" },
      ];

      const timestamp = dayjs().format("YYYY-MM-DD_HH-mm");
      const fileName = `lead-funnel-${periodRange.label.toLowerCase().replace(/\s+/g, "-")}-${timestamp}.xlsx`;
      await exportToExcel(exportRows, columns, fileName, "Lead Funnel Export");

      if (selectedPeriod === "year") {
        setYearlyExportTimestamp(yearlyExportStorageKey, Date.now());
      }

      if (isMonthlyExport) {
        const now = Date.now();
        const recentMonthlyExports = getMonthlyExportTimestamps(
          monthlyExportStorageKey
        ).filter(
          (timestamp) => now - timestamp < YEARLY_EXPORT_COOLDOWN_MS
        );
        setMonthlyExportTimestamps(monthlyExportStorageKey, [
          ...recentMonthlyExports,
          now,
        ]);
      }
    } catch (error) {
      console.error("Failed to export funnel leads:", error);
      message.error("Failed to download the Excel file. Please try again.");
    } finally {
      setExportingLeads(false);
    }
  }, [monthlyExportStorageKey, outletId, periodRange.description, periodRange.label, periodRange.startDate, periodRange.endDate, selectedEmployeeId, selectedEmployeeName, selectedPeriod, teamTreeData, yearlyExportStorageKey]);

  const handleQuotationClick = useCallback(async () => {
    setQuotationDialogOpen(true);
    setQuotationError("");

    if (!outletId) {
      setTodayQuotations([]);
      setQuotationError("Select an outlet before viewing today's quotations.");
      return;
    }

    const currentCacheKey = `${outletId}:${dayjs().format("YYYY-MM-DD")}`;
    if (quotationCacheKey === currentCacheKey) {
      return;
    }

    setQuotationLoading(true);
    setTodayQuotations([]);

    try {
      const todayStart = dayjs().startOf("day").valueOf();
      const todayEnd = dayjs().endOf("day").valueOf();
      const { items: data } = await whatsappChatApi.list({ outletId, startDate: todayStart, limit: 100 });

      const quotations = mapWhatsAppLogsToQuotations(
        Array.isArray(data) ? data : [],
        todayStart,
        todayEnd
      );
      const mobileNumbers = Array.from(
        new Set(
          quotations
            .map((quotation) => normalizeMobileNumber(quotation.leadMobile))
            .filter(Boolean)
        )
      );
      const matchedLeads = (
        await Promise.all(
          chunkValues(mobileNumbers, 30).map((mobileBatch) =>
            leadApi.lookupByMobiles({
              outletId,
              mobiles: mobileBatch,
            })
          )
        )
      ).flatMap((response) => response.items);

      const leadByMobile = new Map(
        matchedLeads.map((lead) => [normalizeMobileNumber(lead.mobile), lead])
      );

      setTodayQuotations(
        quotations.map((quotation) => {
          const lead = leadByMobile.get(
            normalizeMobileNumber(quotation.leadMobile)
          );

          return lead
            ? {
                ...quotation,
                leadId: lead.id || "",
                leadName: getLeadDisplayName(lead),
                assignedTo: lead.assignedTo || "",
                source: lead.source || "WhatsApp",
              }
            : quotation;
        })
      );
      setQuotationCacheKey(currentCacheKey);
    } catch (error) {
      console.error("Failed to load today's quotations", error);
      setQuotationError(
        "Today's quotations could not be loaded. Please try again."
      );
    } finally {
      setQuotationLoading(false);
    }
  }, [outletId, quotationCacheKey]);

  const handleSourceClick = useCallback(
    async (source: LeadSourceStat) => {
      if (!outletId) return;

      setSelectedSource(source);
      setSourceDialogLeads([]);
      setSourceDialogLoading(true);

      try {
        const { items } = await leadApi.getLeads({
          outletId,
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          assignedTo:
            selectedEmployeeId === ALL_EMPLOYEES_KEY
              ? undefined
              : selectedEmployeeId,
          sourceKey: source.key,
          limit: SOURCE_DIALOG_LEADS_LIMIT,
        });

        setSourceDialogLeads(items);
      } catch (error) {
        console.error("Failed to load source leads:", error);
        setSourceDialogLeads([]);
      } finally {
        setSourceDialogLoading(false);
      }
    },
    [
      outletId,
      periodRange.endDate,
      periodRange.startDate,
      selectedEmployeeId,
    ]
  );

  const closeSourceDialog = useCallback(() => {
    setSelectedSource(null);
    setSourceDialogLeads([]);
    setSourceDialogLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const emptySourceStats = buildEmptySourceStats();

    if (!outletId) {
      setCounts({
        totalLeads: 0,
        newLeads: 0,
        assigned: 0,
        followUp: 0,
        closedWon: 0,
        lost: 0,
        disqualified: 0,
      });
      setSourceStats(emptySourceStats);
      return;
    }

    setLoading(true);

    void leadApi
      .getFunnelReport(
        {
          outletId,
          startDate: periodRange.startDate,
          endDate: periodRange.endDate,
          assignedTo:
            selectedEmployeeId === ALL_EMPLOYEES_KEY
              ? undefined
              : selectedEmployeeId,
        },
        controller.signal,
      )
      .then((report) => {
        setCounts(report.counts);
        setSourceStats(mergeSourceStats(report.sources));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Failed to load lead funnel data:", error);
        setCounts({
          totalLeads: 0,
          newLeads: 0,
          assigned: 0,
          followUp: 0,
          closedWon: 0,
          lost: 0,
          disqualified: 0,
        });
        setSourceStats(emptySourceStats);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    outletId,
    periodRange.endDate,
    periodRange.startDate,
    selectedEmployeeId,
  ]);

  return (
    <div className="flex w-full flex-col gap-6 pro-funnel-page-container">
      <div className="w-full">
        <LeadFunnelCard
          title="Sales funnel"
          subtitle={periodRange.label}
          periodDescription={periodRange.description}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={setSelectedPeriod}
          selectedEmployeeId={selectedEmployeeId}
          selectedEmployeeName={selectedEmployeeName}
          employeeOptions={employeeOptions}
          onEmployeeChange={handleEmployeeChange}
          periodMenuItems={periodMenuItems}
          onPeriodChange={handlePeriodChange}
          onStageClick={handleStageClick}
          loading={loading}
          focusAreaText={focusAreaText}
          onQuotationClick={handleQuotationClick}
          onDownloadExcel={handleDownloadFunnelLeads}
          quotationLoading={quotationLoading}
          downloadLoading={exportingLeads}
          {...counts}
        />
      </div>
      <SourceWiseLeadCards
        sourceStats={sourceStats}
        totalLeads={counts.totalLeads}
        selectedEmployeeName={selectedEmployeeName}
        periodLabel={`${periodRange.label}: ${periodRange.description}`}
        onSourceClick={handleSourceClick}
        loading={loading}
      />
      <LeadSourceDialog
        open={Boolean(selectedSource)}
        source={selectedSource}
        leads={sourceDialogLeads}
        loading={sourceDialogLoading}
        teamTreeData={teamTreeData}
        periodLabel={`${periodRange.label}: ${periodRange.description}`}
        onClose={closeSourceDialog}
      />
      <QuotationDialog
        open={quotationDialogOpen}
        quotations={filteredTodayQuotations}
        teamTreeData={teamTreeData}
        selectedEmployeeName={selectedEmployeeName}
        loading={quotationLoading}
        error={quotationError}
        onClose={() => setQuotationDialogOpen(false)}
      />
    </div>
  );
}













