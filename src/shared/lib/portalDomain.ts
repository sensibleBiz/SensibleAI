// src/shared/lib/portalDomain.ts
/**
 * Sensible Suite Portal Domain Utility
 * Dynamically resolves active portal across the unified multi-subdomain suite:
 * - aicrm.sensible.biz (Sensible AI CRM - Leads, Pipelines, Voice AI, Omni-channel)
 * - exports.sensible.biz (Sensible AI Exports - EXIM Global Trade OS, Containers, Incoterms)
 * - accounts.sensible.biz (Sensible AI Accountant - Invoicing, Ledgers, GST/VAT, Tally)
 * - sales.sensible.biz (Customer-facing B2B Storefront & Client Ordering Portal)
 *
 * All powered by a single PostgreSQL database on Cloud SQL.
 */

export type PortalType = "crm" | "exports" | "accounts" | "sales";

const LOCAL_PORTAL_OVERRIDE_KEY = "sensible_dev_portal_override";

export function getActivePortal(): PortalType {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.startsWith("accounts")) {
    return "accounts";
  }
  if (hostname.startsWith("exports")) {
    return "exports";
  }
  if (hostname.startsWith("sales")) {
    return "sales";
  }
  if (hostname.startsWith("aicrm") || hostname.startsWith("crm")) {
    return "crm";
  }

  // In development (localhost / 127.0.0.1) or default staging, allow manual toggle
  const devOverride = localStorage.getItem(LOCAL_PORTAL_OVERRIDE_KEY) as PortalType | null;
  if (devOverride && ["crm", "accounts", "exports", "sales"].includes(devOverride)) {
    return devOverride;
  }

  return "crm";
}

export function setDevPortalOverride(portal: PortalType): void {
  localStorage.setItem(LOCAL_PORTAL_OVERRIDE_KEY, portal);
  window.dispatchEvent(new Event("sensible-portal-changed"));
}

export function getPortalMeta(portal: PortalType) {
  switch (portal) {
    case "accounts":
      return {
        key: "accounts" as const,
        name: "Sensible AI Accountant",
        shortName: "Accounts",
        domain: "accounts.sensible.biz",
        tagline: "Ledgers, Invoicing, Tax Compliance, Payroll & Reconciliation",
        badgeColor: "#10b981", // Emerald green
        accentColor: "#059669",
        icon: "AccountBalanceWalletOutlined",
      };
    case "exports":
      return {
        key: "exports" as const,
        name: "Sensible AI Exports",
        shortName: "Exports (EXIM OS)",
        domain: "exports.sensible.biz",
        tagline: "Global Buyers, Incoterms, Containers, BL & LC Tracking",
        badgeColor: "#0284c7", // Sky blue
        accentColor: "#0369a1",
        icon: "GlobalOutlined",
      };
    case "sales":
      return {
        key: "sales" as const,
        name: "Sensible Sales Portal",
        shortName: "Client Storefront",
        domain: "sales.sensible.biz",
        tagline: "Customer-Facing Digital Catalog & Client Sales Ordering",
        badgeColor: "#f59e0b", // Amber
        accentColor: "#d97706",
        icon: "ShopOutlined",
      };
    case "crm":
    default:
      return {
        key: "crm" as const,
        name: "Sensible AI CRM",
        shortName: "AI CRM",
        domain: "aicrm.sensible.biz",
        tagline: "Omnichannel Leads, Deals, Voice AI & Pipeline Automation",
        badgeColor: "#4f46e5", // Indigo
        accentColor: "#4338ca",
        icon: "UsergroupAddOutlined",
      };
  }
}

export function getPortalUrl(target: PortalType): string {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocal) {
    return "#";
  }
  if (target === "crm") {
    return "https://aicrm.sensible.biz";
  }
  return `https://${target}.sensible.biz`;
}
