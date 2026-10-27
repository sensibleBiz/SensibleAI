import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Tag,
  Button,
  Tabs,
  DatePicker,
  Modal,
  Input,
  Form,
} from "antd";
import { CalendarOutlined, PlusOutlined } from "@ant-design/icons";
import { CalendarDays, ClipboardCheck, Tags as TagsIcon } from "lucide-react";
import { usePermission } from '@/features/access-control';
import { PERMISSION_MASTER } from '@/shared/lib/constants';
import dayjs, { Dayjs } from "dayjs";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { LeaveApplication } from "../types/types";
import { useMessageApi } from "@/shared/hooks";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { getErrorMessage } from "@/shared/utils/errorUtils";
import { leaveApi, type LeaveStatus } from "../api/leaveApi";

const { TextArea } = Input;

// Brand palette — kept consistent with the City & State report and Employee Targeting pages
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

interface LeaveTypeFormValues {
  name: string;
  shortCode: string;
}

export default function LeaveManagementPage() {
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id);
  const teamTree = useSelector((s: RootState) => s.appState.teamTreeData || []);
  const [month, setMonth] = useState<Dayjs>(dayjs());
  const [activeTab, setActiveTab] = useState<LeaveStatus>("REQUESTED");
  const [leaves, setLeaves] = useState<LeaveApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [leaveTypes, setLeaveTypes] = useState<
    Array<{ id: string; name: string; shortCode: string }>
  >([]);
  const [leaveTypesLoading, setLeaveTypesLoading] = useState(true);
  const [leaveTypeModalOpen, setLeaveTypeModalOpen] = useState(false);
  const [leaveTypeSaving, setLeaveTypeSaving] = useState(false);
  const [leaveTypeForm] = Form.useForm<LeaveTypeFormValues>();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveApplication | null>(
    null
  );
  const [remark, setRemark] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const messageApi = useMessageApi();
  const { hasPermission } = usePermission();
  const canCreateLeaveType = hasPermission(PERMISSION_MASTER.CRM_LEAVE_CREATE);

  useEffect(() => {
    const abortController = new AbortController();

    if (!outletId) {
      setLeaveTypes([]);
      setLeaveTypesLoading(false);
      return () => abortController.abort();
    }

    setLeaveTypesLoading(true);
    void leaveApi
      .listTypes(outletId, abortController.signal)
      .then((result) => setLeaveTypes(result.items))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
        messageApi.error(getErrorMessage(error, "Failed to load leave types"));
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLeaveTypesLoading(false);
      });

    return () => abortController.abort();
  }, [messageApi, outletId]);

  // 🔥 Fetch Leaves for selected month
  const loadLeaves = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      if (!outletId) {
        setLeaves([]);
        setNextCursor(null);
        setLoading(false);
        return;
      }

      if (cursor) setLoadingMore(true);
      else setLoading(true);

      try {
        const result = await leaveApi.list(
          {
            outletId,
            month: month.format("YYYY-MM"),
            status: activeTab,
            limit: 30,
            cursor,
          },
          signal,
        );
        setLeaves((current) =>
          cursor ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error(error);
        messageApi.error(getErrorMessage(error, "Failed to load leave requests"));
        if (!cursor) {
          setLeaves([]);
          setNextCursor(null);
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [activeTab, messageApi, month, outletId],
  );

  useEffect(() => {
    const abortController = new AbortController();
    void loadLeaves(undefined, abortController.signal);
    return () => abortController.abort();
  }, [loadLeaves]);

  // 🔥 Add employee name in the list
  const enrichedRows = useMemo(() => {
    return leaves.map((l) => {
      const user = teamTree.find((u) => u.userProfileId === l.userProfileId);
      return {
        ...l,
        userName: user?.userName || "Unknown User",
      };
    });
  }, [leaves, teamTree]);

  // 🔥 Filter based on tabs
  const filteredRows = enrichedRows.filter((l) => l.status === activeTab);

  // Approve / Reject Handler
  const handleAction = async (status: "APPROVED" | "REJECTED") => {
    if (!selectedLeave || !outletId) return;

    setActionLoading(true);
    try {
      const result = await leaveApi.transitionStatus(
        outletId,
        selectedLeave.id,
        status,
        remark,
      );
      setLeaves((current) =>
        current.map((leave) =>
          leave.id === selectedLeave.id ? result.item : leave,
        ),
      );
      messageApi.success(`Leave ${status.toLowerCase()} successfully`);
      setModalOpen(false);
      setSelectedLeave(null);
      setRemark("");
    } catch (error) {
      console.error(error);
      messageApi.error(getErrorMessage(error, "Failed to update leave request"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddLeaveType = async () => {
    if (!outletId) return;

    try {
      const values = await leaveTypeForm.validateFields();
      setLeaveTypeSaving(true);
      const result = await leaveApi.createType(outletId, values);
      setLeaveTypes((current) =>
        [...current, result.item].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      );
      messageApi.success("Leave type added successfully");
      setLeaveTypeModalOpen(false);
      leaveTypeForm.resetFields();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "errorFields" in error
      ) {
        return;
      }
      console.error(error);
      messageApi.error(getErrorMessage(error, "Failed to add leave type"));
    } finally {
      setLeaveTypeSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div
        className="mb-5 overflow-hidden rounded-xl shadow-sm"
        style={{ background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #124a6b 100%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <CalendarDays size={18} style={{ color: BRAND_RED }} />
            </div>
            <div>
              <h2 className="mb-1 text-xl font-semibold text-white">
                Leave Management
              </h2>
              <p className="mb-0 text-sm text-slate-200">
                Configure leave types and review employee leave requests.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Leave Types */}
      <Card
        variant="borderless"
        className="mb-5 !rounded-xl border-0 shadow-sm"
        loading={leaveTypesLoading}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <TagsIcon size={16} style={{ color: BRAND_NAVY }} />
              <h2 className="mb-0 text-lg font-semibold" style={{ color: BRAND_NAVY }}>
                Leave Types
              </h2>
            </div>
            <p className="mb-3 text-sm text-slate-500">
              Leave options configured for this outlet.
            </p>
            <div className="flex flex-wrap gap-2">
              {leaveTypes.length ? (
                leaveTypes.map((leaveType) => (
                  <Tag
                    key={leaveType.id}
                    style={{
                      color: BRAND_NAVY,
                      backgroundColor: "rgba(10,55,80,0.06)",
                      borderColor: "rgba(10,55,80,0.2)",
                    }}
                  >
                    {leaveType.name} ({leaveType.shortCode})
                  </Tag>
                ))
              ) : (
                <span className="text-sm text-slate-500">
                  No leave types configured
                </span>
              )}
            </div>
          </div>
          {canCreateLeaveType ? (
            <Button
              icon={<PlusOutlined />}
              onClick={() => setLeaveTypeModalOpen(true)}
              style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
            >
              Add Leave Type
            </Button>
          ) : null}
        </div>
      </Card>

      {/* Leave Approval Panel */}
      <Card variant="borderless" className="!rounded-xl border-0 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <ClipboardCheck size={18} style={{ color: BRAND_NAVY }} />
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: BRAND_NAVY }}>
            Leave Approval Panel
          </h2>
        </div>
        <p style={{ color: "#666" }}>
          Review, approve and reject employee leave requests.
        </p>

        {/* Month Filter */}
        <div className="mt-4 mb-4">
          <DatePicker.MonthPicker
            allowClear={false}
            value={month}
            onChange={(d) => setMonth(d || dayjs())}
            suffixIcon={<CalendarOutlined />}
          />
          {activeTab === "REQUESTED" ? (
            <p className="mb-0 mt-2 text-sm text-slate-500">
              Pending includes the selected month and the previous month.
            </p>
          ) : null}
        </div>

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as LeaveStatus)}
          items={[
            { key: "REQUESTED", label: "Pending" },
            { key: "APPROVED", label: "Approved" },
            { key: "REJECTED", label: "Rejected" },
          ]}
        />

        {loading ? (
          <div className="py-8 text-center text-slate-500">Loading leave requests...</div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
            {activeTab === "REQUESTED"
              ? "No pending leave requests"
              : "No leave requests found for the selected month"}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[1000px] w-full border-collapse text-left text-sm">
              <thead>
                <tr
                  className="text-xs font-semibold uppercase"
                  style={{ backgroundColor: BRAND_NAVY, color: "#fff" }}
                >
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Leave Type</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Days</th>
                  <th className="px-4 py-3">Note</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatEmployeeName(row.userName, "Unknown User")}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.leaveType}</td>
                    <td className="px-4 py-3 text-slate-700">{row.duration}</td>
                    <td className="px-4 py-3 text-slate-700">{dayjs(row.fromDate).format("DD MMM YYYY")}</td>
                    <td className="px-4 py-3 text-slate-700">{dayjs(row.toDate).format("DD MMM YYYY")}</td>
                    <td className="px-4 py-3 text-slate-700">{row.noDays}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-slate-700">{row.leaveNote || "-"}</td>
                    <td className="px-4 py-3">
                      {row.status === "APPROVED" ? (
                        <Tag color="green">APPROVED</Tag>
                      ) : row.status === "REJECTED" ? (
                        <Tag color="red">REJECTED</Tag>
                      ) : (
                        <Tag color="orange">PENDING</Tag>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.status === "REQUESTED" ? (
                        <Button
                          onClick={() => {
                            setSelectedLeave(row);
                            setModalOpen(true);
                          }}
                          style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
                        >
                          Take Action
                        </Button>
                      ) : (
                        <span>
                          {formatEmployeeName(
                            teamTree.find(
                              (mem) => mem?.userProfileId == row?.actionTakenBy
                            )?.userName
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {nextCursor ? (
              <div className="border-t border-slate-200 p-3 text-center">
                <Button
                  loading={loadingMore}
                  onClick={() => void loadLeaves(nextCursor)}
                >
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {/* Approve / Reject Modal */}
      <Modal
        title="Review Leave Request"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={[
          <Button
            key="reject"
            danger
            disabled={actionLoading}
            onClick={() => handleAction("REJECTED")}
          >
            Reject
          </Button>,
          <Button
            key="approve"
            loading={actionLoading}
            onClick={() => handleAction("APPROVED")}
            style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
          >
            Approve
          </Button>,
        ]}
      >
        <p style={{ fontWeight: 600, color: BRAND_NAVY }}>
          {selectedLeave?.leaveType} ({selectedLeave?.duration})
        </p>
        <p>
          <b>Employee:</b>{" "}
          {formatEmployeeName(selectedLeave?.userName, "Unknown User")}
        </p>
        <p>
          <b>Dates:</b> {dayjs(selectedLeave?.fromDate).format("DD MMM")} →{" "}
          {dayjs(selectedLeave?.toDate).format("DD MMM")}
        </p>
        <p>
          <b>Reason:</b> {selectedLeave?.leaveNote}
        </p>

        <TextArea
          rows={3}
          placeholder="Add remark (optional)"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
        />
      </Modal>

      <Modal
        title="Add Leave Type"
        open={leaveTypeModalOpen}
        okText="Add Leave Type"
        confirmLoading={leaveTypeSaving}
        onOk={() => void handleAddLeaveType()}
        onCancel={() => {
          if (leaveTypeSaving) return;
          setLeaveTypeModalOpen(false);
          leaveTypeForm.resetFields();
        }}
        okButtonProps={{
          style: { backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY },
        }}
      >
        <Form form={leaveTypeForm} layout="vertical" requiredMark={false}>
          <Form.Item
            label="Leave type name"
            name="name"
            rules={[
              { required: true, message: "Enter the leave type name" },
              { min: 2, max: 100 },
            ]}
          >
            <Input placeholder="e.g. CASUAL LEAVE" maxLength={100} />
          </Form.Item>
          <Form.Item
            label="Short code"
            name="shortCode"
            normalize={(value: string) => value.toUpperCase()}
            rules={[
              { required: true, message: "Enter a short code" },
              {
                pattern: /^[A-Za-z0-9]+$/,
                message: "Use only letters and numbers",
              },
            ]}
          >
            <Input placeholder="e.g. CL" maxLength={10} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}