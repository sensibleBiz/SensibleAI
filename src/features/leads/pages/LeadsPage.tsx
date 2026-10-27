import {
  Layout,
  Card,
  Button,
  Badge,
  DatePicker,
  Space,
  Empty,
  Tabs,
  Select,
  Modal,
  Alert,
  Tag,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  MailOutlined,
  PhoneOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { Users, Sparkles, Zap, Award, XCircle, Repeat2 } from "lucide-react";
import { Typography, Avatar } from "antd";

import { useThemeMode, useNotificationApi, useCrmTerminology } from "@/shared/hooks";
import { LeadsManagement } from "../types/types";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs from "dayjs";
import { RootState } from "@/app/store";
import { useSelector } from "react-redux";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  LEAD_SOURCE,
  LEAD_STAGE,
  PERMISSION_MASTER,
  ROUTES_PATHS,
} from "@/shared/lib/constants";
import LeadsTaskModal from "./leads-task-modal";
import AddLeadForm from "./AddLeadForm";
import BulkLeadUploadModal from "./BulkLeadUploadModal";
import {
  formatEmployeeName,
  formatLeadSourceLabel,
  formatLeadStageLabel,
  playNewLeadSound,
  toTitleCase,
} from "@/shared/utils/helperFunctions";
import { Can } from "@/features/access-control";
import TodayFollowups from "./TodayFollowups";
import LeadCard from "./LeadCard";
import SpinLoader from "@/shared/components/SpinLoader";
import { CrmFilterBar, CrmMetricCard, CrmPageHeader } from "@/shared/components/ui";
import { leadApi, type LeadFunnelCounts, type LeadListFilters, type RepeatedEnquiryGroup, type RepeatedEnquiryResponse } from "../api/leadApi";
import { businessConfigurationApi } from "@/features/onboarding";
import type { BusinessPipelineStage } from "@/features/onboarding";
const { Content } = Layout;
const { RangePicker } = DatePicker;
const { Text } = Typography;
const REPEATED_ENQUIRIES_VIEW = "REPEATED_ENQUIRIES";
const UNASSIGNED_VIEW = "UNASSIGNED";
const LEADS_DASHBOARD_DESKTOP_WIDTH = 1360;
const LEAD_LIST_RESUME_REFRESH_MS = 60_000;
const LEAD_REPORT_RESUME_REFRESH_MS = 5 * 60_000;
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
};

const repeatedMatchLabels: Record<
  RepeatedEnquiryGroup["matchedOn"][number],
  string
> = {
  MOBILE: "Mobile",
  EMAIL: "Email",
  BUSINESS_PROFILE: "Business profile",
  BUSINESS_NAME: "Business name",
};

interface RepeatedEnquiryCardProps {
  group: RepeatedEnquiryGroup;
  onOpen: (group: RepeatedEnquiryGroup) => void;
  onViewLatest: (lead: LeadsManagement) => void;
}

const RepeatedEnquiryCard = ({
  group,
  onOpen,
  onViewLatest,
}: RepeatedEnquiryCardProps) => {
  const latest = group.enquiries[0];
  if (!latest) return null;

  const displayName = toTitleCase(
    latest.businessName || latest.username,
    "Unnamed enquiry",
  );

  return (
    <Card
      hoverable
      style={{
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        borderTop: `3px solid ${BRAND_RED}`,
        boxShadow: "0 2px 10px rgba(15, 23, 42, 0.06)",
      }}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Avatar
          size={36}
          style={{
            backgroundColor: `${BRAND_NAVY}14`,
            color: BRAND_NAVY,
            fontWeight: 600,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {getInitials(displayName)}
        </Avatar>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Text strong ellipsis style={{ display: "block", fontSize: 14.5 }}>
              {displayName}
            </Text>
            <Badge
              count={group.enquiries.length}
              overflowCount={99}
              style={{ backgroundColor: BRAND_RED, flexShrink: 0 }}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {dayjs(group.latestCreatedDate).format("DD MMM YYYY, hh:mm A")}
          </Text>
        </div>
      </div>

      <Space size={[4, 4]} wrap style={{ marginTop: 12 }}>
        {group.matchedOn.map((match) => (
          <Tag color="error" key={match} style={{ borderRadius: 999 }}>
            Same {repeatedMatchLabels[match]}
          </Tag>
        ))}
      </Space>

      <div
        style={{
          marginTop: 10,
          padding: "8px 10px",
          borderRadius: 8,
          background: "#f8fafc",
        }}
      >
        <Text style={{ display: "block", fontSize: 12.5 }}>
          <PhoneOutlined style={{ marginRight: 6, color: "#94a3b8" }} />
          {latest.mobile || "Mobile not available"}
        </Text>
        {latest.email && (
          <Text type="secondary" style={{ display: "block", fontSize: 12.5, marginTop: 2 }}>
            <MailOutlined style={{ marginRight: 6, color: "#94a3b8" }} />
            {latest.email}
          </Text>
        )}
      </div>

      <Space size={[4, 4]} wrap style={{ marginTop: 10 }}>
        {[...new Set(group.enquiries.map((lead) => lead.stage))].map((stage) => (
          <Tag color="blue" key={stage} style={{ borderRadius: 999 }}>
            {formatLeadStageLabel(stage)}
          </Tag>
        ))}
      </Space>

      <Space style={{ marginTop: 14 }} wrap>
        <Button
          type="primary"
          size="small"
          style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, borderRadius: 8 }}
          onClick={() => onOpen(group)}
        >
          View all enquiries
        </Button>
        <Button size="small" style={{ borderRadius: 8 }} onClick={() => onViewLatest(latest)}>
          Open latest
        </Button>
      </Space>
    </Card>
  );
};

const createCurrentLeadRange = (): [dayjs.Dayjs, dayjs.Dayjs] => {
  const today = dayjs();
  return [today.subtract(6, "day"), today];
};

const emptyLeadSummaryCounts = (): LeadFunnelCounts => ({
  totalLeads: 0,
  newLeads: 0,
  assigned: 0,
  followUp: 0,
  closedWon: 0,
  lost: 0,
  disqualified: 0,
});

const tabCountForStage = (
  stage: string,
  counts: LeadFunnelCounts,
  unassignedCount: number,
) => {
  if (counts.byStage && stage in counts.byStage) return counts.byStage[stage] ?? 0;
  switch (stage) {
    case LEAD_STAGE.NEW:
      return counts.newLeads;
    case UNASSIGNED_VIEW:
      return unassignedCount;
    case LEAD_STAGE.ASSIGNED:
      return counts.assigned;
    case LEAD_STAGE.FOLLOWUP:
      return counts.followUp;
    case LEAD_STAGE.WON:
      return counts.closedWon;
    case LEAD_STAGE.LOST:
      return counts.lost;
    case LEAD_STAGE.DISQUALIFIED:
      return counts.disqualified;
    default:
      return 0;
  }
};

interface LeadsPageProps {
  repeatedEnquiriesOnly?: boolean;
}

export default function Page({
  repeatedEnquiriesOnly = false,
}: LeadsPageProps) {
  const { isDark } = useThemeMode();
  const {
    pipelineTitle,
    newLeadAction,
    leadsLabel,
    customerLabel,
    getStageLabel,
    isExport,
  } = useCrmTerminology();
  const navigate = useNavigate();
  const { shareToken } = useParams<{ shareToken?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const sharedLeadId = searchParams.get("lead")?.trim() ?? "";
  const sharedLeadToken = shareToken?.trim() ?? "";
  const [loading, setLoading] = useState(!repeatedEnquiriesOnly);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [backgroundListRefreshVersion, setBackgroundListRefreshVersion] =
    useState(0);
  const [backgroundReportRefreshVersion, setBackgroundReportRefreshVersion] =
    useState(0);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(
    createCurrentLeadRange,
  );
  const [leads, setLeads] = useState<LeadsManagement[]>([]);
  const [pipelineStages, setPipelineStages] = useState<BusinessPipelineStage[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadsManagement | null>(
    null
  );
  const [selectedRepeatedGroup, setSelectedRepeatedGroup] =
    useState<RepeatedEnquiryGroup | null>(null);
  const [repeatedEnquiries, setRepeatedEnquiries] =
    useState<RepeatedEnquiryResponse | null>(null);
  const [repeatedLoading, setRepeatedLoading] = useState(false);
  const [repeatedError, setRepeatedError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [, setActiveFilter] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastListRequestAtRef = useRef(0);
  const lastReportRefreshAtRef = useRef(Date.now());
  const loadedQueryKeyRef = useRef("");
  const knownLeadIdsRef = useRef<Set<string>>(new Set());
  const dateRangeRef = useRef(dateRange);
  const followsCurrentDayRef = useRef(true);
  const dashboardViewportRef = useRef<HTMLDivElement>(null);
  const dashboardCanvasRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState("");
  const [activeStage, setActiveStage] = useState<string>(
    repeatedEnquiriesOnly ? REPEATED_ENQUIRIES_VIEW : LEAD_STAGE.NEW,
  );
  const [summaryStats, setSummaryStats] = useState<LeadFunnelCounts>(
    emptyLeadSummaryCounts
  );
  const [unassignedCount, setUnassignedCount] = useState(0);
  const notificationApi = useNotificationApi();
  const [filters, setFilters] = useState({
    assignedTo: "",
    enquiryType: "" as "" | "CUSTOMER_ENQUIRY",
    source: "",
    search: "",
  });
  const sourceList = Object.values(LEAD_SOURCE);
  const hasUnassignedDateRange = dateRange[0]
    .startOf("day")
    .isBefore(dateRange[1].startOf("day"));
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id
  );
  const [activeVertical, setActiveVertical] = useState<string | null>(null);

  useEffect(() => {
    if (!outletId || repeatedEnquiriesOnly) {
      setPipelineStages([]);
      setActiveVertical(null);
      return;
    }

    const abortController = new AbortController();
    setPipelineStages([]);
    setActiveVertical(null);
    void businessConfigurationApi.get(outletId, abortController.signal)
      .then((configuration) => {
        if (abortController.signal.aborted) return;
        const stages = configuration.pipelineStages ?? [];
        setPipelineStages(stages);
        setActiveVertical(configuration.vertical);
        const activeKeys = new Set(stages.map((stage) => stage.stageKey.toUpperCase()));
        setActiveStage((current) => activeKeys.has(current)
          ? current
          : stages.find((stage) => stage.isDefault)?.stageKey.toUpperCase() ??
            stages[0]?.stageKey.toUpperCase() ??
            LEAD_STAGE.NEW);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const description = error instanceof Error
          ? error.message
          : "Unable to load the business pipeline configuration.";
        notificationApi.error({
          message: "Unable to load pipeline stages",
          description,
        });
      });

    return () => abortController.abort();
  }, [notificationApi, outletId, repeatedEnquiriesOnly]);

  const exportVertical = activeVertical?.toLowerCase().includes("export") ?? isExport;

  useLayoutEffect(() => {
    const viewport = dashboardViewportRef.current;
    const canvas = dashboardCanvasRef.current;
    if (!viewport || !canvas) return;

    let animationFrame = 0;

    const fitDashboard = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const availableWidth = viewport.clientWidth;
        if (!availableWidth) return;

        const scale = Math.min(
          1,
          availableWidth / LEADS_DASHBOARD_DESKTOP_WIDTH,
        );
        const shouldScale = scale < 1;

        canvas.style.width = shouldScale
          ? `${LEADS_DASHBOARD_DESKTOP_WIDTH}px`
          : "100%";
        canvas.style.transform = shouldScale ? `scale(${scale})` : "none";
        viewport.style.height = shouldScale
          ? `${Math.ceil(canvas.scrollHeight * scale)}px`
          : "auto";
        viewport.dataset.scaled = shouldScale ? "true" : "false";
      });
    };

    const resizeObserver = new ResizeObserver(fitDashboard);
    resizeObserver.observe(viewport);
    resizeObserver.observe(canvas);
    fitDashboard();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [loading]);

  useEffect(() => {
    if (!outletId || (!sharedLeadToken && !sharedLeadId)) return;

    const abortController = new AbortController();
    const leadRequest = sharedLeadToken
      ? leadApi.getSharedLead(outletId, sharedLeadToken, abortController.signal)
      : leadApi.getLead(outletId, sharedLeadId, abortController.signal);
    void leadRequest
      .then((lead) => setSelectedLead(lead))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const description =
          error instanceof Error ? error.message : "Unable to open the shared lead";
        notificationApi.error({
          message: "Unable to open shared lead",
          description,
        });
      });

    return () => abortController.abort();
  }, [notificationApi, outletId, sharedLeadId, sharedLeadToken]);
  const teamTreeData = useSelector(
    (state: RootState) => state.appState.teamTreeData
  );
  const assignedList = useMemo(
    () =>
      (teamTreeData ?? [])
        .filter((member) => member.department === "SALES" && member.isActive)
        .sort((first, second) =>
          first.userName.localeCompare(second.userName)
        ),
    [teamTreeData]
  );
  const assignedEmployeeNameById = useMemo(
    () =>
      new Map(
        assignedList.map((member) => [
          member.userProfileId.toLowerCase(),
          formatEmployeeName(member.userName),
        ])
      ),
    [assignedList]
  );
  // Group only the paginated leads loaded for the visible tab cards.
  const groupedLeads = useMemo(() => {
    const grouped: Record<string, LeadsManagement[]> = {};
    pipelineStages.forEach((stage) => {
      grouped[stage.stageKey.toUpperCase()] = [];
    });

    // ✅ Single loop - O(n) instead of multiple O(n) loops
    for (const lead of leads) {
      const stageUpper = lead.stage?.toUpperCase();

      // Add to grouped leads
      if (stageUpper && grouped[stageUpper]) {
        grouped[stageUpper].push(lead);
      }

    }

    return grouped;
  }, [leads, pipelineStages]);

  const buildListFilters = useCallback(
    (cursor?: string): LeadListFilters => {
      const search = filters.search.trim();
      const splitNewLeads = !search && activeStage === LEAD_STAGE.NEW;
      const showUnassigned = !search && activeStage === UNASSIGNED_VIEW;
      const selectedDayStart = dateRange[1].startOf("day");

      return {
        outletId,
        startDate: splitNewLeads
          ? selectedDayStart.valueOf()
          : dateRange[0].startOf("day").valueOf(),
        endDate: showUnassigned
          ? selectedDayStart.subtract(1, "millisecond").valueOf()
          : dateRange[1].endOf("day").valueOf(),
        stage: search
          ? undefined
          : activeStage === UNASSIGNED_VIEW
            ? LEAD_STAGE.NEW
            : activeStage,
        assignedTo: filters.assignedTo || undefined,
        unassigned: showUnassigned || undefined,
        enquiryType: filters.enquiryType || undefined,
        source: filters.source || undefined,
        search: search || undefined,
        limit: 30,
        cursor,
      };
    },
    [
      activeStage,
      dateRange,
      filters.assignedTo,
      filters.enquiryType,
      filters.search,
      filters.source,
      outletId,
    ]
  );

  useEffect(() => {
    if (repeatedEnquiriesOnly) {
      setSummaryStats(emptyLeadSummaryCounts());
      setUnassignedCount(0);
      return;
    }

    if (!outletId) {
      setSummaryStats(emptyLeadSummaryCounts());
      setUnassignedCount(0);
      return;
    }

    const abortController = new AbortController();
    const commonFilters = {
      outletId,
      assignedTo: filters.assignedTo || undefined,
      source: filters.source || undefined,
    };

    void Promise.all([
      leadApi.getStageCounts(
        {
          ...commonFilters,
          startDate: dateRange[0].startOf("day").valueOf(),
          endDate: dateRange[1].endOf("day").valueOf(),
        },
        abortController.signal,
      ),
      leadApi.getStageCounts(
        {
          ...commonFilters,
          startDate: dateRange[1].startOf("day").valueOf(),
          endDate: dateRange[1].endOf("day").valueOf(),
        },
        abortController.signal,
      ),
    ])
      .then(([rangeCounts, selectedDayCounts]) => {
        setSummaryStats({
          ...rangeCounts,
          newLeads: selectedDayCounts.newLeads,
        });
        setUnassignedCount(
          Math.max(0, rangeCounts.newLeads - selectedDayCounts.newLeads),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Failed to load lead summary counts:", error);
        setSummaryStats(emptyLeadSummaryCounts());
        setUnassignedCount(0);
      });

    return () => abortController.abort();
  }, [
    dateRange,
    filters.assignedTo,
    filters.source,
    outletId,
    refreshVersion,
    backgroundReportRefreshVersion,
    repeatedEnquiriesOnly,
  ]);

  useEffect(() => {
    if (!outletId || activeStage !== REPEATED_ENQUIRIES_VIEW) {
      setRepeatedEnquiries(null);
      setRepeatedLoading(false);
      return;
    }

    const abortController = new AbortController();
    setRepeatedLoading(true);
    setRepeatedError(null);

    void leadApi
      .getRepeatedEnquiries(
        {
          outletId,
          startDate: dateRange[0].startOf("day").valueOf(),
          endDate: dateRange[1].endOf("day").valueOf(),
          assignedTo: filters.assignedTo || undefined,
          enquiryType: filters.enquiryType || undefined,
          source: filters.source || undefined,
          search: filters.search.trim() || undefined,
          limit: 50,
        },
        abortController.signal,
      )
      .then(setRepeatedEnquiries)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load repeated enquiries";
        setRepeatedError(message);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setRepeatedLoading(false);
        }
      });

    return () => abortController.abort();
  }, [
    dateRange,
    filters.assignedTo,
    filters.enquiryType,
    filters.search,
    filters.source,
    outletId,
    refreshVersion,
    backgroundReportRefreshVersion,
    activeStage,
  ]);

  useEffect(() => {
    if (activeStage === REPEATED_ENQUIRIES_VIEW) {
      setLoading(false);
      setNextCursor(null);
      return;
    }
    if (
      activeStage === UNASSIGNED_VIEW &&
      !filters.search.trim() &&
      !hasUnassignedDateRange
    ) {
      setLeads([]);
      setNextCursor(null);
      setLoading(false);
      return;
    }
    if (!outletId) {
      setLeads([]);
      setNextCursor(null);
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    const requestedFilters = buildListFilters();
    const queryKey = JSON.stringify(requestedFilters);
    setLoading(true);
    setLoadError(null);
    setNextCursor(null);
    lastListRequestAtRef.current = Date.now();

    void leadApi
      .getLeads(requestedFilters, abortController.signal)
      .then((result) => {
        const currentIds = new Set(result.items.map((lead) => lead.id));
        if (loadedQueryKeyRef.current === queryKey) {
          result.items.forEach((lead) => {
            if (
              !knownLeadIdsRef.current.has(lead.id) &&
              lead.stage?.toUpperCase() === LEAD_STAGE.NEW
            ) {
              playNewLeadSound();
              notificationApi.open({
                message: "New Lead Arrived",
                description: `${toTitleCase(lead.username, "Lead")} (${lead.mobile})`,
                placement: "topRight",
                duration: 15,
                style: { borderLeft: "4px solid #52c41a" },
              });
            }
          });
        }
        loadedQueryKeyRef.current = queryKey;
        knownLeadIdsRef.current = currentIds;
        setLeads(result.items);
        setNextCursor(result.nextCursor);
        if (requestedFilters.search && result.items[0]?.stage) {
          const matchedStage = result.items[0].stage.toUpperCase();
          if (matchedStage !== activeStage) {
            setActiveStage(matchedStage);
          }
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message =
          error instanceof Error ? error.message : "Unable to load leads";
        setLeads([]);
        setLoadError(message);
        notificationApi.error({
          message: "Unable to load leads",
          description: message,
        });
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });


    return () => abortController.abort();
  }, [
    activeStage,
    buildListFilters,
    filters.search,
    hasUnassignedDateRange,
    notificationApi,
    outletId,
    refreshVersion,
    backgroundListRefreshVersion,
  ]);

  useEffect(() => {
    const syncCurrentDayRange = () => {
      if (
        !followsCurrentDayRef.current ||
        document.visibilityState !== "visible"
      ) {
        return false;
      }

      const today = dayjs();
      if (dateRangeRef.current[1].isSame(today, "day")) return false;

      const nextRange = createCurrentLeadRange();
      lastListRequestAtRef.current = Date.now();
      dateRangeRef.current = nextRange;
      setDateRange(nextRange);
      return true;
    };

    const refreshOnResume = () => {
      if (document.visibilityState !== "visible") return;
      if (syncCurrentDayRange()) return;

      const requestAge = Date.now() - lastListRequestAtRef.current;
      if (requestAge >= LEAD_LIST_RESUME_REFRESH_MS) {
        lastListRequestAtRef.current = Date.now();
        setBackgroundListRefreshVersion((version) => version + 1);
      }

      const reportAge = Date.now() - lastReportRefreshAtRef.current;
      if (reportAge >= LEAD_REPORT_RESUME_REFRESH_MS) {
        lastReportRefreshAtRef.current = Date.now();
        setBackgroundReportRefreshVersion((version) => version + 1);
      }
    };

    const dayBoundaryTimer = window.setInterval(syncCurrentDayRange, 60_000);
    window.addEventListener("focus", refreshOnResume);
    document.addEventListener("visibilitychange", refreshOnResume);

    return () => {
      window.clearInterval(dayBoundaryTimer);
      window.removeEventListener("focus", refreshOnResume);
      document.removeEventListener("visibilitychange", refreshOnResume);
    };
  }, []);

  // ✅ Optimized handlers with useCallback
  const onDateRangeChange = useCallback((dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    if (dates?.[0] && dates[1]) {
      const nextRange: [dayjs.Dayjs, dayjs.Dayjs] = [dates[0], dates[1]];
      followsCurrentDayRef.current = false;
      dateRangeRef.current = nextRange;
      setDateRange(nextRange);
    }
  }, []);

  const handleFilterChange = useCallback((key: string, value?: string) => {
    const nextValue = value ?? "";
    setFilters((prev) => ({ ...prev, [key]: nextValue }));
    if (
      key === "assignedTo" &&
      nextValue &&
      activeStage !== REPEATED_ENQUIRIES_VIEW
    ) {
      setActiveStage(LEAD_STAGE.ASSIGNED);
    }
  }, [activeStage]);

  const handleReset = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearchInput("");
    setFilters({
      assignedTo: "",
      enquiryType: "",
      source: "",
      search: "",
    });
    setRefreshVersion((version) => version + 1);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, search: value.trim() }));
    }, 500);
  }, []);

  useEffect(
    () => () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    },
    []
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !nextCursor) return;

    setLoadingMore(true);
    setLoadError(null);
    try {
      const result = await leadApi.getLeads(buildListFilters(nextCursor));
      setLeads((currentLeads) => {
        const existingIds = new Set(currentLeads.map((lead) => lead.id));
        return [
          ...currentLeads,
          ...result.items.filter((lead) => !existingIds.has(lead.id)),
        ];
      });
      setNextCursor(result.nextCursor);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to load more leads";
      setLoadError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [buildListFilters, loadingMore, nextCursor]);

  const handleViewLead = useCallback((lead: LeadsManagement) => {
    setSelectedLead(lead);
  }, []);

  const handleCloseSelectedLead = useCallback(() => {
    setSelectedLead(null);
    setRefreshVersion((version) => version + 1);
    if (sharedLeadToken) {
      navigate(ROUTES_PATHS.LEADS_MANAGEMENT, { replace: true });
      return;
    }
    if (!sharedLeadId) return;

    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("lead");
        return next;
      },
      { replace: true },
    );
  }, [navigate, setSearchParams, sharedLeadId, sharedLeadToken]);

  const handleStageChange = useCallback((stage: string) => {
    setActiveStage(stage);
    if (stage === UNASSIGNED_VIEW) {
      setFilters((current) => ({ ...current, assignedTo: "" }));
    }
  }, []);

  const handleAddModalChange = useCallback(
    (value: React.SetStateAction<boolean>) => {
      if (typeof value === "boolean") {
        setModalOpen(value);
        if (!value) setRefreshVersion((version) => version + 1);
        return;
      }
      setModalOpen(value);
    },
    []
  );

  const handleBulkImported = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const currentRange = createCurrentLeadRange();
    followsCurrentDayRef.current = true;
    dateRangeRef.current = currentRange;
    setDateRange(currentRange);
    setSearchInput("");
    setFilters({ assignedTo: "", enquiryType: "", source: "", search: "" });
    setActiveStage(LEAD_STAGE.NEW);
    setRefreshVersion((version) => version + 1);
  }, []);

  // ✅ Memoized tab items - only recreate when groupedLeads changes
  const tabItems = useMemo(() => {
    const tabStages = pipelineStages.flatMap((pipelineStage) => {
      const stage = pipelineStage.stageKey.toUpperCase();
      return stage === LEAD_STAGE.NEW ? [stage, UNASSIGNED_VIEW] : [stage];
    });
    const stageByKey = new Map(
      pipelineStages.map((stage) => [stage.stageKey.toUpperCase(), stage]),
    );

    const stageItems = tabStages.map((stage: string) => {
      const configuredStage = stageByKey.get(stage);
      const displayedLeads =
        groupedLeads[
          stage === UNASSIGNED_VIEW ? LEAD_STAGE.NEW : stage
        ] ?? [];

      return {
        key: stage,
        label: (
          <div className="flex items-center gap-2">
            <span style={{ fontWeight: 600 }}>
              {stage === UNASSIGNED_VIEW
                ? `Unassigned ${leadsLabel}`
                : configuredStage?.displayName ??
                  getStageLabel(stage, formatLeadStageLabel(stage))}
            </span>
            <Badge
              count={
                stage === UNASSIGNED_VIEW
                  ? unassignedCount
                  : tabCountForStage(stage, summaryStats, unassignedCount) ||
                    displayedLeads.length
              }
              overflowCount={9999}
              showZero
              style={{ backgroundColor: configuredStage?.tabColor || "#E63946" }}
            />
          </div>
        ),
        children: (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
              padding: "12px 0",
              overflowY: "auto",
            }}
          >
            {displayedLeads.length ? (
              displayedLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onView={handleViewLead}
                  assignedEmployeeName={
                    lead.assignedTo
                      ? assignedEmployeeNameById.get(
                          lead.assignedTo.toLowerCase(),
                        ) ?? lead.assignedTo
                      : undefined
                  }
                  isExport={exportVertical}
                />
              ))
            ) : (
              <div className="flex justify-center items-center">
                <Empty
                  description={
                    stage === UNASSIGNED_VIEW
                      ? "No earlier unassigned leads"
                      : "No Leads in this stage"
                  }
                />
              </div>
            )}
          </div>
        ),
      };
    });

    const repeatedEnquiriesItem = {
        key: REPEATED_ENQUIRIES_VIEW,
        label: (
          <div className="flex items-center gap-2">
            <Repeat2 size={16} />
            <span style={{ fontWeight: 600 }}>Repeated Enquiries</span>
            <Badge
              count={repeatedEnquiries?.totalGroups ?? 0}
              overflowCount={9999}
              showZero
              style={{ backgroundColor: "#fa8c16" }}
            />
          </div>
        ),
        children: repeatedLoading ? (
          <SpinLoader loading height={220} />
        ) : repeatedError ? (
          <Alert
            message="Unable to load repeated enquiries"
            description={repeatedError}
            showIcon
            type="error"
          />
        ) : repeatedEnquiries?.groups.length ? (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "14px 18px",
                borderRadius: 12,
                marginBottom: 16,
                background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #124a6b 100%)`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Repeat2 size={20} color="#fff" />
                </div>
                <div>
                  <Text style={{ color: "#fff", fontWeight: 600, fontSize: 14.5, display: "block" }}>
                    {repeatedEnquiries.totalGroups} repeated groups &middot; {repeatedEnquiries.totalEnquiries} enquiries
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12.5 }}>
                    Grouped by shared mobile, email, business profile, or business name. Won, Lost, and Disqualified enquiries stay visible.
                  </Text>
                </div>
              </div>
            </div>
            {repeatedEnquiries.truncated && (
              <Alert
                message="Showing the latest 50 groups. Narrow the date range or use filters to see a smaller result."
                style={{ marginBottom: 16, borderRadius: 10 }}
                type="info"
                showIcon
              />
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 16,
                padding: "12px 0",
              }}
            >
              {repeatedEnquiries.groups.map((group) => (
                <RepeatedEnquiryCard
                  group={group}
                  key={group.id}
                  onOpen={setSelectedRepeatedGroup}
                  onViewLatest={handleViewLead}
                />
              ))}
            </div>
          </>
        ) : (
          <Empty description="No repeated enquiries in this date range" />
        ),
      };

    return repeatedEnquiriesOnly ? [repeatedEnquiriesItem] : stageItems;
  }, [
    assignedEmployeeNameById,
    exportVertical,
    getStageLabel,
    groupedLeads,
    handleViewLead,
    leadsLabel,
    pipelineStages,
    repeatedEnquiries,
    repeatedError,
    repeatedLoading,
    repeatedEnquiriesOnly,
    summaryStats,
    unassignedCount,
  ]);

  if (loading && loadedQueryKeyRef.current === "") {
    return <SpinLoader loading={loading} />;
  }

  const summaryPercent = (value: number) =>
    summaryStats.totalLeads > 0
      ? Math.round((value / summaryStats.totalLeads) * 100)
      : 0;
  const conversionRate = summaryPercent(summaryStats.closedWon);

  return (
    <div className="leads-dashboard-viewport" ref={dashboardViewportRef}>
    <Layout
      className="layout leads-dashboard-canvas"
      ref={dashboardCanvasRef}
      style={{
        minHeight: "100vh",
        background: isDark ? "#141414" : "#f8fafc",
        display: "flex",
        flexDirection: "row",
      }}
    >
      <Content className="leads-page-content" style={{ padding: "32px 24px", width: repeatedEnquiriesOnly ? "100%" : "85%", maxWidth: "1600px", margin: "0 auto" }}>
        {/* Header Section */}
        <CrmPageHeader
          title={repeatedEnquiriesOnly ? `Repeated ${leadsLabel}` : pipelineTitle}
          subtitle={
            repeatedEnquiriesOnly
              ? `Find enquiries that share ${customerLabel.toLowerCase()} or business details`
              : `Track and manage your ${leadsLabel.toLowerCase()} through the sales pipeline`
          }
          extra={
            <Space className="leads-page-header-actions" size="middle" wrap>
              <RangePicker
                value={dateRange}
                onChange={onDateRangeChange}
                format="DD MMM, YYYY"
                allowClear={false}
                disabledDate={(current) => current && current > dayjs()}
              />
              {!repeatedEnquiriesOnly && (
                <Can permission={PERMISSION_MASTER.CRM_LEADS_CREATE}>
                  <Button
                    icon={<UploadOutlined />}
                    onClick={() => setBulkUploadOpen(true)}
                  >
                    Bulk Upload
                  </Button>
                </Can>
              )}
              {!repeatedEnquiriesOnly && (
                <Can permission={PERMISSION_MASTER.CRM_LEADS_CREATE}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setModalOpen(true)}
                  >
                    {newLeadAction}
                  </Button>
                </Can>
              )}
            </Space>
          }
        />

        {/* Filter Bar */}
        <CrmFilterBar
          searchValue={searchInput}
          onSearchChange={handleSearch}
          searchPlaceholder="Search name, mobile, business or email"
          searchWidth={280}
          activeFilterCount={
            [
              filters.assignedTo,
              filters.enquiryType,
              filters.source,
              filters.search,
            ].filter(Boolean).length
          }
          onReset={handleReset}
        >
          <Select
            showSearch
            allowClear
            placeholder="Assigned To"
            style={{ width: 190 }}
            value={filters?.assignedTo || undefined}
            optionFilterProp="label"
            onChange={(value) => {
              handleFilterChange("assignedTo", value);
              setActiveFilter(value ? "assignedTo" : null);
            }}
            onFocus={() => setActiveFilter("assignedTo")}
            onBlur={() => setActiveFilter(null)}
            options={assignedList?.map((n) => ({
              label: formatEmployeeName(n.userName),
              value: n.userProfileId,
            }))}
          />
          <Select
            showSearch
            allowClear
            placeholder="Source"
            style={{ width: 180 }}
            value={filters?.source || undefined}
            onChange={(value) => {
              handleFilterChange("source", value);
              setActiveFilter(value ? "source" : null);
            }}
            onFocus={() => setActiveFilter("source")}
            onBlur={() => setActiveFilter(null)}
            options={sourceList.map((s) => ({
              label: formatLeadSourceLabel(s),
              value: s,
            }))}
          />
          <Select
            allowClear
            placeholder="Enquiry Type"
            style={{ width: 220 }}
            value={filters.enquiryType || undefined}
            onChange={(value: "CUSTOMER_ENQUIRY" | undefined) => {
              handleFilterChange("enquiryType", value);
              setActiveFilter(value ? "enquiryType" : null);
            }}
            onFocus={() => setActiveFilter("enquiryType")}
            onBlur={() => setActiveFilter(null)}
            options={[
              {
                label: "Existing Customer Enquiries",
                value: "CUSTOMER_ENQUIRY",
              },
            ]}
          />
        </CrmFilterBar>

        {loadError && (
          <Alert
            action={
              <Button
                size="small"
                onClick={() => setRefreshVersion((version) => version + 1)}
              >
                Retry
              </Button>
            }
            closable
            message={loadError}
            showIcon
            style={{ marginBottom: 20, borderRadius: 10 }}
            type="error"
          />
        )}

        {/* Statistics Section */}
        <div
          className="leads-page-summary-grid"
          style={{
            display: repeatedEnquiriesOnly ? "none" : "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "20px",
          }}
        >
          {[
            {
              key: "total",
              label: `Total ${leadsLabel}`,
              value: summaryStats.totalLeads,
              percent: summaryStats.totalLeads > 0 ? 100 : 0,
              accent: "#2563eb",
              icon: <Users size={20} />,
            },
            {
              key: "new",
              label: `New ${leadsLabel}`,
              value: summaryStats.newLeads,
              percent: summaryPercent(summaryStats.newLeads),
              accent: "#7c3aed",
              icon: <Sparkles size={20} />,
            },
            {
              key: "followup",
              label: "Follow Up",
              value: summaryStats.followUp,
              percent: summaryPercent(summaryStats.followUp),
              accent: "#d97706",
              icon: <Zap size={20} />,
            },
            {
              key: "won",
              label: "Won",
              value: summaryStats.closedWon,
              percent: conversionRate,
              accent: "#16a34a",
              icon: <Award size={20} />,
            },
            {
              key: "lost",
              label: "Lost",
              value: summaryStats.lost,
              percent: summaryPercent(summaryStats.lost),
              accent: "#dc2626",
              icon: <XCircle size={20} />,
            },
          ].map((stat) => (
            <CrmMetricCard
              key={stat.key}
              title={stat.label}
              value={stat.value}
              icon={stat.icon}
              iconColor={stat.accent}
              iconBg={`${stat.accent}14`}
              progressPercent={stat.percent}
              progressColor={stat.accent}
            />
          ))}
        </div>

        {/* Pipeline Columns */}
        <Card
            className="leads-page-pipeline !rounded-xl border-0 shadow-sm"
            styles={{ body: { padding: 24 } }}
          >
            <Tabs
              activeKey={activeStage}
              onChange={handleStageChange}
              type="card"
              tabPosition="top"
              size="large"
              tabBarGutter={12}
              animated
              items={tabItems}
              style={{
                background: "transparent",
              }}
              tabBarStyle={{
                margin: "0 0 18px 0",
                fontWeight: 600,
              }}
            />
            {activeStage !== REPEATED_ENQUIRIES_VIEW && nextCursor && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Button loading={loadingMore} onClick={handleLoadMore}>
                  Load more leads
                </Button>
              </div>
            )}
          </Card>
      </Content>

      {!repeatedEnquiriesOnly && (
        <div
          className="leads-page-aside"
          style={{
            width: "15%",
          }}
        >
          <TodayFollowups />
        </div>
      )}
      <Modal
        title="Add New Enquiry"
        width={"50%"}
        open={modalOpen}
        footer={null}
        onOk={() => handleAddModalChange(false)}
        onCancel={() => handleAddModalChange(false)}
      >
        {modalOpen && (
          <AddLeadForm setModalOpen={handleAddModalChange} />
        )}
      </Modal>

      <BulkLeadUploadModal
        open={bulkUploadOpen}
        outletId={outletId}
        onClose={() => setBulkUploadOpen(false)}
        onImported={handleBulkImported}
      />

      <Modal
        title={
          selectedRepeatedGroup
            ? `Repeated enquiries (${selectedRepeatedGroup.enquiries.length})`
            : "Repeated enquiries"
        }
        width={960}
        open={Boolean(selectedRepeatedGroup)}
        footer={null}
        onCancel={() => setSelectedRepeatedGroup(null)}
      >
        {selectedRepeatedGroup && (
          <>
            <Space size={[4, 4]} wrap style={{ marginBottom: 16 }}>
              {selectedRepeatedGroup.matchedOn.map((match) => (
                <Tag color="error" key={match} style={{ borderRadius: 999 }}>
                  Same {repeatedMatchLabels[match]}
                </Tag>
              ))}
            </Space>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 16,
                maxHeight: "65vh",
                overflowY: "auto",
              }}
            >
              {selectedRepeatedGroup.enquiries.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  isExport={exportVertical}
                  assignedEmployeeName={
                    lead.assignedTo
                      ? assignedEmployeeNameById.get(
                          lead.assignedTo.toLowerCase(),
                        ) ?? lead.assignedTo
                      : undefined
                  }
                  onView={(selected) => {
                    setSelectedRepeatedGroup(null);
                    handleViewLead(selected);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </Modal>

      {selectedLead && (
        <LeadsTaskModal
          lead={selectedLead}
          onClose={handleCloseSelectedLead}
        />
      )}
    </Layout>
    </div>
  );
}
