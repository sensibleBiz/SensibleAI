import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThHTMLAttributes } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  HistoryOutlined,
  PlusOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type { ExpenseBudgetAllocationDTO, ExpenseBudgetBreakdownDTO, ExpenseBudgetSummaryDTO, ExpenseBudgetTargetType, ExpenseBudgetTransactionDTO } from "../types/types";
import type { TeamTreeDTO } from "@/features/team";
import { expenseBudgetApi } from "../api/expenseBudgetApi";
import { getErrorMessage } from "@/shared/utils/errorUtils";
import { useMessageApi } from "@/shared/hooks";
import {
  EXPENSE_BUDGET_TARGET_TYPE_LABELS,
  EXPENSE_BUDGET_TRANSACTION_LABELS,
  formatExpenseBudgetCurrency,
  getExpenseBudgetDisplayMetrics,
  getExpenseBudgetTargetOptions,
} from "./expenseBudgetViewModel";

const { Text } = Typography;

// Brand palette — kept consistent with the other CRM report pages
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";
const BRAND_GREEN = "#3f8600";

// Shared navy table header, matching the raw HTML tables used elsewhere in the app
const brandHeaderCell = (
  props: ThHTMLAttributes<HTMLTableCellElement>
) => (
  <th
    {...props}
    style={{
      ...props.style,
      backgroundColor: BRAND_NAVY,
      color: "#fff",
      fontWeight: 600,
    }}
  />
);
const brandTableComponents = { header: { cell: brandHeaderCell } };

interface ExpenseBudgetSectionProps {
  outletId: string;
  month: string;
  teamTree: TeamTreeDTO[];
  canAllocate: boolean;
  refreshKey: number;
  onChanged: () => void;
}

interface AllocationFormValues {
  month: Dayjs;
  targetType: ExpenseBudgetTargetType;
  targetId: string;
  allocatedAmount: number;
  notes?: string;
}

const BreakdownTable = ({ rows }: { rows: ExpenseBudgetBreakdownDTO[] }) => (
  <Table<ExpenseBudgetBreakdownDTO>
    size="small"
    rowKey="id"
    pagination={{ pageSize: 8, hideOnSinglePage: true }}
    dataSource={rows}
    components={brandTableComponents}
    locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
    columns={[
      { title: "Name", dataIndex: "label" },
      {
        title: "Approved",
        dataIndex: "approvedAmount",
        render: (value: number) => formatExpenseBudgetCurrency(value),
      },
      {
        title: "Pending",
        dataIndex: "pendingAmount",
        render: (value: number) => formatExpenseBudgetCurrency(value),
      },
      {
        title: "Rejected",
        dataIndex: "rejectedAmount",
        render: (value: number) => formatExpenseBudgetCurrency(value),
      },
      { title: "Expenses", dataIndex: "expenseCount" },
    ]}
  />
);

const ExpenseBudgetSection = ({
  outletId,
  month,
  teamTree,
  canAllocate,
  refreshKey,
  onChanged,
}: ExpenseBudgetSectionProps) => {
  const messageApi = useMessageApi();
  const [summary, setSummary] = useState<ExpenseBudgetSummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allocationModalOpen, setAllocationModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingAllocation, setEditingAllocation] =
    useState<ExpenseBudgetAllocationDTO | null>(null);
  const [historyAllocation, setHistoryAllocation] =
    useState<ExpenseBudgetAllocationDTO | null>(null);
  const [history, setHistory] = useState<ExpenseBudgetTransactionDTO[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [form] = Form.useForm<AllocationFormValues>();
  const selectedTargetType = Form.useWatch("targetType", form);

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await expenseBudgetApi.getSummary(outletId, month, signal));
    } catch (requestError: unknown) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        return;
      }
      setError(getErrorMessage(requestError, "Unable to load expense budget"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [month, outletId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSummary(controller.signal);
    return () => controller.abort();
  }, [loadSummary, refreshKey]);

  const targetOptions = useMemo(
    () => getExpenseBudgetTargetOptions(teamTree, selectedTargetType),
    [selectedTargetType, teamTree],
  );

  const displayAllocation = summary?.currentAllocation ?? null;
  const metrics = getExpenseBudgetDisplayMetrics(summary);
  const heading = dayjs(`${month}-01`).format("MMMM YYYY");
  const getTeamMemberName = (userId: string) =>
    teamTree.find((member) => member.userProfileId === userId)?.userName || userId;

  const openCreate = () => {
    setEditingAllocation(null);
    form.resetFields();
    form.setFieldsValue({
      month: dayjs(`${month}-01`),
      targetType: "DEPARTMENT",
    });
    setAllocationModalOpen(true);
  };

  const openEdit = (allocation: ExpenseBudgetAllocationDTO) => {
    setEditingAllocation(allocation);
    form.setFieldsValue({
      month: dayjs(`${allocation.month}-01`),
      targetType: allocation.targetType,
      targetId: allocation.targetId,
      allocatedAmount: allocation.allocatedAmount,
      notes: allocation.notes,
    });
    setAllocationModalOpen(true);
  };

  const saveAllocation = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingAllocation) {
        const result = await expenseBudgetApi.updateAllocation(
          editingAllocation.id,
          {
            outletId,
            allocatedAmount: values.allocatedAmount,
            notes: values.notes,
          },
        );
        messageApi.success(
          result.updated ? "Expense budget adjusted" : "No budget changes were needed",
        );
      } else {
        const result = await expenseBudgetApi.createAllocation({
          outletId,
          month: values.month.format("YYYY-MM"),
          targetType: values.targetType,
          targetId: values.targetId,
          allocatedAmount: values.allocatedAmount,
          notes: values.notes,
        });
        messageApi.success(
          result.created ? "Expense budget allocated" : "This allocation already exists",
        );
      }
      setAllocationModalOpen(false);
      onChanged();
    } catch (requestError: unknown) {
      messageApi.error(getErrorMessage(requestError, "Unable to save expense budget"));
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async (
    allocation: ExpenseBudgetAllocationDTO,
    cursor?: string,
  ) => {
    setHistoryLoading(true);
    try {
      const result = await expenseBudgetApi.getTransactions(
        outletId,
        allocation.id,
        cursor,
      );
      setHistory((current) => (cursor ? [...current, ...result.items] : result.items));
      setHistoryCursor(result.nextCursor);
    } catch (requestError: unknown) {
      messageApi.error(getErrorMessage(requestError, "Unable to load budget history"));
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = (allocation: ExpenseBudgetAllocationDTO) => {
    setHistoryAllocation(allocation);
    setHistory([]);
    setHistoryCursor(null);
    void loadHistory(allocation);
  };

  return (
    <Card
      loading={loading}
      className="!rounded-xl border-0 shadow-sm"
      style={{ marginBottom: 20 }}
      title={
        <Space>
          <WalletOutlined style={{ color: BRAND_NAVY }} />
          <span style={{ color: BRAND_NAVY }}>Expense Budget — {heading}</span>
          {displayAllocation && (
            <Tag
              style={{
                color: BRAND_NAVY,
                borderColor: BRAND_NAVY,
                backgroundColor: "rgba(10,55,80,0.06)",
              }}
            >
              {displayAllocation.targetLabel}
            </Tag>
          )}
        </Space>
      }
      extra={
        canAllocate ? (
          <Button
            icon={<PlusOutlined />}
            onClick={openCreate}
            style={{ backgroundColor: BRAND_RED, borderColor: BRAND_RED, color: "#fff" }}
          >
            Allocate Expense Budget
          </Button>
        ) : null
      }
    >
      {error && (
        <Alert
          type="error"
          showIcon
          message="Expense budget could not be loaded"
          description={error}
          action={<Button onClick={() => void loadSummary()}>Retry</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {!loading && !error && summary?.allocations.length === 0 && (
        <Alert
          type="info"
          showIcon
          message="No budget allocated for this month"
          description="Legacy expense approvals remain available until a matching monthly allocation is created."
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={4}>
          <Card size="small" className="!rounded-lg" style={{ borderLeft: `3px solid ${BRAND_NAVY}` }}>
            <Statistic
              title="Allocated"
              value={formatExpenseBudgetCurrency(metrics?.allocatedAmount ?? 0)}
              valueStyle={{ color: BRAND_NAVY, fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card size="small" className="!rounded-lg" style={{ borderLeft: `3px solid ${BRAND_RED}` }}>
            <Statistic
              title="Used"
              value={formatExpenseBudgetCurrency(metrics?.usedAmount ?? 0)}
              valueStyle={{ color: BRAND_RED, fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card size="small" className="!rounded-lg" style={{ borderLeft: `3px solid ${BRAND_GREEN}` }}>
            <Statistic
              title="Remaining"
              value={formatExpenseBudgetCurrency(metrics?.remainingAmount ?? 0)}
              valueStyle={{ color: BRAND_GREEN, fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card size="small" className="!rounded-lg" style={{ borderLeft: "3px solid #faad14" }}>
            <Statistic
              title="Pending"
              value={formatExpenseBudgetCurrency(summary?.totals.pendingAmount ?? 0)}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card size="small" className="!rounded-lg" style={{ borderLeft: `3px solid ${BRAND_GREEN}` }}>
            <Statistic
              title="Approved Expenses"
              value={summary?.totals.approvedExpenseCount ?? 0}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <Card size="small" className="!rounded-lg" style={{ borderLeft: `3px solid ${BRAND_RED}` }}>
            <Statistic
              title="Rejected"
              value={summary?.totals.rejectedExpenseCount ?? 0}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
      </Row>

      {summary && summary.allocations.length > 0 && (
        <>
          <Table<ExpenseBudgetAllocationDTO>
            style={{ marginTop: 20 }}
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={summary.allocations}
            components={brandTableComponents}
            columns={[
              { title: "Allocated To", dataIndex: "targetLabel" },
              {
                title: "Type",
                dataIndex: "targetType",
                render: (value: ExpenseBudgetTargetType) => EXPENSE_BUDGET_TARGET_TYPE_LABELS[value],
              },
              { title: "Allocated", dataIndex: "allocatedAmount", render: formatExpenseBudgetCurrency },
              { title: "Used", dataIndex: "usedAmount", render: formatExpenseBudgetCurrency },
              { title: "Remaining", dataIndex: "remainingAmount", render: formatExpenseBudgetCurrency },
              { title: "Approved", dataIndex: "approvedExpenseCount" },
              {
                title: "Created By",
                dataIndex: "createdBy",
                render: (value: string) => getTeamMemberName(value),
              },
              {
                title: "Actions",
                render: (_value, allocation) => (
                  <Space>
                    <Button size="small" icon={<HistoryOutlined />} onClick={() => openHistory(allocation)}>
                      History
                    </Button>
                    {canAllocate && (
                      <Button
                        size="small"
                        onClick={() => openEdit(allocation)}
                        style={{ borderColor: BRAND_NAVY, color: BRAND_NAVY }}
                      >
                        Adjust
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />

          <Tabs
            style={{ marginTop: 20 }}
            items={[
              { key: "employees", label: "By Employee", children: <BreakdownTable rows={summary.breakdowns.employees} /> },
              { key: "categories", label: "By Category", children: <BreakdownTable rows={summary.breakdowns.categories} /> },
              { key: "teams", label: "By Team", children: <BreakdownTable rows={summary.breakdowns.teams} /> },
              { key: "departments", label: "By Department", children: <BreakdownTable rows={summary.breakdowns.departments} /> },
              { key: "approvers", label: "By HR / Manager", children: <BreakdownTable rows={summary.breakdowns.approvers} /> },
            ]}
          />
        </>
      )}

      <Modal
        title={editingAllocation ? "Adjust Expense Budget" : "Allocate Expense Budget"}
        open={allocationModalOpen}
        onCancel={() => setAllocationModalOpen(false)}
        onOk={() => void saveAllocation()}
        confirmLoading={saving}
        okText={editingAllocation ? "Save Adjustment" : "Create Allocation"}
        destroyOnHidden
        okButtonProps={{
          style: { backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY },
        }}
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="month" label="Month" rules={[{ required: true }]}>
            <DatePicker picker="month" format="MMMM YYYY" style={{ width: "100%" }} disabled={Boolean(editingAllocation)} />
          </Form.Item>
          <Form.Item name="targetType" label="Allocate To" rules={[{ required: true }]}>
            <Select
              disabled={Boolean(editingAllocation)}
              options={Object.entries(EXPENSE_BUDGET_TARGET_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={() => form.setFieldValue("targetId", undefined)}
            />
          </Form.Item>
          <Form.Item name="targetId" label="Target" rules={[{ required: true, message: "Please select an allocation target" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              disabled={Boolean(editingAllocation)}
              options={targetOptions}
              placeholder="Select HR, manager, department, or manager team"
            />
          </Form.Item>
          <Form.Item
            name="allocatedAmount"
            label="Amount"
            rules={[{ required: true }, { type: "number", min: editingAllocation ? 0 : 0.01 }]}
          >
            <InputNumber min={editingAllocation ? 0 : 0.01} precision={2} prefix="₹" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea maxLength={500} showCount rows={3} />
          </Form.Item>
          {editingAllocation && (
            <Text type="secondary">
              Used: {formatExpenseBudgetCurrency(editingAllocation.usedAmount)}. Reducing below the used amount requires the overspend permission.
            </Text>
          )}
        </Form>
      </Modal>

      <Modal
        title={`Budget History${historyAllocation ? ` — ${historyAllocation.targetLabel}` : ""}`}
        open={Boolean(historyAllocation)}
        onCancel={() => setHistoryAllocation(null)}
        footer={
          <Space>
            {historyCursor && historyAllocation && (
              <Button loading={historyLoading} onClick={() => void loadHistory(historyAllocation, historyCursor)}>
                Load More
              </Button>
            )}
            <Button onClick={() => setHistoryAllocation(null)}>Close</Button>
          </Space>
        }
        width={900}
      >
        <Table<ExpenseBudgetTransactionDTO>
          loading={historyLoading && history.length === 0}
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={history}
          components={brandTableComponents}
          locale={{ emptyText: "No budget activity" }}
          columns={[
            { title: "Date", dataIndex: "createdAt", render: (value: number) => dayjs(value).format("DD MMM YYYY, hh:mm A") },
            { title: "Activity", dataIndex: "type", render: (value: ExpenseBudgetTransactionDTO["type"]) => EXPENSE_BUDGET_TRANSACTION_LABELS[value] },
            { title: "Employee", dataIndex: "employeeName", render: (value?: string) => value || "-" },
            { title: "Category", dataIndex: "category", render: (value?: string) => value || "-" },
            {
              title: "Amount",
              dataIndex: "amount",
              render: (value: number) => (
                <Text type={value < 0 ? "danger" : "success"}>{value > 0 ? "+" : ""}{formatExpenseBudgetCurrency(value)}</Text>
              ),
            },
            { title: "Balance", dataIndex: "balanceAfter", render: formatExpenseBudgetCurrency },
            {
              title: "By",
              render: (_value, record) =>
                record.createdByName || getTeamMemberName(record.createdBy),
            },
          ]}
        />
      </Modal>
    </Card>
  );
};

export default ExpenseBudgetSection;