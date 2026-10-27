// src/shared/components/PortalSwitcher.tsx
import React, { useEffect, useState } from "react";
import { Dropdown, Typography } from "antd";
import type { MenuProps } from "antd";
import {
  BankOutlined,
  GlobalOutlined,
  TeamOutlined,
  ShopOutlined,
  SwapOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import {
  getActivePortal,
  getPortalMeta,
  getPortalUrl,
  setDevPortalOverride,
  type PortalType,
} from "@/shared/lib/portalDomain";

const { Text } = Typography;

export const PortalSwitcher: React.FC = () => {
  const [currentPortal, setCurrentPortal] = useState<PortalType>(getActivePortal());

  useEffect(() => {
    const handlePortalChange = () => {
      setCurrentPortal(getActivePortal());
    };
    window.addEventListener("sensible-portal-changed", handlePortalChange);
    return () => {
      window.removeEventListener("sensible-portal-changed", handlePortalChange);
    };
  }, []);

  const meta = getPortalMeta(currentPortal);
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  const handleMenuClick: MenuProps["onClick"] = ({ key }) => {
    const target = key as PortalType;
    if (target === currentPortal) return;

    if (isLocal) {
      setDevPortalOverride(target);
      window.location.reload();
    } else {
      window.location.href = getPortalUrl(target);
    }
  };

  const menuItems: MenuProps["items"] = [
    {
      key: "portal-header",
      type: "group",
      label: (
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>
          Sensible SaaS Enterprise Suite
        </span>
      ),
      children: [
        {
          key: "crm",
          icon: <TeamOutlined style={{ color: "#4f46e5" }} />,
          label: (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 270, padding: "4px 0" }}>
              <div>
                <div style={{ fontWeight: 600, color: currentPortal === "crm" ? "#4f46e5" : "inherit" }}>
                  Sensible AI CRM
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Leads, Deals, WhatsApp & Voice AI (aicrm.sensible.biz)
                </div>
              </div>
              {currentPortal === "crm" && <CheckOutlined style={{ color: "#4f46e5" }} />}
            </div>
          ),
        },
        {
          key: "exports",
          icon: <GlobalOutlined style={{ color: "#0284c7" }} />,
          label: (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 270, padding: "4px 0" }}>
              <div>
                <div style={{ fontWeight: 600, color: currentPortal === "exports" ? "#0284c7" : "inherit" }}>
                  Sensible AI Exports (EXIM OS)
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Buyers, LC Tracking & Containers (exports.sensible.biz)
                </div>
              </div>
              {currentPortal === "exports" && <CheckOutlined style={{ color: "#0284c7" }} />}
            </div>
          ),
        },
        {
          key: "accounts",
          icon: <BankOutlined style={{ color: "#10b981" }} />,
          label: (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 270, padding: "4px 0" }}>
              <div>
                <div style={{ fontWeight: 600, color: currentPortal === "accounts" ? "#10b981" : "inherit" }}>
                  Sensible AI Accountant
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Ledgers, GST Invoices, Payroll & Tally (accounts.sensible.biz)
                </div>
              </div>
              {currentPortal === "accounts" && <CheckOutlined style={{ color: "#10b981" }} />}
            </div>
          ),
        },
        {
          key: "sales",
          icon: <ShopOutlined style={{ color: "#f59e0b" }} />,
          label: (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 270, padding: "4px 0" }}>
              <div>
                <div style={{ fontWeight: 600, color: currentPortal === "sales" ? "#f59e0b" : "inherit" }}>
                  Sensible Sales Portal
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Customer-Facing Digital Storefront (sales.sensible.biz)
                </div>
              </div>
              {currentPortal === "sales" && <CheckOutlined style={{ color: "#f59e0b" }} />}
            </div>
          ),
        },
      ],
    },
  ];

  return (
    <Dropdown menu={{ items: menuItems, onClick: handleMenuClick }} trigger={["click"]} placement="bottomLeft">
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          padding: "4px 10px",
          borderRadius: "8px",
          border: `1px solid ${meta.badgeColor}33`,
          backgroundColor: `${meta.badgeColor}12`,
          transition: "all 0.2s ease",
          userSelect: "none",
        }}
        className="portal-switcher-pill"
        title="Click to switch portal (CRM, Exports, Accounts, Sales)"
      >
        <span
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: meta.badgeColor,
            boxShadow: `0 0 6px ${meta.badgeColor}`,
          }}
        />
        <Text strong style={{ fontSize: 12, color: meta.badgeColor }}>
          {meta.name}
        </Text>
        <SwapOutlined style={{ fontSize: 11, color: meta.badgeColor, opacity: 0.8 }} />
      </div>
    </Dropdown>
  );
};
