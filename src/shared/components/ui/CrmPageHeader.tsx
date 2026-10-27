import React, { ReactNode } from "react";
import { Breadcrumb, Button, Space, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

const { Title, Text } = Typography;

export interface CrmBreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface CrmPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: CrmBreadcrumbItem[];
  badge?: ReactNode;
  extra?: ReactNode;
  onBack?: () => void | boolean;
  className?: string;
  children?: ReactNode;
}

export const CrmPageHeader: React.FC<CrmPageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  badge,
  extra,
  onBack,
  className = "",
  children,
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (typeof onBack === "function") {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className={`crm-page-header mb-6 ${className}`}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb
          className="mb-2 text-xs"
          items={breadcrumbs.map((crumb) => ({
            title: crumb.href ? (
              <a href={crumb.href} onClick={(e) => {
                if (crumb.onClick) {
                  e.preventDefault();
                  crumb.onClick();
                }
              }}>
                {crumb.label}
              </a>
            ) : (
              crumb.label
            ),
          }))}
        />
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          {onBack && (
            <Button
              type="text"
              icon={<ArrowLeftOutlined />}
              onClick={handleBack}
              className="mt-0.5 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              {typeof title === "string" ? (
                <Title
                  level={3}
                  style={{ margin: 0, fontWeight: 700, letterSpacing: "-0.02em" }}
                >
                  {title}
                </Title>
              ) : (
                title
              )}
              {badge && <div className="inline-flex items-center">{badge}</div>}
            </div>
            {subtitle && (
              <div className="mt-1">
                {typeof subtitle === "string" ? (
                  <Text type="secondary" style={{ fontSize: "14px" }}>
                    {subtitle}
                  </Text>
                ) : (
                  subtitle
                )}
              </div>
            )}
          </div>
        </div>

        {extra && (
          <Space size="small" wrap className="shrink-0">
            {extra}
          </Space>
        )}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
};

export default CrmPageHeader;
