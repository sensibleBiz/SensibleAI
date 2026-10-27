import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, Row, Col } from "antd";
import { BarChart3 } from "lucide-react";
import { useWarehouseDashboardContext } from "../../store/useWarehouseDashboardContext";

const BAR_COLORS = { top: "#667eea", lowest: "#f5576c" };

/** Bar chart: Top 5 and Lowest 5 stocked items. Use inside WarehouseDashboardProvider. */
export default function StockItemsBarChart() {
  const { topStockItems, lowestStockItems } = useWarehouseDashboardContext();

  return (
    <Row gutter={[24, 24]} style={{ marginBottom: "24px" }}>
      <Col xs={24} lg={12}>
        <Card
          title={
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BarChart3 size={20} color={BAR_COLORS.top} />
              <span style={{ fontSize: "16px", fontWeight: 600 }}>
                Top 5 Stocked Items
              </span>
            </span>
          }
          style={{
            borderRadius: "16px",
            border: "none",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
            height: "100%",
          }}
          bodyStyle={{ padding: "24px" }}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={topStockItems}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
              <XAxis type="number" tick={{ fill: "#666", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={56}
                tick={{ fill: "#666", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                }}
                formatter={(value: number) => [value, "Quantity"]}
              />
              <Bar
                dataKey="quantity"
                fill={BAR_COLORS.top}
                radius={[0, 4, 4, 0]}
                name="Quantity"
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card
          title={
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BarChart3 size={20} color={BAR_COLORS.lowest} />
              <span style={{ fontSize: "16px", fontWeight: 600 }}>
                Lowest 5 Stocked Items
              </span>
            </span>
          }
          style={{
            borderRadius: "16px",
            border: "none",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
            height: "100%",
          }}
          bodyStyle={{ padding: "24px" }}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={lowestStockItems}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
              <XAxis type="number" tick={{ fill: "#666", fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={56}
                tick={{ fill: "#666", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                }}
                formatter={(value: number) => [value, "Quantity"]}
              />
              <Bar
                dataKey="quantity"
                fill={BAR_COLORS.lowest}
                radius={[0, 4, 4, 0]}
                name="Quantity"
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </Col>
    </Row>
  );
}
