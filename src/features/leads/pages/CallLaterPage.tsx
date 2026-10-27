import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  ExclamationCircleFilled,
  PhoneOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  WhatsAppOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { useSelector } from "react-redux";

import { useMessageApi } from "@/shared/hooks";
import { usePermission } from "@/features/access-control";
import type { LeadsManagement } from "../types/types";
import type { RootState } from "@/app/store";
import { leadApi, type LeadActivityItem } from "../api/leadApi";
import { PERMISSION_MASTER } from "@/shared/lib/constants";
import { formatEmployeeName, toTitleCase } from "@/shared/utils/helperFunctions";
import LeadsTaskModal from "./leads-task-modal";

const { Text, Title } = Typography;

const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

const CALLBACK_RANGE_START = Date.parse("2020-01-01T00:00:00+05:30");
const CALLBACK_RANGE_END = Date.parse("2100-12-31T23:59:59+05:30");

type CallbackGroup = "overdue" | "today" | "upcoming";

const groupDetails: Record<
  CallbackGroup,
  { accent: string; badgeColor: string; empty: string; title: string }
> = {
  overdue: {
    accent: BRAND_RED,
    badgeColor: "error",
    empty: "No overdue callbacks",
    title: "Overdue",
  },
  today: {
    accent: "#d48806",
    badgeColor: "warning",
    empty: "No callbacks scheduled for today",
    title: "Today",
  },
  upcoming: {
    accent: BRAND_NAVY,
    badgeColor: "processing",
    empty: "No upcoming callbacks",
    title: "Upcoming",
  },
};

const normalizeWhatsAppNumber = (mobile: string) => {
  const digits = mobile.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
};

export default function CallLaterPage() {
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id,
  );
  const teamTree = useSelector(
    (state: RootState) => state.appState.teamTreeData || [],
  );
  const messageApi = useMessageApi();
  const { hasPermission } = usePermission();
  const canEdit = hasPermission(PERMISSION_MASTER.CRM_ACTIVITY_EDIT);

  const [activities, setActivities] = useState<LeadActivityItem[]>([]);
  const [activeGroup, setActiveGroup] = useState<CallbackGroup>("today");
  const [assignedTo, setAssignedTo] = useState<string>();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [rescheduleActivity, setRescheduleActivity] =
    useState<LeadActivityItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<Dayjs | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadsManagement | null>(null);
  const [openingLeadId, setOpeningLeadId] = useState<string | null>(null);

  const salesEmployees = useMemo(
    () =>
      teamTree
        .filter((member) => member.department === "SALES" && member.isActive)
        .sort((left, right) => left.userName.localeCompare(right.userName)),
    [teamTree],
  );

  const getEmployeeName = useCallback(
    (userId: string) =>
      formatEmployeeName(
        teamTree.find((member) => member.userProfileId === userId)?.userName,
        "Unassigned",
      ),
    [teamTree],
  );

  const loadCallbacks = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      if (!outletId) {
        setActivities([]);
        setLoading(false);
        return;
      }

      if (cursor) setLoadingMore(true);
      else setLoading(true);
      if (!cursor) setLoadError(null);

      try {
        const result = await leadApi.getMonthlyActivities(
          {
            outletId,
            startDate: CALLBACK_RANGE_START,
            endDate: CALLBACK_RANGE_END,
            assignedTo,
            search: search || undefined,
            status: "PENDING",
            type: "Follow Up",
            limit: 100,
            cursor,
          },
          signal,
        );
        setActivities((current) =>
          cursor ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message =
          error instanceof Error ? error.message : "Unable to load callbacks";
        if (!cursor) {
          setActivities([]);
          setNextCursor(null);
          setLoadError(message);
        }
        messageApi.error(message);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [assignedTo, messageApi, outletId, search],
  );

  useEffect(() => {
    const abortController = new AbortController();
    const timer = window.setTimeout(() => {
      void loadCallbacks(undefined, abortController.signal);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [loadCallbacks, reloadVersion]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const groupedCallbacks = useMemo(() => {
    const todayStart = dayjs().startOf("day");
    const todayEnd = dayjs().endOf("day");
    const groups: Record<CallbackGroup, LeadActivityItem[]> = {
      overdue: [],
      today: [],
      upcoming: [],
    };

    activities.forEach((activity) => {
      const scheduled = dayjs(activity.scheduledDate);
      if (scheduled.isBefore(todayStart)) groups.overdue.push(activity);
      else if (scheduled.isAfter(todayEnd)) groups.upcoming.push(activity);
      else groups.today.push(activity);
    });

    groups.overdue.sort((left, right) => left.scheduledDate - right.scheduledDate);
    groups.today.sort((left, right) => left.scheduledDate - right.scheduledDate);
    groups.upcoming.sort((left, right) => left.scheduledDate - right.scheduledDate);
    return groups;
  }, [activities]);

  const markDone = async (activity: LeadActivityItem) => {
    if (!outletId) return;
    try {
      await leadApi.updateActivity(outletId, activity.id, { status: "DONE" });
      setActivities((current) =>
        current.filter((item) => item.id !== activity.id),
      );
      messageApi.success("Callback marked as done.");
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "Unable to update callback",
      );
    }
  };

  const saveReschedule = async () => {
    if (!outletId || !rescheduleActivity || !rescheduleDate) return;
    setRescheduling(true);
    try {
      await leadApi.updateActivity(outletId, rescheduleActivity.id, {
        scheduledDate: rescheduleDate.valueOf(),
      });
      setActivities((current) =>
        current.map((item) =>
          item.id === rescheduleActivity.id
            ? {
                ...item,
                scheduledDate: rescheduleDate.valueOf(),
                scheduledTime: rescheduleDate.valueOf(),
              }
            : item,
        ),
      );
      messageApi.success("Callback rescheduled.");
      setRescheduleActivity(null);
      setRescheduleDate(null);
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "Unable to reschedule callback",
      );
    } finally {
      setRescheduling(false);
    }
  };

  const openLead = async (activity: LeadActivityItem) => {
    if (!outletId) return;
    setOpeningLeadId(activity.leadRefId);
    try {
      setSelectedLead(await leadApi.getLead(outletId, activity.leadRefId));
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "Unable to open lead",
      );
    } finally {
      setOpeningLeadId(null);
    }
  };

  const openWhatsApp = (activity: LeadActivityItem) => {
    const number = normalizeWhatsAppNumber(activity.leadMobile);
    if (!number) return;
    const text = encodeURIComponent(
      `Hello ${activity.leadName}, I am following up regarding your requirement.`,
    );
    window.open(`https://wa.me/${number}?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const renderCallbackBox = (activity: LeadActivityItem, group: CallbackGroup) => {
    const isUrgent = activity.priority === "Urgent";
    const customerName = toTitleCase(activity.leadName, "Unknown customer");

    return (
      <Card
        key={activity.id}
        size="small"
        className="!rounded-xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md"
        style={{ borderTop: `3px solid ${groupDetails[group].accent}` }}
        styles={{ body: { display: "flex", flexDirection: "column", height: "100%", padding: 14 } }}
      >
        <div className="flex items-start gap-2.5">
          <Avatar
            size={34}
            style={{
              backgroundColor: `${BRAND_NAVY}14`,
              color: BRAND_NAVY,
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {getInitials(customerName)}
          </Avatar>
          <div className="min-w-0 flex-1">
            <Tooltip title={customerName}>
              <Text strong className="block text-[13.5px]" ellipsis>
                {customerName}
              </Text>
            </Tooltip>
            <Tag
              icon={isUrgent ? <ExclamationCircleFilled /> : undefined}
              color={isUrgent ? "error" : "default"}
              className="!m-0 !mt-0.5 !rounded-full !text-[11px]"
            >
              {activity.priority || "Normal"}
            </Tag>
          </div>
        </div>

        <Text type="secondary" className="mt-2 block text-[12px]">
          <ClockCircleOutlined className="mr-1" />
          {dayjs(activity.scheduledDate).format("DD MMM YYYY, hh:mm A")}
        </Text>

        {activity.leadMobile ? (
          <Text type="secondary" className="mt-1 block text-[12px]">
            <PhoneOutlined className="mr-1" />
            {activity.leadMobile}
          </Text>
        ) : null}

        {activity.description ? (
          <Tooltip title={activity.description}>
            <Text className="mt-2 block flex-1 rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] leading-snug line-clamp-2">
              {activity.description}
            </Text>
          </Tooltip>
        ) : (
          <div className="flex-1" />
        )}

        <Tag icon={<UserOutlined />} className="!mt-2 !w-fit !rounded-full !bg-slate-50 !text-[11px]">
          {getEmployeeName(activity.assignedTo)}
        </Tag>

        <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5">
          <Tooltip title={activity.leadMobile ? "Call customer" : "No mobile number"}>
            <Button
              size="small"
              icon={<PhoneOutlined />}
              disabled={!activity.leadMobile}
              href={activity.leadMobile ? `tel:${activity.leadMobile}` : undefined}
            />
          </Tooltip>
          <Tooltip title={activity.leadMobile ? "Message on WhatsApp" : "No mobile number"}>
            <Button
              size="small"
              icon={<WhatsAppOutlined style={{ color: activity.leadMobile ? "#25D366" : undefined }} />}
              disabled={!activity.leadMobile}
              onClick={() => openWhatsApp(activity)}
            />
          </Tooltip>
          <Tooltip title="Open lead">
            <Button
              size="small"
              loading={openingLeadId === activity.leadRefId}
              onClick={() => void openLead(activity)}
            >
              Lead
            </Button>
          </Tooltip>
          {canEdit ? (
            <Tooltip title="Reschedule">
              <Button
                size="small"
                icon={<CalendarOutlined />}
                onClick={() => {
                  setRescheduleActivity(activity);
                  setRescheduleDate(dayjs(activity.scheduledDate));
                }}
              />
            </Tooltip>
          ) : null}
          {canEdit ? (
            <Popconfirm
              title="Mark this callback as done?"
              onConfirm={() => void markDone(activity)}
            >
              <Button
                size="small"
                type="primary"
                className="!ml-auto"
                style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY }}
              >
                Done
              </Button>
            </Popconfirm>
          ) : null}
        </div>
      </Card>
    );
  };

  const renderGroupGrid = (group: CallbackGroup) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {groupedCallbacks[group].map((activity) => renderCallbackBox(activity, group))}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div
        className="mb-5 overflow-hidden rounded-xl shadow-sm"
        style={{ background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #124a6b 100%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <Title level={2} className="!mb-1 !text-white">
              Call Later
            </Title>
            <Text className="text-slate-200 !text-white">
              Interested customers who asked to be contacted later.
            </Text>
          </div>
          <Button
            ghost
            icon={<ReloadOutlined />}
            onClick={() => setReloadVersion((value) => value + 1)}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
        {(["overdue", "today", "upcoming"] as const).map((group) => {
          const isActive = activeGroup === group;
          return (
            <Card
              key={group}
              size="small"
              hoverable
              onClick={() => setActiveGroup(group)}
              className="!cursor-pointer !rounded-xl shadow-sm transition-all"
              style={{
                borderLeft: `4px solid ${groupDetails[group].accent}`,
                borderTop: isActive ? `1px solid ${groupDetails[group].accent}` : undefined,
                borderRight: isActive ? `1px solid ${groupDetails[group].accent}` : undefined,
                borderBottom: isActive ? `1px solid ${groupDetails[group].accent}` : undefined,
                boxShadow: isActive ? `0 0 0 3px ${groupDetails[group].accent}22` : undefined,
              }}
            >
              <Text type="secondary" className="text-[13px] font-medium uppercase tracking-wide">
                {groupDetails[group].title}
              </Text>
              <div
                className="mt-1 text-3xl font-semibold"
                style={{ color: groupDetails[group].accent }}
              >
                {groupedCallbacks[group].length}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mb-5 !rounded-xl border-0 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Space size="middle" wrap>
            <Input
              allowClear
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder="Search customer, mobile, requirement or note"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              style={{ width: 340 }}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Assigned employee"
              value={assignedTo}
              onChange={setAssignedTo}
              style={{ width: 230 }}
              options={salesEmployees.map((employee) => ({
                label: formatEmployeeName(employee.userName),
                value: employee.userProfileId,
              }))}
            />
          </Space>

          <Segmented
            value={activeGroup}
            onChange={(value) => setActiveGroup(value as CallbackGroup)}
            options={(["overdue", "today", "upcoming"] as const).map((group) => ({
              label: (
                <span className="flex items-center gap-1.5 px-1">
                  {groupDetails[group].title}
                  <Badge
                    count={groupedCallbacks[group].length}
                    showZero
                    color={groupDetails[group].accent}
                  />
                </span>
              ),
              value: group,
            }))}
          />
        </div>
      </Card>

      {loadError ? (
        <Alert
          className="mb-5 !rounded-xl"
          type="error"
          showIcon
          message="Unable to load Call Later customers"
          description={loadError}
        />
      ) : null}

      {loading ? (
        <Space direction="vertical" size="large" className="w-full">
          {[0, 1].map((key) => (
            <Card key={key} className="!rounded-xl border-0 shadow-sm">
              <Skeleton active avatar paragraph={{ rows: 2 }} />
            </Card>
          ))}
        </Space>
      ) : activities.length === 0 ? (
        <Card className="!rounded-xl border-0 shadow-sm">
          <Empty description="No pending Call Later follow-ups" />
        </Card>
      ) : (
        <Space direction="vertical" size="large" className="w-full">
          <Card
            title={
              <Space>
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: groupDetails[activeGroup].accent }}
                />
                <span className="font-semibold">{groupDetails[activeGroup].title}</span>
                <Badge
                  count={groupedCallbacks[activeGroup].length}
                  showZero
                  color={groupDetails[activeGroup].accent}
                />
              </Space>
            }
            className="!rounded-xl border-0 shadow-sm"
          >
            {groupedCallbacks[activeGroup].length ? (
              renderGroupGrid(activeGroup)
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={groupDetails[activeGroup].empty} />
            )}
          </Card>

          {nextCursor ? (
            <div className="text-center">
              <Button
                loading={loadingMore}
                onClick={() => void loadCallbacks(nextCursor)}
              >
                Load more callbacks
              </Button>
            </div>
          ) : null}
        </Space>
      )}

      <Modal
        title="Reschedule Callback"
        open={Boolean(rescheduleActivity)}
        okText="Reschedule"
        confirmLoading={rescheduling}
        okButtonProps={{
          disabled: !rescheduleDate,
          style: { backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY },
        }}
        onOk={() => void saveReschedule()}
        onCancel={() => {
          if (rescheduling) return;
          setRescheduleActivity(null);
          setRescheduleDate(null);
        }}
      >
        {rescheduleActivity ? (
          <Text type="secondary" className="mb-3 block">
            {toTitleCase(rescheduleActivity.leadName, "Unknown customer")} · {rescheduleActivity.leadMobile}
          </Text>
        ) : null}
        <DatePicker
          showTime
          value={rescheduleDate}
          onChange={setRescheduleDate}
          format="DD-MM-YYYY hh:mm A"
          style={{ width: "100%" }}
          disabledDate={(current) =>
            Boolean(current && current < dayjs().startOf("day"))
          }
        />
      </Modal>

      {selectedLead ? (
        <LeadsTaskModal
          lead={selectedLead}
          onClose={() => {
            setSelectedLead(null);
            setReloadVersion((value) => value + 1);
          }}
        />
      ) : null}
    </div>
  );
}