import { Card, Space, Typography, Badge } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import { ReactNode } from "react";
import { useThemeMode } from "@/shared/hooks";

const { Text } = Typography;

interface FilterCardProps {
  children: ReactNode;
  activeFilterCount?: number;
}

export default function FilterCard({ children, activeFilterCount = 0 }: FilterCardProps) {
  const { isDark } = useThemeMode();

  return (
    <Card
      className="responsive-filter-card"
      style={{
        marginBottom: "24px",
        borderRadius: "16px",
        border: isDark ? "1px solid #303030" : "none",
        boxShadow: isDark
          ? "0 4px 20px rgba(0, 0, 0, 0.35)"
          : "0 4px 20px rgba(0, 0, 0, 0.08)",
        background: isDark ? "#1f1f1f" : "#fff",
        transition: "all 0.3s ease",
      }}
      styles={{ body: { padding: "16px 20px" } }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <FilterOutlined style={{ fontSize: "18px", color: "#667eea" }} />
        <Text strong style={{ fontSize: "16px" }}>
          Filters
        </Text>
        {activeFilterCount > 0 && (
          <Badge count={activeFilterCount} style={{ backgroundColor: "#667eea" }} />
        )}
      </div>
      <Space className="responsive-filter-card__controls" size="middle" wrap style={{ width: "100%" }}>
        {children}
      </Space>
    </Card>
  );
}

