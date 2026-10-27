import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Input,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  type TableColumnsType,
} from "antd";
import dayjs from "dayjs";
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { LeadsManagement } from "../types/types";
import type { TeamTreeDTO } from "@/features/team";
import { leadApi } from "../api/leadApi";
import { RootState } from "@/app/store";
import { LEAD_STAGE, ROUTES_PATHS } from "@/shared/lib/constants";
import { formatEmployeeName, toTitleCase } from "@/shared/utils/helperFunctions";

type FunnelDetailStage =
  | "total"
  | "new"
  | "assigned"
  | "followup"
  | "closed"
  | "lost"
  | "disqualified";

const STAGE_CONFIG: Record<
  FunnelDetailStage,
  { label: string; apiStage?: LEAD_STAGE; color: string; dot: string }
> = {
  total: { label: "Total Leads", color: "#0a3750", dot: "bg-[#0a3750]" },
  new: {
    label: "New Leads",
    apiStage: LEAD_STAGE.NEW,
    color: "#7c3aed",
    dot: "bg-violet-600",
  },
  assigned: {
    label: "Assigned Leads",
    apiStage: LEAD_STAGE.ASSIGNED,
    color: "#ff3228",
    dot: "bg-[#ff3228]",
  },
  followup: {
    label: "Follow Up Leads",
    apiStage: LEAD_STAGE.FOLLOWUP,
    color: "#2563eb",
    dot: "bg-blue-600",
  },
  closed: {
    label: "Closed (Won) Leads",
    apiStage: LEAD_STAGE.WON,
    color: "#16a34a",
    dot: "bg-green-600",
  },
  lost: {
    label: "Lost Leads",
    apiStage: LEAD_STAGE.LOST,
    color: "#64748b",
    dot: "bg-slate-500",
  },
  disqualified: {
    label: "Disqualified Leads",
    apiStage: LEAD_STAGE.DISQUALIFIED,
    color: "#ea580c",
    dot: "bg-orange-600",
  },
};

const parseStage = (value: string | null): FunnelDetailStage =>
  value && value in STAGE_CONFIG ? (value as FunnelDetailStage) : "total";

const parseTimestamp = (value: string | null, fallback: number) => {
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : fallback;
};

const formatDateTime = (value?: number) => {
  if (!value || !dayjs(value).isValid()) return "Not recorded";
  return dayjs(value).format("DD MMM YYYY, hh:mm A");
};

const displayText = (value?: string, fallback = "Not recorded") => {
  const text = value?.trim().replace(/<br\s*\/?\s*>/gi, "\n");
  return text || fallback;
};

const stageColor = (stage?: string) => {
  switch (stage?.toUpperCase()) {
    case LEAD_STAGE.WON:
      return "green";
    case LEAD_STAGE.FOLLOWUP:
      return "blue";
    case LEAD_STAGE.LOST:
      return "default";
    case LEAD_STAGE.DISQUALIFIED:
      return "orange";
    case LEAD_STAGE.ASSIGNED:
      return "volcano";
    default:
      return "purple";
  }
};

const leadName = (lead: LeadsManagement) =>
  lead.businessName?.trim() || lead.username?.trim() || "Unnamed lead";

const normalizeReason = (value?: string) =>
  value
    ?.replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || "";

const leadReason = (lead: LeadsManagement) =>
  normalizeReason(lead.comments || lead.remarks);

const initials = (lead: LeadsManagement) => {
  const name = leadName(lead);
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
};

function DetailField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2 xl:col-span-3" : ""}>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">
        {value}
      </div>
    </div>
  );
}

const employeeLookup = (employees: TeamTreeDTO[]) =>
  new Map(
    employees
      .filter((employee) => Boolean(employee.userProfileId))
      .map((employee) => [
        String(employee.userProfileId).toLowerCase(),
        formatEmployeeName(employee.userName),
      ]),
  );

export default function FunnelLeadDetailsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id,
  );
  const teamTreeData = useSelector(
    (state: RootState) => state.appState.teamTreeData || [],
  );

  const stage = parseStage(searchParams.get("stage"));
  const config = STAGE_CONFIG[stage];
  const startDate = parseTimestamp(
    searchParams.get("startDate"),
    dayjs().startOf("day").valueOf(),
  );
  const endDate = parseTimestamp(
    searchParams.get("endDate"),
    dayjs().endOf("day").valueOf(),
  );
  const assignedTo = searchParams.get("assignedTo")?.trim() || undefined;
  const periodLabel = searchParams.get("period")?.trim() || "Selected period";
  const employeeLabel =
    searchParams.get("employeeName")?.trim() || "All Sales Employees";
  const focusedLeadId = searchParams.get("leadId")?.trim() || "";
  const returnToParam = searchParams.get("returnTo")?.trim();
  const returnLabelParam = searchParams.get("returnLabel")?.trim();
  const backPath =
    returnToParam && returnToParam.startsWith("/")
      ? returnToParam
      : focusedLeadId
        ? ROUTES_PATHS.EMPLOYEE_WISE_REPORT
        : ROUTES_PATHS.LEADS_FUNNEL_DASHBOARD;
  const backLabel =
    returnLabelParam ||
    (backPath === ROUTES_PATHS.EMPLOYEE_WISE_REPORT ? "Employee Wise" : "Funnel");

  const [leads, setLeads] = useState<LeadsManagement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [expandedLeadKeys, setExpandedLeadKeys] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const employeesById = useMemo(
    () => employeeLookup(teamTreeData),
    [teamTreeData],
  );

  const employeeName = useCallback(
    (id?: string) => {
      const normalizedId = id?.trim().toLowerCase();
      if (!normalizedId) return "Unassigned";
      return employeesById.get(normalizedId) || id || "Unassigned";
    },
    [employeesById],
  );

  useEffect(() => {
    const controller = new AbortController();

    if (!outletId) {
      setLeads([]);
      return () => controller.abort();
    }

    const loadLeads = async () => {
      setLoading(true);
      setError("");
      setLeads([]);

      try {
        const allLeads: LeadsManagement[] = [];
        const visitedCursors = new Set<string>();
        let cursor: string | undefined;

        do {
          const response = await leadApi.getLeads(
            {
              outletId,
              startDate,
              endDate,
              stage: config.apiStage,
              assignedTo,
              limit: 100,
              cursor,
            },
            controller.signal,
          );

          allLeads.push(...response.items);
          const nextCursor = response.nextCursor ?? undefined;
          if (!nextCursor || visitedCursors.has(nextCursor)) break;
          visitedCursors.add(nextCursor);
          cursor = nextCursor;
        } while (cursor);

        if (!controller.signal.aborted) {
          const uniqueLeads = Array.from(
            new Map(allLeads.map((lead) => [lead.id, lead])).values(),
          );
          setLeads(uniqueLeads);
        }
      } catch (loadError) {
        if (controller.signal.aborted) return;
        console.error("Failed to load funnel lead details", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load lead details.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadLeads();
    return () => controller.abort();
  }, [assignedTo, config.apiStage, endDate, outletId, reloadKey, startDate]);

  const topReasonFilters = useMemo(() => {
    const reasonCounts = new Map<string, { reason: string; count: number }>();

    leads.forEach((lead) => {
      const reason = leadReason(lead);
      if (!reason) return;

      const key = reason.toLowerCase();
      const current = reasonCounts.get(key);
      reasonCounts.set(key, {
        reason: current?.reason || reason,
        count: (current?.count || 0) + 1,
      });
    });

    return Array.from(reasonCounts.values())
      .sort((first, second) => second.count - first.count)
      .slice(0, 5);
  }, [leads]);

  useEffect(() => {
    if (
      selectedReason &&
      !topReasonFilters.some((option) => option.reason === selectedReason)
    ) {
      setSelectedReason("");
    }
  }, [selectedReason, topReasonFilters]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();

    return leads.filter((lead) =>
      (!selectedReason || leadReason(lead) === selectedReason) &&
      (!query ||
        [
        lead.username,
        lead.businessName,
        lead.mobile,
        lead.email,
        lead.source,
        lead.city,
        lead.state,
        lead.requirement,
        lead.comments,
        lead.remarks,
        employeeName(lead.assignedTo),
        ].some((value) => value?.toLowerCase().includes(query))),
    );
  }, [employeeName, leads, search, selectedReason]);

  useEffect(() => {
    if (focusedLeadId && leads.some((lead) => lead.id === focusedLeadId)) {
      setExpandedLeadKeys([focusedLeadId]);
      return;
    }

    setExpandedLeadKeys([]);
  }, [focusedLeadId, leads]);

  const tableLeads = useMemo(() => {
    if (!focusedLeadId) return filteredLeads;

    return [...filteredLeads].sort((first, second) => {
      if (first.id === focusedLeadId) return -1;
      if (second.id === focusedLeadId) return 1;
      return 0;
    });
  }, [filteredLeads, focusedLeadId]);

  const columns = useMemo<TableColumnsType<LeadsManagement>>(
    () => [
      {
        title: "Lead",
        key: "lead",
        width: 240,
        render: (_, lead) => (
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: "#0a3750" }}
            >
              {initials(lead)}
            </div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">
                {leadName(lead)}
              </div>
              {lead.businessName && lead.username && (
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {lead.username}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        title: "Contact",
        key: "contact",
        width: 190,
        render: (_, lead) => (
          <div className="text-sm">
            <div className="flex items-center gap-1.5 text-slate-700">
              <Phone size={12} className="shrink-0 text-slate-400" />
              <span>{displayText(lead.mobile)}</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Mail size={12} className="shrink-0 text-slate-400" />
              <span className="truncate">{displayText(lead.email, "No email")}</span>
            </div>
          </div>
        ),
      },
      {
        title: "Stage",
        dataIndex: "stage",
        width: 125,
        render: (value: string) => (
          <Tag color={stageColor(value)} className="!rounded-full !px-2.5 !font-semibold">
            {toTitleCase(value || "New")}
          </Tag>
        ),
      },
      {
        title: "Assigned To",
        dataIndex: "assignedTo",
        width: 160,
        render: (value: string) => (
          <span className="text-sm text-slate-700">{employeeName(value)}</span>
        ),
      },
      {
        title: "Source",
        dataIndex: "source",
        width: 120,
        render: (value: string) => (
          <span className="text-sm text-slate-600">{displayText(value)}</span>
        ),
      },
      {
        title: "Location",
        key: "location",
        width: 190,
        render: (_, lead) => {
          const loc = [lead.area, lead.city, lead.state].filter(Boolean).join(", ");
          return loc ? (
            <div className="flex items-start gap-1.5 text-sm text-slate-600">
              <MapPin size={13} className="mt-0.5 shrink-0 text-slate-400" />
              <span className="line-clamp-2">{loc}</span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">Not recorded</span>
          );
        },
      },
      {
        title: "Created",
        dataIndex: "createdDate",
        width: 170,
        render: (value: number) => (
          <span className="text-sm text-slate-600">{formatDateTime(value)}</span>
        ),
      },
      {
        title: "Reason / Comments",
        key: "reason",
        width: 280,
        render: (_, lead) => {
          const reason = displayText(
            lead.comments || lead.remarks,
            lead.stage === LEAD_STAGE.LOST ||
              lead.stage === LEAD_STAGE.DISQUALIFIED
              ? "No reason recorded"
              : "No comments",
          );
          return (
            <Tooltip title={<span className="whitespace-pre-wrap">{reason}</span>}>
              <div className="line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">
                {reason}
              </div>
            </Tooltip>
          );
        },
      },
      {
        title: "Record",
        key: "action",
        fixed: "right",
        width: 110,
        render: (_, lead) => (
          <a
            href={`${ROUTES_PATHS.LEADS_MANAGEMENT}?lead=${encodeURIComponent(lead.id)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 font-semibold text-[#0a3750] transition-colors hover:text-[#ff3228]"
          >
            Open <ExternalLink size={13} />
          </a>
        ),
      },
    ],
    [employeeName],
  );

  return (
    <div className="min-h-[calc(100vh-96px)] rounded-xl bg-slate-50 p-3 sm:p-5">
      {/* Header */}
      <div
        className="relative mb-5 overflow-hidden rounded-2xl p-5 shadow-sm sm:p-6"
        style={{
          background: "linear-gradient(135deg, #0a3750 0%, #0f4a6b 100%)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-20"
          style={{ backgroundColor: "#ff3228" }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <Button
              size="small"
              icon={<ArrowLeft size={14} />}
              onClick={() => navigate(backPath)}
              className="!mb-3 !border-white/20 !bg-white/10 !text-white hover:!border-white/40 hover:!bg-white/20 hover:!text-white"
            >
              Back to {backLabel}
            </Button>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white"
                style={{ backgroundColor: config.color }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                {config.label}
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90">
                {periodLabel}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90">
                <Users size={12} />
                {employeeLabel}
              </span>
            </div>
            <Typography.Title level={3} className="!mb-1 !text-white">
              {config.label}
            </Typography.Title>
            <Typography.Text className="!text-white/70">
              {dayjs(startDate).format("DD MMM YYYY")} – {dayjs(endDate).format("DD MMM YYYY")}
            </Typography.Text>
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-5 py-3 backdrop-blur-sm">
            <Building2 className="text-white/70" size={22} />
            <div>
              <div className="text-2xl font-bold leading-none text-white">
                {leads.length}
              </div>
              <div className="mt-1 text-xs font-medium text-white/70">
                {leads.length === 1 ? "Lead" : "Leads"} found
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <Input
          allowClear
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          prefix={<Search size={15} className="text-slate-400" />}
          placeholder="Search by name, contact, source, location…"
          className="w-full sm:w-80"
          size="large"
        />
        <Space>
          {search && (
            <span className="text-xs font-medium text-slate-500">
              {filteredLeads.length} of {leads.length} shown
            </span>
          )}
          <Button
            icon={<RefreshCw size={15} />}
            loading={loading}
            size="large"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            Refresh
          </Button>
        </Space>
      </div>

      {topReasonFilters.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Top Reasons
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="small"
              type={!selectedReason ? "primary" : "default"}
              onClick={() => setSelectedReason("")}
            >
              All
            </Button>
            {topReasonFilters.map((option) => (
              <Tooltip
                key={option.reason}
                title={`${option.reason} (${option.count})`}
              >
                <Button
                  size="small"
                  type={selectedReason === option.reason ? "primary" : "default"}
                  onClick={() => setSelectedReason(option.reason)}
                  className="!inline-flex !max-w-full !items-center !gap-1.5"
                >
                  <span className="max-w-[220px] truncate">{option.reason}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
                    {option.count}
                  </span>
                </Button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {error && (
        <Alert
          type="error"
          showIcon
          message="Unable to load funnel lead details"
          description={error}
          className="mb-4 !rounded-xl"
        />
      )}

      <Card
        className="overflow-hidden !rounded-xl !border-slate-200 shadow-sm"
        styles={{ body: { padding: 0 } }}
      >
        <Table<LeadsManagement>
          rowKey="id"
          loading={loading}
          dataSource={tableLeads}
          columns={columns}
          scroll={{ x: 1615 }}
          pagination={{
            defaultPageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: [20, 50, 100],
            showTotal: (total) => `${total} leads`,
          }}
          locale={{ emptyText: error ? "No data available" : "No leads found" }}
          rowClassName={(lead) =>
            lead.id === focusedLeadId
              ? "cursor-pointer bg-yellow-50 hover:!bg-yellow-100"
              : "cursor-pointer hover:!bg-slate-50"
          }
          expandable={{
            expandRowByClick: true,
            expandedRowKeys: expandedLeadKeys,
            onExpand: (expanded, lead) => {
              setExpandedLeadKeys((keys) =>
                expanded
                  ? Array.from(new Set([...keys, lead.id]))
                  : keys.filter((key) => key !== lead.id),
              );
            },
            expandedRowRender: (lead) => (
              <div
                className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-inner md:grid-cols-2 xl:grid-cols-3"
                style={{ borderLeft: "3px solid #0a3750" }}
              >
                <DetailField label="Customer Name" value={displayText(lead.username)} />
                <DetailField label="Business Name" value={displayText(lead.businessName)} />
                <DetailField label="Business Type" value={displayText(lead.businessType)} />
                <DetailField label="Mobile" value={displayText(lead.mobile)} />
                <DetailField label="Alternate Mobile" value={displayText(lead.mobileAlt)} />
                <DetailField label="Email" value={displayText(lead.email)} />
                <DetailField label="Status" value={displayText(lead.status)} />
                <DetailField label="Priority" value={displayText(lead.priority)} />
                <DetailField label="Source" value={displayText(lead.source)} />
                <DetailField label="Assigned To" value={employeeName(lead.assignedTo)} />
                <DetailField label="Assigned By" value={employeeName(lead.assignedBy)} />
                <DetailField label="Last Updated" value={formatDateTime(lead.updatedDate)} />
                <DetailField label="Requirement" value={displayText(lead.requirement)} wide />
                <DetailField
                  label="Reason / Comments"
                  value={displayText(lead.comments, "No comments recorded")}
                  wide
                />
                <DetailField label="Remarks" value={displayText(lead.remarks)} wide />
                <DetailField
                  label="Tags"
                  value={
                    Array.isArray(lead.leadTag) && lead.leadTag.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {lead.leadTag.map((tag, idx) => (
                          <Tag key={`${tag}-${idx}`} color="blue" className="!rounded-full">
                            {tag}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      "No tags"
                    )
                  }
                  wide
                />
                <DetailField
                  label="Assignment History"
                  value={
                    lead.assignedHistory?.length
                      ? lead.assignedHistory
                          .map(
                            (entry) =>
                              `${employeeName(entry.assignTo)} · ${formatDateTime(entry.assignAt)}`,
                          )
                          .join("\n")
                      : "No assignment history"
                  }
                  wide
                />
              </div>
            ),
          }}
        />
      </Card>
    </div>
  );
}
