import { useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { LEAD_ACTIVITY_TYPES, PERMISSION_MASTER } from "@/shared/lib/constants";
import { usePermission } from "@/features/access-control";
import { useMessageApi } from "@/shared/hooks";
import { formatEmployeeName, toTitleCase } from "@/shared/utils/helperFunctions";
import {
  leadApi,
  type ActivitySummary,
  type LeadActivityItem,
} from "@/features/leads";

const { Title, Text } = Typography;
const { Option } = Select;

const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
};

export default function ActivityMonthlyPage() {
  const [activities, setActivities] = useState<LeadActivityItem[]>([]);
  const [summary, setSummary] = useState<ActivitySummary>({
    total: 0,
    done: 0,
    pending: 0,
    overdue: 0,
  });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>();
  const [mode, setMode] = useState<string>();
  const [type, setType] = useState<string>();
  const [assignedTo, setAssignedTo] = useState<string>();
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
  const [viewMode, setViewMode] = useState("table");
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id,
  );
  const teamTree = useSelector(
    (state: RootState) => state?.appState?.teamTreeData || [],
  );
  const { hasPermission } = usePermission();
  const messageApi = useMessageApi();
  const ACTIVITY_TYPES = Object.values(LEAD_ACTIVITY_TYPES);
  const getUserName = (id?: string) => {
    if (!id) return "-";
    const user = teamTree.find((t) => t.userProfileId === id);
    return formatEmployeeName(user?.userName);
  };

  useEffect(() => {
    if (!outletId) return;

    const abortController = new AbortController();
    setLoading(true);
    setLoadError(null);

    const timer = window.setTimeout(() => {
      void leadApi
        .getMonthlyActivities(
          {
            outletId,
            startDate: selectedMonth.startOf("month").valueOf(),
            endDate: selectedMonth.endOf("month").valueOf(),
            assignedTo,
            mode,
            search,
            status,
            type,
            limit: 30,
          },
          abortController.signal,
        )
        .then((result) => {
          setActivities(result.items);
          setNextCursor(result.nextCursor);
          if (result.summary) setSummary(result.summary);
        })
        .catch((error: unknown) => {
          if (abortController.signal.aborted) return;
          setActivities([]);
          setNextCursor(null);
          setLoadError(
            error instanceof Error ? error.message : "Unable to load activities",
          );
        })
        .finally(() => {
          if (!abortController.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [
    assignedTo,
    mode,
    outletId,
    reloadVersion,
    search,
    selectedMonth,
    status,
    type,
  ]);

  const loadMore = async () => {
    if (!outletId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await leadApi.getMonthlyActivities({
        outletId,
        startDate: selectedMonth.startOf("month").valueOf(),
        endDate: selectedMonth.endOf("month").valueOf(),
        assignedTo,
        mode,
        search,
        status,
        type,
        limit: 30,
        cursor: nextCursor,
      });
      setActivities((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (error: unknown) {
      messageApi.error(
        error instanceof Error ? error.message : "Unable to load more activities",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  // ----------------------
  //   STATUS COLORS
  // ----------------------
  const statusColor = (st: string) => {
    if (st === "DONE") return "green";
    if (st === "PENDING") return "orange";
    return "red";
  };

  const statusAccent = (st: string) => {
    if (st === "DONE") return "#389e0d";
    if (st === "PENDING") return "#d48806";
    return BRAND_RED;
  };

  // ----------------------
  // Update Status
  // ----------------------
  const updateStatus = async (
    activity: LeadActivityItem,
    newStatus: "PENDING" | "DONE",
  ) => {
    if (!outletId) return;
    try {
      await leadApi.updateActivity(outletId, activity.id, { status: newStatus });
      messageApi.success("Activity Status Updated Successfully..");
      setReloadVersion((value) => value + 1);
    } catch {
      messageApi.error("Failed to update activity status.");
    }
  };

  // ----------------------
  // Delete Activity
  // ----------------------
  const deleteActivity = async (activity: LeadActivityItem) => {
    if (!outletId) return;
    try {
      await leadApi.deleteActivity(outletId, activity.id);
      messageApi.success("Activity Deleted Successfully..");
      setReloadVersion((value) => value + 1);
    } catch {
      messageApi.error("Failed to delete activity.");
    }
  };

  const updateAssign = async (activity: LeadActivityItem, newUserId: string) => {
    if (!outletId) return;
    try {
      await leadApi.updateActivity(outletId, activity.id, {
        assignedTo: newUserId,
      });
      messageApi.success("Activity Assgined Successfully..");
      setReloadVersion((value) => value + 1);
    } catch {
      messageApi.error("Failed to assign activity.");
    }
  };

  // ----------------------
  //   KPIs
  // ----------------------
  const kpi = summary;

  const kpiCards = [
    {
      key: "total",
      label: "Total Activities",
      value: kpi.total,
      accent: BRAND_NAVY,
      icon: <FileTextOutlined />,
    },
    {
      key: "done",
      label: "Completed",
      value: kpi.done,
      accent: "#389e0d",
      icon: <CheckCircleOutlined />,
    },
    {
      key: "pending",
      label: "Pending",
      value: kpi.pending,
      accent: "#d48806",
      icon: <ClockCircleOutlined />,
    },
    {
      key: "overdue",
      label: "Overdue",
      value: kpi.overdue,
      accent: BRAND_RED,
      icon: <ExclamationCircleOutlined />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div
        className="mb-5 overflow-hidden rounded-xl shadow-sm"
        style={{ background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #124a6b 100%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <Title level={2} className="!mb-1 !text-white">
              Monthly Activity Overview
            </Title>
            <Text className="text-slate-200 !text-white">
              Track calls, meetings and follow-ups scheduled across the team.
            </Text>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        {kpiCards.map((card) => (
          <Card
            key={card.key}
            size="small"
            className="!rounded-xl border-0 shadow-sm"
            style={{ borderLeft: `4px solid ${card.accent}` }}
          >
            <div className="flex items-center justify-between">
              <div>
                <Text type="secondary" className="text-[13px] font-medium uppercase tracking-wide">
                  {card.label}
                </Text>
                <div className="mt-1 text-3xl font-semibold" style={{ color: card.accent }}>
                  {card.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                style={{ backgroundColor: `${card.accent}14`, color: card.accent }}
              >
                {card.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="mb-5 !rounded-xl border-0 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <Input
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="Search activities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <Select allowClear placeholder="Status" onChange={setStatus}>
            <Option value="PENDING">PENDING</Option>
            <Option value="DONE">DONE</Option>
          </Select>
          <Select
            allowClear
            showSearch
            placeholder="Assigned To"
            optionFilterProp="label"
            onChange={(v) => setAssignedTo(v)}
            options={teamTree?.map((u) => ({
              label: formatEmployeeName(u?.userName),
              value: u?.userProfileId,
            }))}
          />

          <Select allowClear placeholder="Mode" onChange={setMode}>
            <Option value="Online">Online</Option>
            <Option value="Offline">Offline</Option>
          </Select>

          <Select allowClear placeholder="Type" onChange={setType}>
            {ACTIVITY_TYPES.map((t) => (
              <Option key={t} value={t}>
                {t}
              </Option>
            ))}
          </Select>

          <DatePicker.MonthPicker
            allowClear={false}
            value={selectedMonth}
            onChange={(v) => setSelectedMonth(v!)}
            style={{ width: "100%" }}
            suffixIcon={<CalendarOutlined />}
          />
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <Segmented
            options={[
              { value: "table", label: "Table View" },
              { value: "timeline", label: "Timeline" },
            ]}
            value={viewMode}
            onChange={(v) => setViewMode(v as string)}
          />
          <Text type="secondary" className="text-[13px]">
            {activities.length} {activities.length === 1 ? "activity" : "activities"} loaded
          </Text>
        </div>
      </Card>

      {loadError && (
        <Alert
          className="mb-5 !rounded-xl"
          message="Unable to load activities"
          description={loadError}
          showIcon
          type="error"
        />
      )}

      <Card className="!rounded-xl border-0 shadow-sm">
        {/* TABLE VIEW */}
        {viewMode === "table" &&
          (loading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : activities.length === 0 ? (
            <Empty description="No activities found" />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Mode</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Scheduled</th>
                    <th className="px-4 py-3">Assigned To</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((rec) => {
                    const isToday = dayjs(rec.scheduledDate).isSame(dayjs(), "day");
                    const isPast = dayjs(rec.scheduledDate).isBefore(dayjs(), "day");
                    const leadName = toTitleCase(rec.leadName, "-");
                    return (
                      <tr key={rec.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              size={30}
                              style={{
                                backgroundColor: `${BRAND_NAVY}14`,
                                color: BRAND_NAVY,
                                fontSize: 12,
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              {getInitials(leadName === "-" ? "?" : leadName)}
                            </Avatar>
                            <Text strong className="text-slate-900">
                              {leadName}
                            </Text>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Tag color="blue" className="!rounded-full">
                            {rec.mode}
                          </Tag>
                        </td>
                        <td className="px-4 py-3">
                          <Tag color="purple" className="!rounded-full">
                            {rec.type}
                          </Tag>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            color={isToday ? "blue" : isPast ? "red" : "grey"}
                            text={
                              <span className="text-[13px]">
                                {dayjs(rec.scheduledDate).format("DD MMM, hh:mm A")}
                              </span>
                            }
                          />
                        </td>
                        <td className="px-4 py-3">
                          {hasPermission(PERMISSION_MASTER.CRM_ACTIVITY_EDIT) ? (
                            <Select
                              style={{ width: 210 }}
                              showSearch
                              value={rec.assignedTo || undefined}
                              onChange={(v) => updateAssign(rec, v)}
                              optionFilterProp="label"
                              options={teamTree.map((u) => ({
                                label: formatEmployeeName(u.userName),
                                value: u.userProfileId,
                              }))}
                            />
                          ) : (
                            <span>{getUserName(rec.assignedTo)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Select
                            disabled={!hasPermission(PERMISSION_MASTER.CRM_ACTIVITY_EDIT)}
                            value={rec.status}
                            onChange={(v: "PENDING" | "DONE") => updateStatus(rec, v)}
                            style={{ width: 150 }}
                          >
                            <Option value="PENDING">PENDING</Option>
                            <Option value="DONE">DONE</Option>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          {hasPermission(PERMISSION_MASTER.CRM_ACTIVITY_DELETE) && (
                            <Popconfirm title="Delete Activity" onConfirm={() => deleteActivity(rec)}>
                              <Tooltip title="Delete">
                                <Button danger icon={<DeleteOutlined />} type="text" />
                              </Tooltip>
                            </Popconfirm>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

        {/* TIMELINE VIEW */}
        {viewMode === "timeline" &&
          (loading ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : activities.length === 0 ? (
            <Empty description="No activities found" />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activities.map((act) => {
                const leadName = toTitleCase(act?.leadName, "-");
                return (
                  <Card
                    key={act.id}
                    size="small"
                    className="!rounded-xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md"
                    style={{ borderTop: `3px solid ${statusAccent(act.status)}` }}
                    styles={{ body: { padding: 14 } }}
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar
                        size={34}
                        style={{
                          backgroundColor: `${BRAND_NAVY}14`,
                          color: BRAND_NAVY,
                          fontSize: 13,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(leadName === "-" ? "?" : leadName)}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Tooltip title={leadName}>
                          <Text strong className="block text-[13.5px]" ellipsis>
                            {leadName}
                          </Text>
                        </Tooltip>
                        <Tag color={statusColor(act.status)} className="!m-0 !mt-0.5 !rounded-full !text-[11px]">
                          {act?.status}
                        </Tag>
                      </div>
                    </div>

                    <Text type="secondary" className="mt-2 block text-[12px]">
                      <ClockCircleOutlined className="mr-1" />
                      {dayjs(act?.scheduledDate).format("DD MMM YYYY, hh:mm A")}
                    </Text>

                    {act?.description ? (
                      <Tooltip title={act.description}>
                        <Text className="mt-2 block rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] leading-snug line-clamp-2">
                          {act.description}
                        </Text>
                      </Tooltip>
                    ) : null}

                    <Tag icon={<UserOutlined />} className="!mt-2 !w-fit !rounded-full !bg-slate-50 !text-[11px]">
                      {getUserName(act?.assignedTo)}
                    </Tag>
                  </Card>
                );
              })}
            </div>
          ))}

        {nextCursor && !loading && (
          <div className="mt-5 flex justify-center border-t border-slate-100 pt-4">
            <Button loading={loadingMore} onClick={() => void loadMore()}>
              Load more activities
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}