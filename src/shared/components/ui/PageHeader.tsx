import { Card, Typography, Space } from "antd";
import { ReactNode } from "react";

const { Title, Text } = Typography;

interface PageHeaderProps {
  title: string;
  description?: string;
  extra?: ReactNode;
  gradient?: string;
}

export default function PageHeader({
  title,
  description,
  extra,
  gradient = "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
}: PageHeaderProps) {
  return (
    <Card
      className="responsive-page-header"
      style={{
        marginBottom: "24px",
        borderRadius: "16px",
        border: "none",
        background: gradient,
        boxShadow: "0 8px 24px rgba(102, 126, 234, 0.25)",
        transition: "all 0.3s ease",
      }}
      styles={{ body: { padding: "20px 24px" } }}
    >
      <div
        className="responsive-page-header__content"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div className="responsive-page-header__copy">
          <Title
            level={2}
            style={{
              margin: 0,
              color: "#fff",
              fontWeight: 700,
              fontSize: "32px",
              marginBottom: description ? "8px" : 0,
            }}
          >
            {title}
          </Title>
          {description && (
            <Text style={{ color: "rgba(255, 255, 255, 0.9)", fontSize: "15px" }}>
              {description}
            </Text>
          )}
        </div>
        {extra && <Space className="responsive-page-header__actions" size="middle" wrap>{extra}</Space>}
      </div>
    </Card>
  );
}

