import { Row, Col, Card, Statistic } from "antd";
import { BarChartOutlined, BankOutlined, WalletOutlined } from "@ant-design/icons";
import { useWarehouseDashboardContext } from "../../store/useWarehouseDashboardContext";

/** Total Sale, Total UPI Sale, Cash In Hand. Uses shift data from context. */
export default function SummaryStatsCards() {
  const { summaryStats } = useWarehouseDashboardContext();

  const formatter = (value: number) => `₹${Number(value).toLocaleString()}`;

  return (
    <Row gutter={[24, 24]} style={{ marginBottom: "24px" }}>
      <Col xs={24} sm={12} lg={8}>
        <Card
          hoverable
          style={{
            borderRadius: "16px",
            border: "none",
            boxShadow: "0 8px 24px rgba(24, 144, 255, 0.15)",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            overflow: "hidden",
          }}
          bodyStyle={{ padding: "24px" }}
        >
          <Statistic
            title={
              <span
                style={{
                  color: "rgba(255, 255, 255, 0.9)",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                Total Sale
              </span>
            }
            value={summaryStats?.totalSale ?? 0}
            formatter={formatter}
            valueStyle={{
              color: "#fff",
              fontSize: "28px",
              fontWeight: 700,
            }}
            prefix={
              <BarChartOutlined
                style={{ color: "rgba(255,255,255,0.9)", marginRight: 8 }}
              />
            }
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <Card
          hoverable
          style={{
            borderRadius: "16px",
            border: "none",
            boxShadow: "0 8px 24px rgba(19, 194, 194, 0.15)",
            background: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
            overflow: "hidden",
          }}
          bodyStyle={{ padding: "24px" }}
        >
          <Statistic
            title={
              <span
                style={{
                  color: "rgba(255, 255, 255, 0.9)",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                Total UPI Sale
              </span>
            }
            value={summaryStats?.totalUpiSale ?? 0}
            formatter={formatter}
            valueStyle={{
              color: "#fff",
              fontSize: "28px",
              fontWeight: 700,
            }}
            prefix={
              <BankOutlined
                style={{ color: "rgba(255,255,255,0.9)", marginRight: 8 }}
              />
            }
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={8}>
        <Card
          hoverable
          style={{
            borderRadius: "16px",
            border: "none",
            boxShadow: "0 8px 24px rgba(82, 196, 26, 0.15)",
            background: "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
            overflow: "hidden",
          }}
          bodyStyle={{ padding: "24px" }}
        >
          <Statistic
            title={
              <span
                style={{
                  color: "rgba(255, 255, 255, 0.9)",
                  fontSize: "14px",
                  fontWeight: 500,
                }}
              >
                Cash In Hand
              </span>
            }
            value={summaryStats?.cashInHand ?? 0}
            formatter={formatter}
            valueStyle={{
              color: "#fff",
              fontSize: "28px",
              fontWeight: 700,
            }}
            prefix={
              <WalletOutlined
                style={{ color: "rgba(255,255,255,0.9)", marginRight: 8 }}
              />
            }
          />
        </Card>
      </Col>
    </Row>
  );
}
