import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, Select } from "antd";
import { LineChart as LineChartIcon } from "lucide-react";
import { useWarehouseDashboardContext } from "../../store/useWarehouseDashboardContext";
import type { SalesTimeframe } from "./types";
import type { ShiftDTO } from "../../types/types";
import dayjs from "dayjs";

const TIMEFRAME_OPTIONS = [
  { value: "thisWeek" as const, label: "This Week" },
  { value: "thisMonth" as const, label: "This Month" },
  { value: "thisYear" as const, label: "This Year" },
];

function filterShiftsByTimeframe(shifts: ShiftDTO[], timeframe: SalesTimeframe): ShiftDTO[] {
  const now = dayjs();
  if (timeframe === "thisWeek") {
    const start = now.subtract(6, "day").format("YYYY-MM-DD");
    return shifts.filter((s) => s.dayId && s.dayId >= start);
  }
  if (timeframe === "thisMonth") {
    const prefix = now.format("YYYY-MM");
    return shifts.filter((s) => s.dayId && s.dayId.startsWith(prefix));
  }
  if (timeframe === "thisYear") {
    const prefix = now.format("YYYY");
    return shifts.filter((s) => s.dayId && s.dayId.startsWith(prefix));
  }
  return shifts;
}

/** Aggregate shifts by dayId: date label + total sale value. */
function getChartDataByValue(shifts: ShiftDTO[], timeframe: SalesTimeframe): { date: string; quantity: number; value: number }[] {
  const filtered = filterShiftsByTimeframe(shifts, timeframe);
  const byDay = new Map<string, number>();
  filtered.forEach((s) => {
    if (!s.dayId) return;
    const current = byDay.get(s.dayId) ?? 0;
    byDay.set(s.dayId, current + (s.totalSale ?? 0));
  });
  const entries = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([dayId, value]) => ({
    date: timeframe === "thisYear" ? dayjs(dayId).format("MMM") : dayjs(dayId).format("DD"),
    quantity: 0,
    value,
  }));
}

/** Sales chart: shift data aggregated by day (By Value). By Quantity hidden for now. */
export default function SalesChart() {
  const { shiftData } = useWarehouseDashboardContext();
  const [timeframe, setTimeframe] = useState<SalesTimeframe>("thisMonth");

  const chartData = useMemo(
    () => getChartDataByValue(shiftData, timeframe),
    [shiftData, timeframe]
  );

  const valueFormatter = (value: number): string => `₹${value.toLocaleString()}`;

  return (
    <Card
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LineChartIcon size={20} color="#4facfe" />
          <span style={{ fontSize: "18px", fontWeight: 600 }}>
            Sales Overview
          </span>
        </span>
      }
      extra={
        <Select<SalesTimeframe>
          value={timeframe}
          onChange={setTimeframe}
          style={{ width: 150 }}
          options={TIMEFRAME_OPTIONS}
        />
      }
      style={{
        borderRadius: "16px",
        border: "none",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
        marginBottom: "24px",
      }}
      bodyStyle={{ padding: "24px" }}
    >
      <div style={{ position: "relative", minHeight: 300 }}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="salesAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4facfe" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#4facfe" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e8" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#666", fontSize: 12 }}
              axisLine={{ stroke: "#e8e8e8" }}
            />
            <YAxis
              tick={{ fill: "#666", fontSize: 12 }}
              axisLine={{ stroke: "#e8e8e8" }}
              tickFormatter={valueFormatter}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              }}
              formatter={(value: number) => [valueFormatter(value), "Value"]}
              labelFormatter={(label) => `Date: ${label}`}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#4facfe"
              fillOpacity={1}
              fill="url(#salesAreaGradient)"
              name="Value"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
