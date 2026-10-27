import { useEffect, useMemo, useState } from "react";
import { Alert, Card, Table, Typography, DatePicker, Tag, Empty, Button, Space, Skeleton } from "antd";
import { EnvironmentOutlined } from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { leadApi, type LeadCityStateReportRow } from "@/features/leads";
import { UploadCloudIcon, MapPin, Building2, Users } from "lucide-react";
import { mapAntdToExportColumns } from "@/shared/lib/mapAntdColumns";
import fileExport from "@/shared/utils/fileExport";

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

export default function CityStateReport() {
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id);

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("D"),
  ]);
  const [reportRows, setReportRows] = useState<LeadCityStateReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!outletId) return;

    const controller = new AbortController();
    const [startDate, endDate] = dateRange;
    setLoading(true);
    setLoadError(null);

    void leadApi
      .getCityStateReport(
        {
          outletId,
          startDate: startDate.startOf("day").valueOf(),
          endDate: endDate.endOf("day").valueOf(),
        },
        controller.signal,
      )
      .then((data) => setReportRows(data.rows))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setReportRows([]);
        setLoadError(
          error instanceof Error ? error.message : "Unable to load report data",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [dateRange, outletId]);

  const columns = [
    {
      title: "No",
      render: (_: unknown, __: LeadCityStateReportRow, index: number) => index + 1,
      width: 60,
    },
    {
      title: "State",
      dataIndex: "state",
      width: 160,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) =>
        a.state.localeCompare(b.state),
    },
    {
      title: "City",
      dataIndex: "city",
      width: 160,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) =>
        a.city.localeCompare(b.city),
    },
    {
      title: "New",
      dataIndex: "new",
      width: 100,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) => a.new - b.new,
      render: (v: number) => <Tag color="blue" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Assigned",
      dataIndex: "assigned",
      width: 100,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) =>
        a.assigned - b.assigned,
      render: (v: number) => <Tag color="blue" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Followup",
      dataIndex: "followup",
      width: 100,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) =>
        a.followup - b.followup,
      render: (v: number) => <Tag color="orange" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Completed",
      dataIndex: "completed",
      width: 100,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) =>
        a.completed - b.completed,
      render: (v: number) => <Tag color="green" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Lost",
      dataIndex: "lost",
      width: 100,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) =>
        a.lost - b.lost,
      render: (v: number) => <Tag color="red" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Disqualified",
      dataIndex: "disqual",
      width: 100,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) =>
        a.disqual - b.disqual,
      render: (v: number) => <Tag color="red" className="!rounded-full">{v}</Tag>,
    },
    {
      title: "Total Leads",
      dataIndex: "total",
      width: 100,
      sorter: (a: LeadCityStateReportRow, b: LeadCityStateReportRow) =>
        a.total - b.total,
      render: (v: number) => <Text strong style={{ color: BRAND_NAVY }}>{v}</Text>,
    },
  ];

  const exportPDF = () => {
    const exportColumns = mapAntdToExportColumns(columns);
    fileExport.exportToPDF(reportRows, exportColumns, "City_Wise_Report.pdf");
  };

  const summary = useMemo(() => {
    const states = new Set(reportRows.map((r) => r.state)).size;
    const cities = new Set(reportRows.map((r) => `${r.state}_${r.city}`)).size;
    const totalLeads = reportRows.reduce((sum, r) => sum + r.total, 0);
    return { states, cities, totalLeads };
  }, [reportRows]);

  const summaryCards = [
    { key: "states", label: "States Covered", value: summary.states, accent: BRAND_NAVY, icon: <MapPin size={20} /> },
    { key: "cities", label: "Cities Covered", value: summary.cities, accent: "#7c3aed", icon: <Building2 size={20} /> },
    { key: "leads", label: "Total Leads", value: summary.totalLeads, accent: BRAND_RED, icon: <Users size={20} /> },
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
              <EnvironmentOutlined style={{ color: BRAND_RED, fontSize: 18 }} />
            </div>
            <div>
              <Title level={2} className="!mb-1 !text-white">
                State &amp; City Wise Report
              </Title>
              <Text className="text-slate-200 !text-white">
                View leads grouped by State and City with stage-wise summary.
              </Text>
            </div>
          </div>

          <Space wrap>
            <RangePicker
              disabledDate={(current) => current && current > dayjs().endOf("day")}
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
            <Button
              icon={<UploadCloudIcon size={15} />}
              onClick={exportPDF}
              style={{ backgroundColor: BRAND_RED, borderColor: BRAND_RED, color: "#fff" }}
            >
              Export
            </Button>
          </Space>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => (
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

      {loadError && (
        <Alert
          className="mb-5 !rounded-xl"
          message="Unable to load city and state report"
          description={loadError}
          showIcon
          type="error"
        />
      )}

      <Card className="!rounded-xl border-0 shadow-sm">
        <Title level={4} style={{ marginBottom: 16 }}>
          City Wise Lead Summary
        </Title>

        {loading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : reportRows.length === 0 ? (
          <Empty
            description="No city summary data found for selected date range"
            className="my-6"
          />
        ) : (
          <Table
            columns={columns}
            dataSource={reportRows}
            pagination={false}
            scroll={{ x: "max-content" }}
            rowKey={(row) => `${row.state}_${row.city}`}
            rowClassName={() => "hover:bg-gray-50"}
          />
        )}
      </Card>
    </div>
  );
}