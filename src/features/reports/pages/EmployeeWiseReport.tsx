import { useEffect, useMemo, useState } from "react";
import {
  Card,
  Table,
  DatePicker,
  Typography,
  Tag,
  Empty,
  Row,
  Col,
  Statistic,
  Button,
  Space,
  Input,
  Modal,
  Skeleton,
} from "antd";
import {
  TrophyOutlined,
  FireOutlined,
  StarOutlined,
} from "@ant-design/icons";
import { Award, TrendingUp, Users } from "lucide-react";
import dayjs, { Dayjs } from "dayjs";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { RootState } from "@/app/store";
import { leadApi } from "@/features/leads";
import { LeadsManagement } from "@/features/leads";
import { TeamTreeDTO } from "@/features/team";
import { LEAD_STAGE, ROUTES_PATHS } from "@/shared/lib/constants";
import { formatEmployeeName, formatLeadStageLabel, toTitleCase } from "@/shared/utils/helperFunctions";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;
const EMPLOYEE_DRILLDOWN_LIMIT = 100;

const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

const FUNNEL_STAGE_BY_LEAD_STAGE: Partial<Record<LEAD_STAGE, string>> = {
  [LEAD_STAGE.NEW]: "new",
  [LEAD_STAGE.ASSIGNED]: "assigned",
  [LEAD_STAGE.FOLLOWUP]: "followup",
  [LEAD_STAGE.WON]: "closed",
  [LEAD_STAGE.LOST]: "lost",
  [LEAD_STAGE.DISQUALIFIED]: "disqualified",
};

const STAGE_FILTER_OPTIONS: Array<{
  label: string;
  value: LEAD_STAGE | "ALL";
}> = [
  { label: "All Stages", value: "ALL" },
  { label: "New", value: LEAD_STAGE.NEW },
  { label: "Assigned", value: LEAD_STAGE.ASSIGNED },
  { label: "Followup", value: LEAD_STAGE.FOLLOWUP },
  { label: "Won", value: LEAD_STAGE.WON },
  { label: "Lost", value: LEAD_STAGE.LOST },
  { label: "Disqualified", value: LEAD_STAGE.DISQUALIFIED },
];

const RANK_ACCENT = ["#FFD700", "#C0C0C0", "#CD7F32"];

interface EmployeeWiseReportRow {
  key: string;
  userName: string;
  assigned: number;
  followup: number;
  completed: number;
  lost: number;
  total: number;
  performanceScore: number;
  conversionRate: number;
}

export default function EmployeeWiseReport() {
  const navigate = useNavigate();
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id);
  const [reportRows, setReportRows] = useState<EmployeeWiseReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("D"),
  ]);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<EmployeeWiseReportRow | null>(null);
  const [filteredLeads, setFilteredLeads] = useState<LeadsManagement[]>([]);
  const [stageFilter, setStageFilter] = useState<LEAD_STAGE | "ALL">("ALL");
  const [searchText, setSearchText] = useState("");

  const teamTreeData = useSelector(
    (state: RootState) => state.appState?.teamTreeData
  );
  const teamList = useMemo(
    () =>
      [...(teamTreeData ?? [])]
        .filter(
          (member) =>
            member?.department === "SALES" && member?.isOnPayRoll === true
        )
        .sort((first, second) =>
          first.userName.localeCompare(second.userName)
        ) as TeamTreeDTO[],
    [teamTreeData]
  );

  // Fetch lead counts based on selected date range
  useEffect(() => {
    if (!outletId) return;
    const abortController = new AbortController();

    const loadData = async () => {
      setLoading(true);
      const [startDate, endDate] = dateRange;
      try {
        const report = await leadApi.getEmployeeReport(
          {
            outletId,
            startDate: startDate.startOf("day").valueOf(),
            endDate: endDate.endOf("day").valueOf(),
          },
          abortController.signal
        );
        const rows = teamList.map((user) => {
          const stats = report.employees[user.userProfileId] ?? {
            total: 0,
            assigned: 0,
            followup: 0,
            completed: 0,
            lost: 0,
          };
          const performanceScore =
            stats.completed * 500 +
            stats.followup * 3 +
            stats.assigned -
            stats.lost * 2;
          const conversionRate =
            stats.total > 0
              ? Number(((stats.completed / stats.total) * 100).toFixed(1))
              : 0;

          return {
            key: user.userProfileId,
            userName: user.userName,
            ...stats,
            performanceScore,
            conversionRate,
          };
        });

        setReportRows(
          rows.sort(
            (first, second) =>
              second.performanceScore - first.performanceScore
          )
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Failed to load employee lead report", error);
        setReportRows([]);
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    };

    void loadData();
    return () => abortController.abort();
  }, [dateRange, outletId, teamList]);

  // Get top 3 performers based on performance score
  const topPerformers = useMemo(() => {
    return [...reportRows]
      .sort((a, b) => b.performanceScore - a.performanceScore)
      .slice(0, 3);
  }, [reportRows]);

  const getTrophyIcon = (index: number) => {
    const icons = [
      <TrophyOutlined style={{ fontSize: 32, color: "#FFD700" }} />,
      <TrophyOutlined style={{ fontSize: 32, color: "#C0C0C0" }} />,
      <TrophyOutlined style={{ fontSize: 32, color: "#CD7F32" }} />,
    ];
    return icons[index];
  };

  const handleViewLeads = async (record: EmployeeWiseReportRow) => {
    if (!outletId) return;

    setSelectedUser(record);
    setFilteredLeads([]);
    setStageFilter("ALL");
    setSearchText("");
    setViewModalOpen(true);
    setModalLoading(true);

    const [startDate, endDate] = dateRange;
    try {
      const result = await leadApi.getLeads({
        outletId,
        startDate: startDate.startOf("day").valueOf(),
        endDate: endDate.endOf("day").valueOf(),
        assignedTo: record.key,
        limit: EMPLOYEE_DRILLDOWN_LIMIT,
      });
      setFilteredLeads(result.items);
    } catch (error) {
      console.error("Failed to load employee leads", error);
      setFilteredLeads([]);
    } finally {
      setModalLoading(false);
    }
  };
  const displayedLeads = useMemo(() => {
    let data = filteredLeads;

    if (stageFilter !== "ALL") {
      data = data.filter((l) => l.stage === stageFilter);
    }

    if (searchText) {
      data = data.filter(
        (l) =>
          l?.username?.toLowerCase().includes(searchText.toLowerCase()) ||
          l?.mobile?.includes(searchText)
      );
    }

    return data;
  }, [filteredLeads, stageFilter, searchText]);

  const handleStageClick = (lead: LeadsManagement) => {
    const [startDate, endDate] = dateRange;
    const searchParams = new URLSearchParams({
      stage: FUNNEL_STAGE_BY_LEAD_STAGE[lead.stage] || "total",
      startDate: String(startDate.startOf("day").valueOf()),
      endDate: String(endDate.endOf("day").valueOf()),
      period: `${startDate.format("DD MMM YYYY")} - ${endDate.format("DD MMM YYYY")}`,
      employeeName: formatEmployeeName(selectedUser?.userName),
      leadId: lead.id,
      returnTo: ROUTES_PATHS.EMPLOYEE_WISE_REPORT,
      returnLabel: "Employee Wise",
    });

    if (selectedUser?.key) {
      searchParams.set("assignedTo", selectedUser.key);
    }

    setViewModalOpen(false);
    navigate(`${ROUTES_PATHS.LEADS_FUNNEL_DETAILS}?${searchParams.toString()}`);
  };

  const columns = [
    {
      title: "No",
      render: (_: unknown, record: EmployeeWiseReportRow, index: number) => {
        const rank = topPerformers.findIndex((p) => p.key === record.key);
        return rank !== -1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {index + 1}
            {rank === 0 && <TrophyOutlined style={{ color: "#FFD700" }} />}
            {rank === 1 && <TrophyOutlined style={{ color: "#C0C0C0" }} />}
            {rank === 2 && <TrophyOutlined style={{ color: "#CD7F32" }} />}
          </div>
        ) : (
          index + 1
        );
      },
      width: 80,
    },
    {
      title: "Employee Name",
      dataIndex: "userName",
      width: 180,
      render: (name: string, record: EmployeeWiseReportRow) => {
        const rank = topPerformers.findIndex((p) => p.key === record.key);
        const displayName = formatEmployeeName(name);
        return rank !== -1 ? <Text strong>{displayName}</Text> : displayName;
      },
    },
    {
      title: "Total Leads",
      dataIndex: "total",
      width: 100,
      render: (v: number) => <Tag className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Assigned",
      dataIndex: "assigned",
      width: 100,
      render: (v: number) => <Tag color="blue" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Followup",
      dataIndex: "followup",
      width: 100,
      render: (v: number) => <Tag color="orange" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Completed",
      dataIndex: "completed",
      width: 100,
      render: (v: number) => <Tag color="green" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Lost",
      dataIndex: "lost",
      width: 100,
      render: (v: number) => <Tag color="red" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Conversion Rate",
      dataIndex: "conversionRate",
      width: 120,
      render: (v: number) => <Text strong>{v}%</Text>,
      sorter: (a: EmployeeWiseReportRow, b: EmployeeWiseReportRow) => a.conversionRate - b.conversionRate,
    },
    {
      title: "Points Earned",
      dataIndex: "performanceScore",
      width: 120,
      render: (v: number) => <Text strong style={{ color: BRAND_NAVY }}>{v}</Text>,
      sorter: (a: EmployeeWiseReportRow, b: EmployeeWiseReportRow) => a.performanceScore - b.performanceScore,
    },
    {
      title: "Action",
      key: "action",
      width: 120,
      fixed: "right" as const,
      render: (_: unknown, record: EmployeeWiseReportRow) => (
        <Button type="link" style={{ color: BRAND_NAVY }} onClick={() => handleViewLeads(record)}>
          View
        </Button>
      ),
    },
  ];

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalLeads = reportRows.reduce((sum, r) => sum + r.total, 0);
    const totalCompleted = reportRows.reduce((sum, r) => sum + r.completed, 0);
    const avgConversion =
      reportRows.length > 0
        ? reportRows.reduce((sum, r) => sum + r.conversionRate, 0) /
          reportRows.length
        : 0;
    const totalActive = reportRows.filter((r) => r.total > 0).length;

    return { totalLeads, totalCompleted, avgConversion, totalActive };
  }, [reportRows]);

  const summaryCards = [
    {
      key: "total",
      label: "Total Leads",
      value: summaryStats.totalLeads,
      accent: BRAND_NAVY,
      icon: <Users size={20} />,
    },
    {
      key: "completed",
      label: "Total Completed",
      value: summaryStats.totalCompleted,
      accent: "#389e0d",
      icon: <Award size={20} />,
    },
    {
      key: "conversion",
      label: "Avg Conversion",
      value: `${Number(summaryStats?.avgConversion?.toFixed(2))}%`,
      accent: "#7c3aed",
      icon: <TrendingUp size={20} />,
    },
    {
      key: "active",
      label: "Active Employees",
      value: summaryStats.totalActive,
      accent: "#d48806",
      icon: <Users size={20} />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
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
              <TrophyOutlined style={{ color: BRAND_RED, fontSize: 18 }} />
            </div>
            <div>
              <Title level={2} className="!mb-1 !text-white">
                Employee Wise Lead Report
              </Title> 
              <Text className="text-slate-200 !text-white">
                View performance of each employee with stage-wise summary.
              </Text>
            </div>
          </div>

          <Space>
            <RangePicker
              disabledDate={(current) =>
                current && current > dayjs().endOf("day")
              }
              presets={[
                { label: "Today", value: [dayjs(), dayjs()] },
                {
                  label: "Last 7 Days",
                  value: [dayjs().subtract(6, "day"), dayjs()],
                },
                {
                  label: "This Month",
                  value: [dayjs().startOf("month"), dayjs().endOf("month")],
                },
              ]}
              value={dateRange}
              allowClear={false}
              onChange={(dates) => {
                if (dates) setDateRange(dates as [Dayjs, Dayjs]);
              }}
            />
          </Space>
        </div>
      </div>

      {/* Summary Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: "20px" }}>
        {summaryCards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.key}>
            <Card
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
          </Col>
        ))}
      </Row>

      {/* Top 3 Performers */}
      {loading ? (
        <Card className="mb-5 !rounded-xl border-0 shadow-sm">
          <Skeleton active paragraph={{ rows: 4 }} />
        </Card>
      ) : (
        topPerformers.length > 0 && (
          <Card
            className="!rounded-xl border-0 shadow-sm"
            style={{ marginBottom: "20px" }}
            styles={{ body: { padding: 22 } }}
          >
            <div className="mb-4 flex items-center gap-2">
              <TrophyOutlined style={{ color: "#FFD700", fontSize: 18 }} />
              <Title level={4} className="!mb-0">
                Top 3 Performers
              </Title>
            </div>
            <Row gutter={[16, 16]}>
              {topPerformers.map((performer, index) => (
                <Col xs={24} sm={24} md={8} key={performer.key}>
                  <Card
                    hoverable
                    className="!rounded-xl text-center shadow-sm transition-shadow hover:shadow-md"
                    style={{
                      borderTop: `3px solid ${RANK_ACCENT[index]}`,
                      height: "100%",
                    }}
                  >
                    <div style={{ marginBottom: 12 }}>{getTrophyIcon(index)}</div>
                    <Title level={5} style={{ marginBottom: 8 }}>
                      {formatEmployeeName(performer.userName)}
                    </Title>
                    <Row gutter={16} style={{ marginTop: 12 }}>
                      <Col span={8}>
                        <Statistic
                          title="Completed"
                          value={performer.completed}
                          valueStyle={{ color: "#389e0d", fontSize: 20 }}
                          prefix={<FireOutlined />}
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic
                          title="Conversion"
                          value={performer.conversionRate}
                          valueStyle={{ color: BRAND_NAVY, fontSize: 20 }}
                          suffix="%"
                          prefix={<StarOutlined />}
                        />
                      </Col>
                      <Col span={8}>
                        <Statistic
                          title="Points"
                          value={performer.performanceScore}
                          valueStyle={{ color: "#389e0d", fontSize: 20 }}
                        />
                      </Col>
                    </Row>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <Text type="secondary">Total Leads: </Text>
                      <Text strong>{performer?.total}</Text>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        )
      )}

      {/* Table */}
      <Card className="!rounded-xl border-0 shadow-sm">
        <Title level={4} style={{ marginBottom: 16 }}>
          Complete Report
        </Title>

        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : reportRows?.length === 0 ? (
          <Empty
            description="No data found for selected date range"
            className="my-6"
          />
        ) : (
          <Table
            columns={columns}
            dataSource={reportRows}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            rowClassName={(record) => {
              const rank = topPerformers.findIndex((p) => p.key === record.key);
              return rank !== -1
                ? "bg-yellow-50 hover:bg-yellow-100"
                : "hover:bg-gray-50";
            }}
          />
        )}
      </Card>

      <Modal
        open={viewModalOpen}
        onCancel={() => setViewModalOpen(false)}
        footer={null}
        width="100%"
        centered={false}
        className="employee-leads-full-page-modal"
        rootClassName="employee-leads-full-page-modal-root"
        getContainer={() => document.querySelector(".app-main") ?? document.body}
        destroyOnHidden
        title={
          <div>
            <Text strong style={{ fontSize: 16 }}>
              Leads – {formatEmployeeName(selectedUser?.userName)}
            </Text>
            <div style={{ color: "#888", fontSize: 12 }}>
              Total Leads: {selectedUser?.total ?? 0}
            </div>
          </div>
        }
      >
        {/* Filters */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Space size={[8, 8]} wrap>
            {STAGE_FILTER_OPTIONS.map((option) => {
              const isActive = stageFilter === option.value;

              return (
                <Button
                  key={option.value}
                  type={isActive ? "primary" : "default"}
                  aria-pressed={isActive}
                  onClick={() => setStageFilter(option.value)}
                  style={{
                    borderRadius: 8,
                    fontWeight: isActive ? 600 : 500,
                    backgroundColor: isActive ? BRAND_NAVY : undefined,
                    borderColor: isActive ? BRAND_NAVY : undefined,
                  }}
                >
                  {option.label}
                </Button>
              );
            })}
          </Space>
          <Input.Search
            placeholder="Search by name or mobile"
            allowClear
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 240 }}
          />
        </div>

        {/* Leads Table */}
        <Table
          size="middle"
          bordered
          rowKey="id"
          loading={modalLoading}
          dataSource={displayedLeads}
          pagination={{ pageSize: 8 }}
          scroll={{ x: true, y: "calc(100dvh - 250px)" }}
          columns={[
            {
              title: "Customer",
              dataIndex: "username",
              render: (v: string) => <Text strong>{toTitleCase(v, "-")}</Text>,
            },
            {
              title: "Mobile",
              dataIndex: "mobile",
            },
            {
              title: "Stage",
              dataIndex: "stage",
              render: (stage: LEAD_STAGE, lead: LeadsManagement) => {
                const colorMap: Record<string, string> = {
                  NEW: "purple",
                  ASSIGNED: "blue",
                  FOLLOWUP: "orange",
                  WON: "green",
                  LOST: "red",
                  DISQUALIFIED: "orange",
                };
                return (
                  <Tag
                    color={colorMap[stage]}
                    role="button"
                    tabIndex={0}
                    className="!rounded-full"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleStageClick(lead)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleStageClick(lead);
                      }
                    }}
                  >
                    {formatLeadStageLabel(stage)}
                  </Tag>
                );
              },
            },
            {
              title: "Created On",
              dataIndex: "createdDate",
              render: (v: number) => dayjs(v).format("DD MMM YYYY"),
            },
          ]}
        />
      </Modal>
    </div>
  );
}