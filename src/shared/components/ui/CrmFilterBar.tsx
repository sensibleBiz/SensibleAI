import React, { ReactNode } from "react";
import { Badge, Button, Card, Input, Space, Tooltip } from "antd";
import { ClearOutlined, SearchOutlined } from "@ant-design/icons";

export interface CrmFilterBarProps {
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  searchWidth?: number | string;
  activeFilterCount?: number;
  onReset?: () => void;
  children?: ReactNode;
  extra?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  showCardWrapper?: boolean;
}

export const CrmFilterBar: React.FC<CrmFilterBarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  searchWidth = 260,
  activeFilterCount = 0,
  onReset,
  children,
  extra,
  className = "",
  style,
  showCardWrapper = true,
}) => {
  const content = (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2.5">
        {onSearchChange !== undefined && (
          <Input
            allowClear
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ width: typeof searchWidth === "number" ? `${searchWidth}px` : searchWidth }}
            className="rounded-lg"
          />
        )}

        {children}

        {activeFilterCount > 0 && onReset && (
          <Tooltip title="Clear all active filters">
            <Button
              type="text"
              danger
              icon={<ClearOutlined />}
              onClick={onReset}
              size="small"
              className="flex items-center text-xs font-medium"
            >
              Reset Filters
              <Badge
                count={activeFilterCount}
                className="ml-1.5"
                style={{ backgroundColor: "#ef4444" }}
              />
            </Button>
          </Tooltip>
        )}
      </div>

      {extra && (
        <Space size="small" wrap className="shrink-0 pt-2 lg:pt-0">
          {extra}
        </Space>
      )}
    </div>
  );

  if (!showCardWrapper) {
    return <div className={`crm-filter-bar mb-4 ${className}`} style={style}>{content}</div>;
  }

  return (
    <Card
      className={`crm-filter-bar mb-4 shadow-xs ${className}`}
      style={{
        borderRadius: "12px",
        ...style,
      }}
      styles={{ body: { padding: "14px 18px" } }}
    >
      {content}
    </Card>
  );
};

export default CrmFilterBar;
