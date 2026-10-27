import { Empty, Space, Tag } from "antd";
import {
  Building2,
  Calculator,
  FileText,
  Globe2,
  Layers,
  LayoutDashboard,
  Ship,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { CrmPageHeader } from "@/shared/components/ui";
import { BuyerPipelineView } from "../components/BuyerPipelineView";
import { ContainerStuffingView } from "../components/ContainerStuffingView";
import { ExportDocumentsView } from "../components/ExportDocumentsView";
import { OverviewDashboard } from "../components/OverviewDashboard";
import { ProductCostingView } from "../components/ProductCostingView";
import { ShipmentTrackingView } from "../components/ShipmentTrackingView";
import { SupplierProcurementView } from "../components/SupplierProcurementView";
import "../styles/exportImportWorkspace.css";
import "../styles/exportOperationsIntegration.css";

type ExportModule =
  | "overview"
  | "buyers"
  | "costing"
  | "suppliers"
  | "container"
  | "shipments"
  | "documents";

type SupportedCurrency = "USD" | "EUR" | "INR";

const currencyRate = {
  USD: 1,
  EUR: 0.92,
  INR: 84,
};

const modules = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "buyers", label: "Leads & Enquiries", icon: Users },
  { id: "costing", label: "Quotation (FOB/CIF)", icon: Calculator },
  { id: "suppliers", label: "Suppliers & Mills", icon: Building2 },
  { id: "container", label: "Container Stuffing", icon: Layers },
  { id: "shipments", label: "Shipment Tracking", icon: Ship },
  { id: "documents", label: "Export Documents", icon: FileText },
] satisfies Array<{ id: ExportModule; label: string; icon: typeof LayoutDashboard }>;

function settingValue(settings: Record<string, unknown> | undefined, key: string) {
  const value = settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function countryLabel(countryCode?: string) {
  const labels: Record<string, string> = {
    AE: "United Arab Emirates",
    AU: "Australia",
    CA: "Canada",
    DE: "Germany",
    GB: "United Kingdom",
    IN: "India",
    MY: "Malaysia",
    SG: "Singapore",
    US: "United States",
  };
  return countryCode ? labels[countryCode] ?? countryCode : "Region not configured";
}

export default function ExportOperationsPage() {
  const outlet = useSelector((state: RootState) => state.appState.outletInfo);
  const configured = useSelector(
    (state: RootState) => state.appState.businessConfiguration?.configuration,
  );
  const settings = configured?.settings as Record<string, unknown> | undefined;
  const configuredCurrency = configured?.currency?.toUpperCase();
  const defaultCurrency: SupportedCurrency =
    configuredCurrency === "EUR" || configuredCurrency === "INR" ? configuredCurrency : "USD";
  const [activeModule, setActiveModule] = useState<ExportModule>("overview");
  const [selectedCostingProduct, setSelectedCostingProduct] = useState("");
  const [currency, setCurrency] = useState<SupportedCurrency>(defaultCurrency);

  const context = useMemo(
    () => ({
      operatingCountry: settingValue(settings, "operatingCountry"),
      salesFootprint: settingValue(settings, "salesFootprint") || "exports",
      timezone:
        settingValue(settings, "timezone") ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    [settings],
  );

  if (!outlet) {
    return <Empty description="Select a business outlet to open Export Operations." />;
  }

  const handleNavigateToCosting = (productName: string) => {
    setSelectedCostingProduct(productName);
    setActiveModule("costing");
  };

  return (
    <>
      <CrmPageHeader
        title="Export Operations"
        subtitle={`Export and import control tower for ${outlet.name}, integrated inside the existing CRM.`}
        badge={<Tag color="blue">Export workspace</Tag>}
      >
        <Space size={[8, 8]} wrap>
          <Tag icon={<Globe2 size={12} />}>
            {countryLabel(context.operatingCountry)}
          </Tag>
          <Tag>{context.salesFootprint}</Tag>
          <Tag>{configuredCurrency || currency}</Tag>
          <Tag>{context.timezone}</Tag>
        </Space>
      </CrmPageHeader>

      <div className="export-import-workspace">
        <div className="export-workspace-toolbar">
          <div className="export-module-nav" role="tablist" aria-label="Export operations">
            {modules.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={activeModule === item.id}
                  className={`export-module-button ${activeModule === item.id ? "active" : ""}`}
                  onClick={() => setActiveModule(item.id)}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="export-currency-switch" aria-label="Preview currency">
            <span>Currency</span>
            {(["USD", "EUR", "INR"] as const).map((code) => (
              <button
                key={code}
                type="button"
                className={currency === code ? "active" : ""}
                onClick={() => setCurrency(code)}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        <div className="export-preview-notice">
          This screen is adapted from the supplied export/import UI. Its current records are
          demonstration data; the CRM outlet, regional setup, navigation and access controls are
          live.
        </div>

        <div className="export-workspace-content">
          {activeModule === "overview" && (
            <OverviewDashboard
              onNavigate={(module) => setActiveModule(module as ExportModule)}
              currency={currency}
              currencyRate={currencyRate}
            />
          )}
          {activeModule === "buyers" && (
            <BuyerPipelineView
              onNavigateToCosting={handleNavigateToCosting}
              currency={currency}
              currencyRate={currencyRate}
            />
          )}
          {activeModule === "costing" && (
            <ProductCostingView
              initialProductName={selectedCostingProduct}
              currency={currency}
              currencyRate={currencyRate}
            />
          )}
          {activeModule === "suppliers" && (
            <SupplierProcurementView currency={currency} />
          )}
          {activeModule === "container" && <ContainerStuffingView />}
          {activeModule === "shipments" && <ShipmentTrackingView />}
          {activeModule === "documents" && <ExportDocumentsView />}
        </div>
      </div>
    </>
  );
}
