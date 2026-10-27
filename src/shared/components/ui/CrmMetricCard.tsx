import React, { ReactNode } from "react";
import { Card, Progress, Skeleton, Typography } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from "@ant-design/icons";

const { Text } = Typography;

export interface CrmMetricTrend {
  value: string | number;
  direction?: "up" | "down" | "neutral";
  label?: string;
}

export interface CrmMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  icon?: ReactNode;
  iconColor?: string;
  iconBg?: string;
  trend?: CrmMetricTrend;
  loading?: boolean;
  onClick?: () => void;
  badge?: ReactNode;
  progressPercent?: number;
  progressColor?: string;
  className?: string;
  style?: React.CSSProperties;
  gradient?: string;
  shadowColor?: string;
}

export const CrmMetricCard: React.FC<CrmMetricCardProps> = ({
  title,
  value,
  subtitle,
  prefix,
  suffix,
  icon,
  iconColor = "#2563eb",
  iconBg = "rgba(37, 99, 235, 0.1)",
  trend,
  loading = false,
  onClick,
  badge,
  progressPercent,
  progressColor,
  className = "",
  style,
  gradient,
  shadowColor,
}) => {
  const isInteractive = Boolean(onClick);

  return (
    <Card
      className={`crm-metric-card transition-all duration-200 ${
        isInteractive ? "cursor-pointer hover:-translate-y-1 hover:shadow-md" : ""
      } ${className}`}
      style={{
        borderRadius: "12px",
        ...(gradient ? { background: gradient, border: "none" } : {}),
        ...(shadowColor ? { boxShadow: `0 4px 20px ${shadowColor}` } : {}),
        ...style,
      }}
      styles={{ body: { padding: "20px 24px" } }}
      onClick={onClick}
    >
      <Skeleton loading={loading} active paragraph={{ rows: 1 }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Text
                type="secondary"
                className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                style={gradient ? { color: "rgba(255, 255, 255, 0.85)" } : undefined}
              >
                {title}
              </Text>
              {badge && <span>{badge}</span>}
            </div>

            <div className="mt-2 flex items-baseline gap-1.5 flex-wrap">
              {prefix && (
                <span
                  className="text-lg font-bold text-slate-500 dark:text-slate-400"
                  style={gradient ? { color: "#fff" } : undefined}
                >
                  {prefix}
                </span>
              )}
              <span
                className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50"
                style={gradient ? { color: "#fff" } : undefined}
              >
                {value}
              </span>
              {suffix && (
                <span
                  className="text-sm font-medium text-slate-500 dark:text-slate-400"
                  style={gradient ? { color: "rgba(255, 255, 255, 0.85)" } : undefined}
                >
                  {suffix}
                </span>
              )}
            </div>

            {(subtitle || trend) && (
              <div className="mt-2 flex items-center gap-2 text-xs">
                {trend && (
                  <span
                    className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${
                      trend.direction === "up"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                        : trend.direction === "down"
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {trend.direction === "up" && <ArrowUpOutlined style={{ fontSize: "10px" }} />}
                    {trend.direction === "down" && <ArrowDownOutlined style={{ fontSize: "10px" }} />}
                    {trend.direction === "neutral" && <MinusOutlined style={{ fontSize: "10px" }} />}
                    {trend.value}
                  </span>
                )}
                {subtitle && (
                  <Text
                    type="secondary"
                    className="truncate text-slate-500 dark:text-slate-400"
                    style={gradient ? { color: "rgba(255, 255, 255, 0.8)" } : undefined}
                  >
                    {subtitle}
                  </Text>
                )}
              </div>
            )}
          </div>

          {icon && (
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl"
              style={{
                backgroundColor: gradient ? "rgba(255, 255, 255, 0.2)" : iconBg,
                color: gradient ? "#fff" : iconColor,
              }}
            >
              {icon}
            </div>
          )}
        </div>

        {progressPercent !== undefined && (
          <div className="mt-3">
            <Progress
              percent={progressPercent}
              showInfo={false}
              strokeColor={gradient ? "#fff" : progressColor || iconColor}
              trailColor={gradient ? "rgba(255, 255, 255, 0.2)" : undefined}
              size="small"
            />
          </div>
        )}
      </Skeleton>
    </Card>
  );
};

export default CrmMetricCard;
