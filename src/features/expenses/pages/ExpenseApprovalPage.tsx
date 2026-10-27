import { useEffect, useState } from "react";
import {
  Button,
  Space,
  Tag,
  Image,
  Modal,
  Input,
  Card,
  Descriptions,
  Row,
  Col,
  Spin,
  Popconfirm,
  DatePicker,
  Timeline,
  Typography,
} from "antd";
import {
  CheckOutlined,
  CloseOutlined,
  DeleteFilled,
  EyeOutlined,
  FileImageOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { Receipt, Clock, Eye, CheckCircle2, XCircle } from "lucide-react";
import { ExpenseDTO, type ExpenseStatusHistoryDTO } from "../types/types";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { PERMISSION_MASTER } from "@/shared/lib/constants";
import { useMessageApi } from "@/shared/hooks";
import dayjs, { Dayjs } from "dayjs";
import { Can } from "@/features/access-control";
import { usePermission } from "@/features/access-control";
import SpinLoader from "@/shared/components/SpinLoader";
import { formatEmployeeName, toTitleCase } from "@/shared/utils/helperFunctions";
import { expenseBudgetApi } from "../api/expenseBudgetApi";
import { getErrorMessage } from "@/shared/utils/errorUtils";
import ExpenseBudgetSection from "./ExpenseBudgetSection";

const { TextArea } = Input;
const { RangePicker } = DatePicker;
const { Text } = Typography;

// Brand palette — kept consistent with the other CRM report pages
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";
const BRAND_AMBER = "#faad14";
const BRAND_GREEN = "#52c41a";

const STATUS_COLORS: Record<string, string> = {
  pending: BRAND_AMBER,
  reviewed: BRAND_NAVY,
  approved: BRAND_GREEN,
  rejected: BRAND_RED,
};

const ExpenseApprovalPage = () => {
  // Sample data based on the provided structure
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveloading, setApproveloading] = useState(false);
  const [rejectloading, setRejectloading] = useState(false);
  const [reviewloading, setReviewloading] = useState(false);
  const [isRejectModalVisible, setIsRejectModalVisible] = useState(false);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseDTO | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [tablePage, setTablePage] = useState(1);
  const [budgetRefreshKey, setBudgetRefreshKey] = useState(0);
  const [expenseHistory, setExpenseHistory] = useState<ExpenseStatusHistoryDTO[]>([]);
  const [expenseHistoryLoading, setExpenseHistoryLoading] = useState(false);

  // Date range state - default to current month (1st to today)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"), // 1st of current month
    dayjs(), // Today
  ]);

  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );
  const teamTree = useSelector(
    (state: RootState) => state?.appState?.teamTreeData || []
  );
  const getUserName = (id?: string) => {
    if (!id) return "-";
    const user = teamTree.find((t) => t.userProfileId === id);
    return formatEmployeeName(user?.userName);
  };

  const messageApi = useMessageApi();
  const { hasPermission } = usePermission();

  useEffect(() => {
    if (!outletId) return;
    setLoading(true);
    const controller = new AbortController();
    void expenseBudgetApi
        .listExpenses(
          outletId,
          dateRange[0].startOf("day").valueOf(),
          dateRange[1].endOf("day").valueOf(),
          controller.signal,
        )
        .then((result) => {
          setExpenses(result.items);
          setLoading(false);
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.error(error);
          setLoading(false);
        });
    return () => controller.abort();
  }, [dateRange, outletId, budgetRefreshKey]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const refreshBudget = () => setBudgetRefreshKey((value) => value + 1);

  const handleReview = async (record: ExpenseDTO | null) => {
    if (!record || !outletId) {
      messageApi.error("Please select an expense for review");
      return;
    }
    setReviewloading(true);
    try {
      await expenseBudgetApi.transitionExpense(outletId, record.id, "REVIEWED");
      messageApi.success("Expense reviewed successfully");
      refreshBudget();
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error, "Failed to review expense"));
    } finally {
      setReviewloading(false);
    }
  };

  const handleApprove = async (record: ExpenseDTO | null) => {
    if (!record || !outletId) {
      messageApi.error("Please select an expense for approval");
      return;
    }
    setApproveloading(true);
    try {
      const result = await expenseBudgetApi.transitionExpense(
        outletId,
        record.id,
        "APPROVED",
      );
      messageApi.success(
        result.budgetApplied
          ? "Expense approved and budget updated"
          : "Expense approved (no matching allocation)",
      );
      refreshBudget();
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error, "Failed to approve expense"));
    } finally {
      setApproveloading(false);
    }
  };

  const showRejectModal = (record: ExpenseDTO) => {
    setSelectedExpense(record);
    setRejectionReason("");
    setIsRejectModalVisible(true);
  };

  const handleDeleteExpense = async (record: ExpenseDTO) => {
    if (!outletId) return;
    try {
      await expenseBudgetApi.deleteExpense(outletId, record.id);
      messageApi.success("Expense deleted successfully");
      refreshBudget();
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error, "Failed to delete expense"));
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      messageApi.error("Please provide a reason for rejection");
      return;
    }
    if (!selectedExpense || !outletId) {
      messageApi.error("Please select an expense for rejection");
      return;
    }
    setRejectloading(true);
    try {
      await expenseBudgetApi.transitionExpense(
        outletId,
        selectedExpense.id,
        "REJECTED",
        rejectionReason,
      );
      messageApi.success(
        selectedExpense.status === "APPROVED"
          ? "Approval reversed and budget restored"
          : "Expense rejected successfully",
      );
      setIsRejectModalVisible(false);
      setRejectionReason("");
      refreshBudget();
    } catch (error: unknown) {
      messageApi.error(getErrorMessage(error, "Failed to reject expense"));
    } finally {
      setRejectloading(false);
    }
  };

  const showDetailModal = (record: ExpenseDTO) => {
    setSelectedExpense(record);
    setIsDetailModalVisible(true);
    setExpenseHistory([]);
    if (!outletId) return;
    setExpenseHistoryLoading(true);
    void expenseBudgetApi
      .getExpenseStatusHistory(outletId, record.id)
      .then((result) => setExpenseHistory(result.items))
      .catch((error: unknown) =>
        messageApi.error(getErrorMessage(error, "Unable to load expense history")),
      )
      .finally(() => setExpenseHistoryLoading(false));
  };

  // Filter expenses by date range for stats
  const dateFilteredExpenses = expenses.filter((expense) => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return true;

    const expenseDate = dayjs(expense.createdDate);
    const startDate = dateRange[0].startOf("day");
    const endDate = dateRange[1].endOf("day");

    return (
      !expenseDate.isBefore(startDate) &&
      !expenseDate.isAfter(endDate)
    );
  });

  const pendingCount = dateFilteredExpenses.filter(
    (e) => e.status === "PENDING"
  ).length;
  const reviewedCount = dateFilteredExpenses.filter(
    (e) => e.status === "REVIEWED"
  ).length;
  const approvedCount = dateFilteredExpenses.filter(
    (e) => e.status === "APPROVED"
  ).length;
  const rejectedCount = dateFilteredExpenses.filter(
    (e) => e.status === "REJECTED"
  ).length;

  const totalPendingAmount = dateFilteredExpenses
    .filter((e) => e.status === "PENDING")
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const totalReviewedAmount = dateFilteredExpenses
    .filter((e) => e.status === "REVIEWED")
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const totalApprovedAmount = dateFilteredExpenses
    .filter((e) => e.status === "APPROVED")
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  // Filter expenses based on user role
  // Reviewers see PENDING expenses, Approvers see REVIEWED expenses
  // All users can see APPROVED, REJECTED, and REVIEWED expenses
  const hasReviewPermission = hasPermission(
    PERMISSION_MASTER.CRM_EXPENSE_REVIEW
  );
  const hasApprovePermission = hasPermission(
    PERMISSION_MASTER.CRM_EXPENSE_APPROVE
  );
  const canAllocateBudget = hasPermission(
    PERMISSION_MASTER.CRM_EXPENSE_BUDGET_ALLOCATE
  );

  // First filter by permissions
  const permissionFilteredExpenses = expenses.filter((expense) => {
    // Always show APPROVED, REJECTED, and REVIEWED expenses to everyone
    if (
      expense.status === "APPROVED" ||
      expense.status === "REJECTED" ||
      expense.status === "REVIEWED"
    ) {
      return true;
    }

    // If user has review permission, show PENDING expenses
    if (hasReviewPermission && !hasApprovePermission) {
      return expense.status === "PENDING";
    }
    // If user has approve permission, don't show PENDING (only REVIEWED which is already included above)
    if (hasApprovePermission && !hasReviewPermission) {
      return false; // PENDING not shown, but REVIEWED is shown above
    }
    // If user has both permissions, show PENDING expenses
    if (hasReviewPermission && hasApprovePermission) {
      return expense.status === "PENDING" || expense.status === "REVIEWED";
    }
    // If user has neither, show all (fallback)
    return true;
  });

  // Then filter by date range
  const filteredExpenses = permissionFilteredExpenses.filter((expense) => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return true;

    const expenseDate = dayjs(expense.createdDate);
    const startDate = dateRange[0].startOf("day");
    const endDate = dateRange[1].endOf("day");

    return (
      !expenseDate.isBefore(startDate) &&
      !expenseDate.isAfter(endDate)
    );
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredExpenses.length / pageSize));
  const safePage = Math.min(tablePage, totalPages);
  const pagedExpenses = filteredExpenses.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const countCards = [
    { key: "pending", label: "Pending", value: pendingCount, accent: BRAND_AMBER, icon: <Clock size={20} /> },
    { key: "reviewed", label: "Reviewed", value: reviewedCount, accent: BRAND_NAVY, icon: <Eye size={20} /> },
    { key: "approved", label: "Approved", value: approvedCount, accent: BRAND_GREEN, icon: <CheckCircle2 size={20} /> },
    { key: "rejected", label: "Rejected", value: rejectedCount, accent: BRAND_RED, icon: <XCircle size={20} /> },
  ];

  const amountCards = [
    { key: "pendingAmt", label: "Pending Amount", value: formatCurrency(totalPendingAmount), accent: BRAND_AMBER, icon: <Clock size={20} /> },
    { key: "reviewedAmt", label: "Reviewed Amount", value: formatCurrency(totalReviewedAmount), accent: BRAND_NAVY, icon: <Eye size={20} /> },
    { key: "approvedAmt", label: "Approved Amount", value: formatCurrency(totalApprovedAmount), accent: BRAND_GREEN, icon: <CheckCircle2 size={20} /> },
  ];

  if (loading) {
    return <SpinLoader loading={loading} />;
  }

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
              <Receipt size={18} style={{ color: BRAND_RED }} />
            </div>
            <div>
              <h1 className="mb-1 text-xl font-semibold text-white">
                Expense Management
              </h1>
              <p className="mb-0 text-sm text-slate-200">
                Review and manage expense submissions
              </p>
            </div>
          </div>
        </div>
      </div>

      {outletId && (
        <ExpenseBudgetSection
          outletId={outletId}
          month={dateRange[0].format("YYYY-MM")}
          teamTree={teamTree}
          canAllocate={canAllocateBudget}
          refreshKey={budgetRefreshKey}
          onChanged={refreshBudget}
        />
      )}

      {/* Count Stats */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {countCards.map((card) => (
          <Card
            key={card.key}
            size="small"
            className="!rounded-xl border-0 shadow-sm"
            style={{ borderLeft: `4px solid ${card.accent}` }}
            styles={{ body: { padding: 16 } }}
          >
            <div className="flex items-center justify-between">
              <div>
                <Text type="secondary" className="text-[12.5px] font-medium uppercase tracking-wide">
                  {card.label}
                </Text>
                <div className="mt-1 text-2xl font-semibold" style={{ color: card.accent }}>
                  {card.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${card.accent}14`, color: card.accent }}
              >
                {card.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Amount Stats */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {amountCards.map((card) => (
          <Card
            key={card.key}
            size="small"
            className="!rounded-xl border-0 shadow-sm"
            style={{ borderLeft: `4px solid ${card.accent}` }}
            styles={{ body: { padding: 16 } }}
          >
            <div className="flex items-center justify-between">
              <div>
                <Text type="secondary" className="text-[12.5px] font-medium uppercase tracking-wide">
                  {card.label}
                </Text>
                <div className="mt-1 text-xl font-semibold" style={{ color: card.accent }}>
                  {card.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${card.accent}14`, color: card.accent }}
              >
                {card.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mb-5 !rounded-xl border-0 shadow-sm">
        <Row gutter={16} align="middle">
          <Col xs={24} sm={12} md={8} lg={6}>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: 500,
                }}
              >
                Filter by Date Range:
              </label>
              <RangePicker
                value={dateRange}
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setDateRange([dates[0], dates[1]]);
                  } else {
                    // Reset to default if cleared
                    setDateRange([dayjs().startOf("month"), dayjs()]);
                  }
                }}
                format="DD-MM-YYYY"
                disabledDate={(current) => {
                  // Disable future dates
                  return current && current > dayjs().endOf("day");
                }}
                style={{ width: "100%" }}
                allowClear={false}
              />
            </div>
          </Col>
        </Row>
      </Card>

      <Card className="!rounded-xl border-0 shadow-sm">
        {!loading ? (
          filteredExpenses.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
              No expenses found
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[1500px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="text-xs font-semibold uppercase" style={{ backgroundColor: BRAND_NAVY, color: "#fff" }}>
                      <th className="px-4 py-3">Created By</th>
                      <th className="px-4 py-3">Amount</th>
                      <th className="px-4 py-3">Invoice Date</th>
                      <th className="px-4 py-3">Journey From</th>
                      <th className="px-4 py-3">Journey To</th>
                      <th className="px-4 py-3">Travel Mode</th>
                      <th className="px-4 py-3">KM</th>
                      <th className="px-4 py-3">Purpose</th>
                      <th className="px-4 py-3">Payment Mode</th>
                      <th className="px-4 py-3">Submitted On</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reviewed By</th>
                      <th className="px-4 py-3">Approved/Rejected By</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedExpenses.map((record) => {
                      const statusColor =
                        STATUS_COLORS[record.status?.toLowerCase()] || BRAND_NAVY;
                      return (
                        <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{getUserName(record.userId)}</td>
                          <td className="px-4 py-3 font-semibold" style={{ color: BRAND_NAVY }}>{formatCurrency(record.amount)}</td>
                          <td className="px-4 py-3 text-slate-700">{record.invoiceDate}</td>
                          <td className="px-4 py-3 text-slate-700">{record.journeyFrom || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{record.journeyTo || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{record.travelMode || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{record.totalKm || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{record.purpose || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{record.paymentMode || "-"}</td>
                          <td className="px-4 py-3 text-slate-700">{formatDate(record.createdDate)}</td>
                          <td className="px-4 py-3">
                            <Tag
                              style={{
                                color: statusColor,
                                borderColor: statusColor,
                                backgroundColor: `${statusColor}14`,
                              }}
                            >
                              {toTitleCase(record.status)}
                            </Tag>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {record.status === "REVIEWED" ||
                            record.status === "APPROVED" ||
                            record.status === "REJECTED"
                              ? record.reviewedBy
                                ? getUserName(record.reviewedBy)
                                : "N/A"
                              : "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {record.status === "APPROVED" && record.approvedBy
                              ? getUserName(record.approvedBy)
                              : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <Space size="small" wrap>
                              <Can permission={PERMISSION_MASTER.CRM_EXPENSE_VIEW_ADMIN}>
                                <Button
                                  type="link"
                                  icon={<EyeOutlined />}
                                  onClick={() => showDetailModal(record)}
                                  style={{ color: BRAND_NAVY }}
                                >
                                  View
                                </Button>
                              </Can>
                              <Can permission={PERMISSION_MASTER.CRM_EXPENSE_DELETE}>
                                <Popconfirm title="Confirm Delete Expense" onConfirm={() => handleDeleteExpense(record)}>
                                  <Button danger icon={<DeleteFilled />} size="small">
                                    Delete
                                  </Button>
                                </Popconfirm>
                              </Can>
                              {record.status === "PENDING" && (
                                <Can permission={PERMISSION_MASTER.CRM_EXPENSE_REVIEW}>
                                  <Popconfirm
                                    title="Confirm Review"
                                    description="This will mark the expense as reviewed for approval"
                                    onConfirm={() => handleReview(record)}
                                  >
                                    <Button
                                      loading={reviewloading}
                                      disabled={reviewloading}
                                      icon={<CheckCircleOutlined />}
                                      size="small"
                                    >
                                      Review
                                    </Button>
                                  </Popconfirm>
                                </Can>
                              )}
                              {record.status === "REVIEWED" && (
                                <Can permission={PERMISSION_MASTER.CRM_EXPENSE_APPROVE}>
                                  <Popconfirm title="Confirm Approve" onConfirm={() => handleApprove(record)}>
                                    <Button
                                      loading={approveloading}
                                      disabled={approveloading}
                                      icon={<CheckOutlined />}
                                      size="small"
                                      style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
                                    >
                                      Approve
                                    </Button>
                                  </Popconfirm>
                                  <Popconfirm title="Confirm Reject" onConfirm={() => showRejectModal(record)}>
                                    <Button
                                      loading={rejectloading}
                                      disabled={rejectloading}
                                      danger
                                      icon={<CloseOutlined />}
                                      size="small"
                                    >
                                      Reject
                                    </Button>
                                  </Popconfirm>
                                </Can>
                              )}
                              {record.status === "APPROVED" && (
                                <Can permission={PERMISSION_MASTER.CRM_EXPENSE_APPROVE}>
                                  <Button
                                    danger
                                    icon={<CloseOutlined />}
                                    size="small"
                                    onClick={() => showRejectModal(record)}
                                  >
                                    Reverse Approval
                                  </Button>
                                </Can>
                              )}
                              {record.status === "REJECTED" && (
                                <Can permission={PERMISSION_MASTER.CRM_EXPENSE_APPROVE}>
                                  <Popconfirm
                                    title="Approve rejected expense?"
                                    description="The current monthly budget will be checked again."
                                    onConfirm={() => handleApprove(record)}
                                  >
                                    <Button
                                      loading={approveloading}
                                      icon={<CheckOutlined />}
                                      size="small"
                                      style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
                                    >
                                      Approve
                                    </Button>
                                  </Popconfirm>
                                </Can>
                              )}
                            </Space>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <span className="text-sm text-slate-500">
                  Showing {pagedExpenses.length} of {filteredExpenses.length} expenses
                </span>
                <Space>
                  <Button disabled={safePage <= 1} onClick={() => setTablePage((page) => Math.max(1, page - 1))}>
                    Previous
                  </Button>
                  <span className="text-sm text-slate-600">
                    Page {safePage} of {totalPages}
                  </span>
                  <Button disabled={safePage >= totalPages} onClick={() => setTablePage((page) => Math.min(totalPages, page + 1))}>
                    Next
                  </Button>
                </Space>
              </div>
            </>
          )
        ) : (
          <Spin size="default" />
        )}
      </Card>

      <Modal
        title="Reject Expense"
        open={isRejectModalVisible}
        onOk={handleReject}
        onCancel={() => setIsRejectModalVisible(false)}
        okText="Reject"
        okButtonProps={{ danger: true }}
      >
        <p style={{ marginBottom: "12px" }}>
          <strong>Invoice No:</strong> {selectedExpense?.invoiceNo}
          <br />
          <strong>Amount:</strong>{" "}
          {formatCurrency(selectedExpense?.amount || 0)}
        </p>
        <TextArea
          rows={4}
          placeholder="Please provide a reason for rejection..."
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          maxLength={500}
          showCount
        />
      </Modal>

      <Modal
        title="Expense Details"
        open={isDetailModalVisible}
        onCancel={() => setIsDetailModalVisible(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setIsDetailModalVisible(false)}>
            Close
          </Button>,
          selectedExpense?.status === "PENDING" && (
            <>
              <Can permission={PERMISSION_MASTER.CRM_EXPENSE_REVIEW}>
                <Button
                  key="review"
                  loading={reviewloading}
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    handleReview(selectedExpense);
                    setIsDetailModalVisible(false);
                  }}
                >
                  Review
                </Button>
                <Button
                  key="reject-pending"
                  loading={rejectloading}
                  danger
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setIsDetailModalVisible(false);
                    showRejectModal(selectedExpense);
                  }}
                >
                  Reject
                </Button>
              </Can>
            </>
          ),
          selectedExpense?.status === "REVIEWED" && (
            <Can permission={PERMISSION_MASTER.CRM_EXPENSE_APPROVE}>
              <Button
                key="approve"
                loading={approveloading}
                icon={<CheckOutlined />}
                onClick={() => {
                  handleApprove(selectedExpense);
                  setIsDetailModalVisible(false);
                }}
                style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
              >
                Approve
              </Button>
              <Button
                key="reject-reviewed"
                loading={rejectloading}
                danger
                icon={<CloseOutlined />}
                onClick={() => {
                  setIsDetailModalVisible(false);
                  showRejectModal(selectedExpense);
                }}
              >
                Reject
              </Button>
            </Can>
          ),
          selectedExpense?.status === "APPROVED" && (
            <Can permission={PERMISSION_MASTER.CRM_EXPENSE_APPROVE}>
              <Button
                key="reverse-approved"
                loading={rejectloading}
                danger
                icon={<CloseOutlined />}
                onClick={() => {
                  setIsDetailModalVisible(false);
                  showRejectModal(selectedExpense);
                }}
              >
                Reverse Approval
              </Button>
            </Can>
          ),
          selectedExpense?.status === "REJECTED" && (
            <Can permission={PERMISSION_MASTER.CRM_EXPENSE_APPROVE}>
              <Button
                key="approve-rejected"
                loading={approveloading}
                icon={<CheckOutlined />}
                onClick={() => {
                  void handleApprove(selectedExpense);
                  setIsDetailModalVisible(false);
                }}
                style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
              >
                Approve Again
              </Button>
            </Can>
          ),
        ]}
      >
        {selectedExpense && (
          <>
            <Descriptions bordered column={2}>
              <Descriptions.Item label="Invoice No" span={2}>
                <strong>{selectedExpense.invoiceNo}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="Amount" span={2}>
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: BRAND_NAVY,
                  }}
                >
                  {formatCurrency(selectedExpense.amount)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Invoice Date">
                {selectedExpense.invoiceDate}
              </Descriptions.Item>
              <Descriptions.Item label="Submitted On">
                {formatDate(selectedExpense.createdDate)}
              </Descriptions.Item>
              <Descriptions.Item label="Status" span={2}>
                <Tag
                  style={{
                    color: STATUS_COLORS[selectedExpense.status?.toLowerCase()] || BRAND_NAVY,
                    borderColor: STATUS_COLORS[selectedExpense.status?.toLowerCase()] || BRAND_NAVY,
                    backgroundColor: `${STATUS_COLORS[selectedExpense.status?.toLowerCase()] || BRAND_NAVY}14`,
                  }}
                >
                  {toTitleCase(selectedExpense.status)}
                </Tag>
              </Descriptions.Item>
              {(selectedExpense.status === "REVIEWED" ||
                selectedExpense.status === "APPROVED" ||
                selectedExpense.status === "REJECTED") &&
                selectedExpense.reviewedBy && (
                  <Descriptions.Item label="Reviewed By" span={2}>
                    <strong>{getUserName(selectedExpense.reviewedBy)}</strong>
                  </Descriptions.Item>
                )}
              {selectedExpense.status === "APPROVED" &&
                selectedExpense.approvedBy && (
                  <Descriptions.Item label="Approved By" span={2}>
                    <strong style={{ color: BRAND_GREEN }}>
                      {getUserName(selectedExpense.approvedBy)}
                    </strong>
                  </Descriptions.Item>
                )}
              {selectedExpense.status === "APPROVED" && selectedExpense.approvedAt && (
                <Descriptions.Item label="Approved At" span={2}>
                  {formatDate(selectedExpense.approvedAt)}
                </Descriptions.Item>
              )}
              {selectedExpense.status === "REJECTED" &&
                (selectedExpense.rejectedBy || selectedExpense.reviewedBy) && (
                  <Descriptions.Item label="Rejected By" span={2}>
                    <strong style={{ color: BRAND_RED }}>
                      {getUserName(selectedExpense.rejectedBy || selectedExpense.reviewedBy)}
                    </strong>
                  </Descriptions.Item>
                )}
              {selectedExpense.status === "REJECTED" && selectedExpense.rejectedAt && (
                <Descriptions.Item label="Rejected At" span={2}>
                  {formatDate(selectedExpense.rejectedAt)}
                </Descriptions.Item>
              )}
              {selectedExpense.budgetAllocationId && (
                <Descriptions.Item label="Budget Applied" span={2}>
                  <Tag color="green">
                    {formatCurrency(selectedExpense.budgetAppliedAmount || selectedExpense.amount)}
                  </Tag>
                </Descriptions.Item>
              )}
              {selectedExpense.rejectionReason && (
                <Descriptions.Item label="Rejection Reason" span={2}>
                  <div style={{ color: BRAND_RED }}>
                    {selectedExpense.rejectionReason}
                  </div>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Card size="small" title="Status History" style={{ marginTop: 16 }}>
              <Spin spinning={expenseHistoryLoading}>
                {expenseHistory.length > 0 ? (
                  <Timeline
                    items={expenseHistory.map((entry) => ({
                      color:
                        entry.toStatus === "APPROVED"
                          ? BRAND_GREEN
                          : entry.toStatus === "REJECTED"
                            ? BRAND_RED
                            : BRAND_NAVY,
                      children: (
                        <div>
                          <strong>
                            {toTitleCase(entry.fromStatus)} → {toTitleCase(entry.toStatus)}
                          </strong>
                          <div>{formatDate(entry.changedAt)} · {getUserName(entry.changedBy)}</div>
                          {entry.reason && <div style={{ color: BRAND_RED }}>{entry.reason}</div>}
                        </div>
                      ),
                    }))}
                  />
                ) : (
                  <span style={{ color: "#8c8c8c" }}>
                    No server-side status history is available for this expense yet.
                  </span>
                )}
              </Spin>
            </Card>

            <div style={{ marginTop: "24px" }}>
              <h3>
                <FileImageOutlined /> Attachments
              </h3>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontWeight: "bold", marginBottom: "8px" }}>
                      Invoice Image
                    </p>
                    <Image
                      src={selectedExpense.invoiceImage}
                      alt="Invoice"
                      style={{
                        maxWidth: "100%",
                        border: "1px solid #d9d9d9",
                        borderRadius: "4px",
                      }}
                    />
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontWeight: "bold", marginBottom: "8px" }}>
                      Receipt Image
                    </p>
                    <Image
                      src={selectedExpense.image}
                      alt="Receipt"
                      style={{
                        maxWidth: "100%",
                        border: "1px solid #d9d9d9",
                        borderRadius: "4px",
                      }}
                    />
                  </div>
                </Col>
              </Row>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};

export default ExpenseApprovalPage;
