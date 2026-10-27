import { useCallback, useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import {
  Card,
  Col,
  DatePicker,
  Empty,
  Layout,
  Modal,
  Row,
  Table,
  Tag,
  Typography,
  Statistic,
  Space,
  Badge,
  Progress,
  Segmented,
  Input,
  Select,
  Button,
  Avatar,
  Tooltip,
  Divider,
  Alert,
  Skeleton,
} from "antd";
import {
  PhoneOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  FilterOutlined,
  DownloadOutlined,
  TrophyOutlined,
  FireOutlined,
  ClockCircleOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useThemeMode } from "@/shared/hooks";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import {
  callApi,
  type CallDirection,
  type CallReport,
  type EmployeeCallItem,
} from "@/features/activities";
import { mapAntdToExportColumns } from "@/shared/lib/mapAntdColumns";
import fileExport from "@/shared/utils/fileExport";
import { formatEmployeeName, toTitleCase } from "@/shared/utils/helperFunctions";

const { Title, Text } = Typography;
const { Content } = Layout;
const { Search } = Input;

const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

type DeptSummary = {
  total: number;
  incoming: number;
  outgoing: number;
  missed: number;
  rejected: number;
  duration?: number;
};

type EmployeeCallSummary = DeptSummary & {
  key: string;
  employee: string;
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

export default function CallLogsReportPage() {
  const { isDark } = useThemeMode();
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id);

  const [date, setDate] = useState<Dayjs>(dayjs());
  const [report, setReport] = useState<CallReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [employeeCalls, setEmployeeCalls] = useState<EmployeeCallItem[]>([]);
  const [employeeCursor, setEmployeeCursor] = useState<string | null>(null);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeLoadingMore, setEmployeeLoadingMore] = useState(false);
  const [employeeDirection, setEmployeeDirection] = useState<
    CallDirection | undefined
  >();
  const [modalOpen, setModalOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    if (!outletId) {
      setReport(null);
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    setLoading(true);
    setLoadError(null);

    const start = date.startOf("day").valueOf();
    const end = date.endOf("day").valueOf();

    void callApi
      .getReport(
        {
          outletId,
          startDate: start,
          endDate: end,
          department: filterDept === "all" ? undefined : filterDept,
          search: debouncedSearch || undefined,
        },
        abortController.signal,
      )
      .then(setReport)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(
          error instanceof Error ? error.message : "Unable to load call report",
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });

    return () => abortController.abort();
  }, [date, debouncedSearch, filterDept, outletId]);

  const openEmployeeCalls = (employee: string) => {
    setSelectedEmployee(employee);
    setEmployeeCalls([]);
    setEmployeeCursor(null);
    setEmployeeDirection(undefined);
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen || !outletId || !selectedEmployee) return;

    const abortController = new AbortController();
    setEmployeeLoading(true);
    void callApi
      .getEmployeeCalls(
        {
          outletId,
          startDate: date.startOf("day").valueOf(),
          endDate: date.endOf("day").valueOf(),
          receiverName: selectedEmployee,
          direction: employeeDirection,
          limit: 50,
        },
        abortController.signal,
      )
      .then((result) => {
        setEmployeeCalls(result.items);
        setEmployeeCursor(result.nextCursor);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(
          error instanceof Error ? error.message : "Unable to load employee calls",
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) setEmployeeLoading(false);
      });

    return () => abortController.abort();
  }, [date, employeeDirection, modalOpen, outletId, selectedEmployee]);

  const loadMoreEmployeeCalls = useCallback(async () => {
    if (
      !outletId ||
      !selectedEmployee ||
      !employeeCursor ||
      employeeLoadingMore
    ) {
      return;
    }

    setEmployeeLoadingMore(true);
    try {
      const result = await callApi.getEmployeeCalls({
        outletId,
        startDate: date.startOf("day").valueOf(),
        endDate: date.endOf("day").valueOf(),
        receiverName: selectedEmployee,
        direction: employeeDirection,
        limit: 50,
        cursor: employeeCursor,
      });
      setEmployeeCalls((current) => [...current, ...result.items]);
      setEmployeeCursor(result.nextCursor);
    } catch (error: unknown) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load more calls",
      );
    } finally {
      setEmployeeLoadingMore(false);
    }
  }, [
    date,
    employeeCursor,
    employeeDirection,
    employeeLoadingMore,
    outletId,
    selectedEmployee,
  ]);

  const filteredGrouped = useMemo(
    () => report?.departments ?? {},
    [report?.departments],
  );
  const totalStats = report?.summary ?? {
    total: 0,
    incoming: 0,
    outgoing: 0,
    missed: 0,
    rejected: 0,
    duration: 0,
  };
  const topPerformers = report?.topPerformers ?? [];

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getCallIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "incoming":
        return <ArrowDownOutlined style={{ color: "#389e0d" }} />;
      case "outgoing":
        return <ArrowUpOutlined style={{ color: BRAND_NAVY }} />;
      case "missed":
        return <PhoneOutlined style={{ color: "#d48806" }} />;
      case "rejected":
        return <CloseCircleOutlined style={{ color: BRAND_RED }} />;
      default:
        return <PhoneOutlined />;
    }
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      incoming: "success",
      outgoing: "processing",
      missed: "warning",
      rejected: "error",
    };
    return colors[type.toLowerCase()] || "default";
  };

  const columns = [
    {
      title: "Employee",
      dataIndex: "employee",
      render: (name: string) => (
        <Space>
          <Avatar
            style={{ backgroundColor: `${BRAND_NAVY}14`, color: BRAND_NAVY, fontWeight: 600 }}
          >
            {getInitials(name)}
          </Avatar>
          {name === "Unknown" ? (
            <Text>{name}</Text>
          ) : (
            <Button
              type="link"
              onClick={() => openEmployeeCalls(name)}
              style={{ padding: 0, fontWeight: 500, color: BRAND_NAVY }}
            >
              {name}
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: "Total Calls",
      dataIndex: "total",
      sorter: (a: EmployeeCallSummary, b: EmployeeCallSummary) => a.total - b.total,
      render: (val: number) => (
        <Badge count={val} showZero color={BRAND_NAVY} overflowCount={10000} />
      ),
    },
    {
      title: "Incoming",
      dataIndex: "incoming",
      sorter: (a: EmployeeCallSummary, b: EmployeeCallSummary) => a.incoming - b.incoming,
      render: (val: number) => (
        <Tag color="success" icon={<ArrowDownOutlined />} className="!rounded-full">
          {val}
        </Tag>
      ),
    },
    {
      title: "Outgoing",
      dataIndex: "outgoing",
      sorter: (a: EmployeeCallSummary, b: EmployeeCallSummary) => a.outgoing - b.outgoing,
      render: (val: number) => (
        <Tag color="processing" icon={<ArrowUpOutlined />} className="!rounded-full">
          {val}
        </Tag>
      ),
    },
    {
      title: "Missed",
      dataIndex: "missed",
      sorter: (a: EmployeeCallSummary, b: EmployeeCallSummary) => a.missed - b.missed,
      render: (val: number) => <Tag color="warning" className="!rounded-full">{val}</Tag>,
    },
    {
      title: "Rejected",
      dataIndex: "rejected",
      sorter: (a: EmployeeCallSummary, b: EmployeeCallSummary) => a.rejected - b.rejected,
      render: (val: number) => <Tag color="error" className="!rounded-full">{val}</Tag>,
    },
    {
      title: "Talk Time",
      dataIndex: "duration",
      sorter: (a: EmployeeCallSummary, b: EmployeeCallSummary) => (a.duration || 0) - (b.duration || 0),
      render: (val: number) => (
        <Tooltip title={`${Math.floor(val / 60)} minutes`}>
          <Space>
            <ClockCircleOutlined className="text-slate-400" />
            <Text>{formatDuration(val)}</Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: "Performance",
      key: "performance",
      render: (_: unknown, record: EmployeeCallSummary) => {
        const answerRate =
          record.total > 0
            ? ((record.incoming + record.outgoing) / record.total) * 100
            : 0;
        return (
          <Progress
            percent={Math.round(answerRate)}
            size="small"
            strokeColor={BRAND_NAVY}
          />
        );
      },
    },
  ];

  const employeeSummaryRows = useMemo<EmployeeCallSummary[]>(
    () =>
      Object.values(filteredGrouped).flatMap((department) =>
        Object.entries(department.employees).map(([employee, stats]) => ({
          key: employee,
          employee,
          ...stats,
        }))
      ),
    [filteredGrouped]
  );

  
    const exportPDF = () => {
      const exportColumns = mapAntdToExportColumns(columns);
      fileExport.exportToPDF(employeeSummaryRows, exportColumns, "Call_Analytics_Report.pdf");
    };


  const employeeCallColumns = [
    {
      title: "Time",
      dataIndex: "timestamp",
      width: 110,
      render: (v: number) => dayjs(v).format("hh:mm A"),
      sorter: (a: EmployeeCallItem, b: EmployeeCallItem) =>
        a.timestamp - b.timestamp,
    },
    {
      title: "Direction",
      dataIndex: "direction",
      width: 120,
      render: (d: string) => (
        <Tag color={getTypeColor(d)} icon={getCallIcon(d)} className="!rounded-full">
          {toTitleCase(d)}
        </Tag>
      ),
      filters: [
        { text: "Incoming", value: "incoming" },
        { text: "Outgoing", value: "outgoing" },
        { text: "Missed", value: "missed" },
        { text: "Rejected", value: "rejected" },
      ],
      filteredValue: employeeDirection ? [employeeDirection] : null,
    },
    {
      title: "Customer",
      dataIndex: "name",
      width: 200,
      render: (v: string) => v || "Unknown",
    },
    {
      title: "Mobile",
      dataIndex: "number",
      width: 150,
    },
    {
      title: "Duration",
      dataIndex: "durationSeconds",
      width: 100,
      render: (v: number) => (v > 0 ? formatDuration(v) : "-"),
      sorter: (a: EmployeeCallItem, b: EmployeeCallItem) =>
        (a.durationSeconds || 0) - (b.durationSeconds || 0),
    },
    {
      title: "Receiver",
      dataIndex: "receiverName",
      width: 180,
      render: (name?: string) => formatEmployeeName(name, "-"),
    },
    {
      title: "Receiver No",
      dataIndex: "receiverMobileNo",
      width: 150,
    },
  ];

  const overviewStats = [
    { key: "total", label: "Total Calls", value: totalStats.total, accent: BRAND_NAVY, icon: <PhoneOutlined /> },
    { key: "incoming", label: "Incoming", value: totalStats.incoming, accent: "#389e0d", icon: <ArrowDownOutlined /> },
    { key: "outgoing", label: "Outgoing", value: totalStats.outgoing, accent: "#7c3aed", icon: <ArrowUpOutlined /> },
    { key: "missed", label: "Missed/Rejected", value: totalStats.missed + totalStats.rejected, accent: BRAND_RED, icon: <CloseCircleOutlined /> },
  ];

  return (
    <Layout style={{ minHeight: "100vh", background: isDark ? "#141414" : "#f8fafc" }}>
      <Content style={{ padding: "24px 32px" }}>
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
                <PhoneOutlined style={{ color: BRAND_RED, fontSize: 18 }} />
              </div>
              <div>
                <Title level={2} className="!mb-1 !text-white">
                  Call Analytics Dashboard
                </Title>
                <Text className="text-slate-200 !text-white">
                  Track and analyze your team's call performance.
                </Text>
              </div>
            </div>

            <Space size="middle">
              <DatePicker
                value={date}
                onChange={(d) => setDate(d || dayjs())}
                allowClear={false}
                disabledDate={(current) =>
                  current && current > dayjs().endOf("day")
                }
              />
              <Button
                icon={<DownloadOutlined />}
                onClick={exportPDF}
                style={{ backgroundColor: BRAND_RED, borderColor: BRAND_RED, color: "#fff" }}
              >
                Export
              </Button>
            </Space>
          </div>
        </div>

        {loadError && (
          <Alert
            closable
            message={loadError}
            onClose={() => setLoadError(null)}
            showIcon
            style={{ marginBottom: 20, borderRadius: 10 }}
            type="error"
          />
        )}

        {loading && !report ? (
          <Card className="!rounded-xl border-0 shadow-sm">
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : !loading && totalStats.total === 0 ? (
          <div style={{ marginTop: 80 }}>
            <Empty description="No call logs found for selected date" />
          </div>
        ) : (
          <>
            {/* Overview Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
              {overviewStats.map((stat) => (
                <Col xs={24} sm={12} lg={6} key={stat.key}>
                  <Card
                    size="small"
                    className="!rounded-xl border-0 shadow-sm"
                    style={{ borderLeft: `4px solid ${stat.accent}` }}
                    styles={{ body: { padding: 16 } }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <Text type="secondary" className="text-[12.5px] font-medium uppercase tracking-wide">
                          {stat.label}
                        </Text>
                        <div className="mt-1 text-2xl font-semibold" style={{ color: stat.accent }}>
                          {stat.value}
                        </div>
                      </div>
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${stat.accent}14`, color: stat.accent }}
                      >
                        {stat.icon}
                      </div>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>

            {/* Top Performers */}
            {topPerformers.length > 0 && (
              <Card
                title={
                  <Space>
                    <TrophyOutlined style={{ color: "#FFD700" }} />
                    <Text strong>Top Performers Today</Text>
                  </Space>
                }
                className="!rounded-xl border-0 shadow-sm"
                style={{ marginBottom: 20 }}
              >
                <Row gutter={16}>
                  {topPerformers.map((performer, idx) => (
                    <Col xs={24} sm={8} key={performer.name}>
                      <Card
                        size="small"
                        className="!rounded-xl"
                        style={{
                          borderTop: idx === 0 ? "3px solid #FFD700" : `3px solid ${BRAND_NAVY}22`,
                        }}
                      >
                        <Space direction="vertical" style={{ width: "100%" }}>
                          <Space>
                            {idx === 0 && (
                              <FireOutlined style={{ color: "#FFD700", fontSize: 18 }} />
                            )}
                            <Text strong style={{ fontSize: 15 }}>
                              {formatEmployeeName(performer.name)}
                            </Text>
                          </Space>
                          <Text type="secondary">{performer.dept}</Text>
                          <Space split="|">
                            <Text>
                              <PhoneOutlined /> {performer.total} calls
                            </Text>
                            <Text>
                              <ClockCircleOutlined />{" "}
                              {formatDuration(performer.duration)}
                            </Text>
                          </Space>
                        </Space>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Card>
            )}

            {/* Filters & Search */}
            <Card className="!rounded-xl border-0 shadow-sm" style={{ marginBottom: 20 }}>
              <Row gutter={16} align="middle">
                <Col flex="auto">
                  <Search
                    placeholder="Search employees..."
                    allowClear
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    prefix={<SearchOutlined className="text-slate-400" />}
                  />
                </Col>
                <Col>
                  <Select
                    value={filterDept}
                    onChange={setFilterDept}
                    style={{ width: 180 }}
                    suffixIcon={<FilterOutlined />}
                  >
                    <Select.Option value="all">All Departments</Select.Option>
                    {(report?.availableDepartments ?? []).map((dept) => (
                      <Select.Option key={dept} value={dept}>
                        {dept}
                      </Select.Option>
                    ))}
                  </Select>
                </Col>
                <Col>
                  <Segmented
                    value={viewMode}
                    onChange={(val) => setViewMode(val as "cards" | "list")}
                    options={[
                      { label: "Cards", value: "cards" },
                      { label: "List", value: "list" },
                    ]}
                  />
                </Col>
              </Row>
            </Card>

            {/* Department Data */}
            {viewMode === "cards" ? (
              <Row gutter={[16, 16]}>
                {Object.entries(filteredGrouped).map(([dept, val]) => (
                  <Col xs={24} key={dept}>
                    <Card
                      className="!rounded-xl border-0 shadow-sm"
                      title={
                        <Space>
                          <Tag
                            color="blue"
                            icon={<TeamOutlined />}
                            className="!rounded-full"
                            style={{ fontSize: 14, padding: "3px 10px" }}
                          >
                            {dept}
                          </Tag>
                          <Text type="secondary">
                            ({val.summary.total} calls)
                          </Text>
                        </Space>
                      }
                      extra={
                        <Space size="large">
                          <Statistic
                            title="Incoming"
                            value={val.summary.incoming}
                            valueStyle={{ fontSize: 16, color: "#389e0d" }}
                          />
                          <Statistic
                            title="Outgoing"
                            value={val.summary.outgoing}
                            valueStyle={{ fontSize: 16, color: BRAND_NAVY }}
                          />
                          <Statistic
                            title="Missed"
                            value={val.summary.missed}
                            valueStyle={{ fontSize: 16, color: "#d48806" }}
                          />
                        </Space>
                      }
                    >
                      <Table
                        columns={columns}
                        dataSource={Object.entries(val.employees).map(
                          ([employee, stats]) => ({
                            key: employee,
                            employee,
                            ...stats,
                          })
                        )}
                        pagination={false}
                        size="middle"
                      />
                    </Card>
                  </Col>
                ))}
              </Row>
            ) : (
              <Card className="!rounded-xl border-0 shadow-sm">
                {Object.entries(filteredGrouped).map(([dept, val], idx) => (
                  <div key={dept}>
                    {idx > 0 && <Divider />}
                    <Title level={4} style={{ marginBottom: 16 }}>
                      <Tag color="blue" icon={<TeamOutlined />} className="!rounded-full">
                        {dept}
                      </Tag>
                    </Title>
                    <Table
                      columns={columns}
                      dataSource={Object.entries(val.employees).map(
                        ([employee, stats]) => ({
                          key: employee,
                          employee,
                          ...stats,
                        })
                      )}
                      pagination={false}
                      size="middle"
                    />
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* Employee Detail Modal */}
        <Modal
          title={
            <Space>
              <Avatar style={{ backgroundColor: `${BRAND_NAVY}14`, color: BRAND_NAVY, fontWeight: 600 }}>
                {selectedEmployee ? getInitials(selectedEmployee) : ""}
              </Avatar>
              <span>
                {selectedEmployee} — {date.format("DD MMM YYYY")}
              </span>
            </Space>
          }
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={null}
          width={1000}
        >
          <Table
            rowKey="id"
            columns={employeeCallColumns}
            dataSource={[...employeeCalls].sort(
              (a, b) => b.timestamp - a.timestamp,
            )}
            loading={employeeLoading}
            onChange={(_pagination, filters) => {
              const value = filters.direction?.[0] as Key | undefined;
              setEmployeeDirection(
                typeof value === "string"
                  ? (value as CallDirection)
                  : undefined,
              );
            }}
            pagination={{ pageSize: 10 }}
            size="middle"
            bordered
          />
          {employeeCursor && (
            <div className="mt-4 flex justify-center">
              <Button
                loading={employeeLoadingMore}
                onClick={loadMoreEmployeeCalls}
              >
                Load more calls
              </Button>
            </div>
          )}
        </Modal>
      </Content>
    </Layout>
  );
}