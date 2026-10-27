import { useEffect, useState, JSX } from "react";
import {
  Card,
  Row,
  Col,
  Typography,
  DatePicker,
  Statistic,
  Space,
  Alert,
  Skeleton,
} from "antd";
import {
  FacebookOutlined,
  GoogleOutlined,
  InstagramOutlined,
  GlobalOutlined,
  BarChartOutlined,
} from "@ant-design/icons";
import dayjs, { Dayjs } from "dayjs";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { LogoIcon } from "@/shared/components";
import { formatLeadSourceLabel } from "@/shared/utils/helperFunctions";
import {
  leadApi,
  type LeadReportSource,
  type LeadSourceStats,
} from "@/features/leads";

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

const SOURCES = [
  "Indiamart",
  "JustDail",
  "Facebook",
  "Instagram",
  "Google",
  "Website",
  "Other",
] as const;

type LeadSourceName = (typeof SOURCES)[number] & LeadReportSource;

const emptySourceStats = (): Record<LeadSourceName, LeadSourceStats> =>
  SOURCES.reduce((acc, source) => {
    acc[source] = { total: 0, new: 0, follow: 0, completed: 0, lost: 0 };
    return acc;
  }, {} as Record<LeadSourceName, LeadSourceStats>);

const sourceAccents: Record<LeadSourceName, string> = {
  Indiamart: "#f5a623",
  JustDail: "#f5222d",
  Facebook: "#1877F2",
  Instagram: "#E1306C",
  Google: "#DB4437",
  Website: BRAND_NAVY,
  Other: "#64748b",
};

export default function SourceWiseReport() {
  const outletId = useSelector((s: RootState) => s.appState.outletInfo.id);
  const [grouped, setGrouped] = useState<Record<LeadSourceName, LeadSourceStats>>(
    () => emptySourceStats()
  );
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("D"),
  ]);

  const sources = SOURCES;

  const icons: Record<string, JSX.Element> = {
    Indiamart: (
      <LogoIcon src="/icons/indiamart.svg" alt="IndiaMART" size={20} />
    ),
    JustDail: <LogoIcon src="/icons/justdial.svg" alt="Justdial" size={20} />,
    Facebook: <FacebookOutlined style={{ color: "#1877F2", fontSize: 18 }} />,
    Instagram: <InstagramOutlined style={{ color: "#E1306C", fontSize: 18 }} />,
    Google: <GoogleOutlined style={{ color: "#DB4437", fontSize: 18 }} />,
    Website: <GlobalOutlined style={{ fontSize: 18, color: BRAND_NAVY }} />,
    Other: <GlobalOutlined style={{ fontSize: 18, color: "#64748b" }} />,
  };

  useEffect(() => {
    if (!outletId) return;
    const abortController = new AbortController();
    const [startDate, endDate] = dateRange;
    setLoading(true);
    setLoadError(null);

    void leadApi
      .getSourceReport(
        {
          outletId,
          startDate: startDate.startOf("day").valueOf(),
          endDate: endDate.endOf("day").valueOf(),
        },
        abortController.signal
      )
      .then((result) => setGrouped(result.sources))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setGrouped(emptySourceStats());
        setLoadError(
          error instanceof Error ? error.message : "Unable to load source report"
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });

    return () => abortController.abort();
  }, [dateRange, outletId]);

  const totalLeads = sources.reduce((sum, src) => sum + grouped[src].total, 0);

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
              <BarChartOutlined style={{ color: BRAND_RED, fontSize: 18 }} />
            </div>
            <div>
              <Title level={2} className="!mb-1 !text-white">
                Source Wise Lead Report
              </Title>
              <Text className="text-slate-200 !text-white">
                Analyze how many leads came from Indiamart, Facebook, Google and other sources.
              </Text>
            </div>
          </div>

          <Space>
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
          </Space>
        </div>
      </div>

      <Card size="small" className="mb-5 !rounded-xl border-0 shadow-sm" style={{ borderLeft: `4px solid ${BRAND_NAVY}` }}>
        <div className="flex items-center justify-between">
          <div>
            <Text type="secondary" className="text-[13px] font-medium uppercase tracking-wide">
              Total Leads (All Sources)
            </Text>
            <div className="mt-1 text-3xl font-semibold" style={{ color: BRAND_NAVY }}>
              {totalLeads}
            </div>
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: `${BRAND_NAVY}14`, color: BRAND_NAVY }}
          >
            <BarChartOutlined />
          </div>
        </div>
      </Card>

      {loadError && (
        <Alert
          className="mb-5 !rounded-xl"
          message="Unable to load source report"
          description={loadError}
          showIcon
          type="error"
        />
      )}

      {loading ? (
        <Row gutter={[16, 16]}>
          {sources.map((src) => (
            <Col xs={24} sm={12} lg={8} key={src}>
              <Card className="!rounded-xl border-0 shadow-sm">
                <Skeleton active paragraph={{ rows: 3 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          {sources.map((src) => {
            const stats = grouped[src];
            const accent = sourceAccents[src];
            const sharePercent = totalLeads > 0 ? Math.round((stats.total / totalLeads) * 100) : 0;

            return (
              <Col xs={24} sm={12} lg={8} key={src}>
                <Card
                  hoverable
                  className="!rounded-xl border-0 shadow-sm transition-shadow hover:shadow-md"
                  style={{ borderTop: `3px solid ${accent}`, height: "100%" }}
                  styles={{ body: { padding: 18 } }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${accent}14` }}
                      >
                        {icons[src]}
                      </div>
                      <div>
                        <Title level={5} style={{ margin: 0 }}>
                          {formatLeadSourceLabel(src)}
                        </Title>
                        <Text type="secondary" className="text-[12.5px]">
                          {stats.total} total leads &middot; {sharePercent}% share
                        </Text>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${sharePercent}%`, backgroundColor: accent }}
                    />
                  </div>

                  <Row gutter={[12, 12]} className="mt-3">
                    <Col span={12}>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <Statistic
                          title={<span className="text-[12px] text-slate-500">New</span>}
                          value={stats.new}
                          valueStyle={{ fontSize: 18, fontWeight: 600, color: "#7c3aed" }}
                        />
                      </div>
                    </Col>

                    <Col span={12}>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <Statistic
                          title={<span className="text-[12px] text-slate-500">Follow Up</span>}
                          value={stats.follow}
                          valueStyle={{ fontSize: 18, fontWeight: 600, color: "#d48806" }}
                        />
                      </div>
                    </Col>

                    <Col span={12}>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <Statistic
                          title={<span className="text-[12px] text-slate-500">Completed</span>}
                          value={stats.completed}
                          valueStyle={{ fontSize: 18, fontWeight: 600, color: "#389e0d" }}
                        />
                      </div>
                    </Col>

                    <Col span={12}>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <Statistic
                          title={<span className="text-[12px] text-slate-500">Lost</span>}
                          value={stats.lost}
                          valueStyle={{ fontSize: 18, fontWeight: 600, color: BRAND_RED }}
                        />
                      </div>
                    </Col>
                  </Row>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
    </div>
  );
}