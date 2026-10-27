import { Layout, Row, Col } from "antd";
import SpinLoader from "@/shared/components/SpinLoader";
import { CrmPageHeader } from "@/shared/components/ui";
import {
  WarehouseDashboardProvider,
} from "../store/WarehouseDashboardProvider";
import { useWarehouseDashboardContext } from "../store/useWarehouseDashboardContext";
import {
  WAREHOUSE_DASHBOARD_WIDGETS,
} from "../components/dashboard/warehouseDashboardWidgets";

const { Content } = Layout;

/**
 * Optional: set of widget ids to hide (for conditional viewing).
 * Omit or pass undefined to show all widgets.
 */
export type VisibleWidgetIds = Set<string> | undefined;

interface DashboardGridProps {
  /** If provided, only widgets whose id is in this set are shown. Omit to show all. */
  visibleIds?: VisibleWidgetIds;
}

/** Renders warehouse dashboard widgets. Must be inside WarehouseDashboardProvider. */
function DashboardGrid({ visibleIds }: DashboardGridProps) {
  const { loading } = useWarehouseDashboardContext();

  const widgetsToRender = WAREHOUSE_DASHBOARD_WIDGETS.filter(
    (w) => !visibleIds || visibleIds.has(w.id)
  );

  return (
    <Content
      style={{
        padding: "32px 24px",
        maxWidth: "1400px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      {loading ? (
        <SpinLoader loading={loading} />
      ) : (
        <Row gutter={[24, 24]}>
          {widgetsToRender.map((widget) => (
            <Col key={widget.id} xs={24} lg={widget.span ?? 24}>
              <widget.Component />
            </Col>
          ))}
        </Row>
      )}
    </Content>
  );
}

interface WarehouseDashboardProps {
  /** Optional: set of widget ids to show. Undefined = show all. Use for conditional viewing. */
  visibleWidgetIds?: VisibleWidgetIds;
}


/**
 * Warehouse dashboard page: plug-and-play, reorderable, conditionally viewable.
 * Reorder via WAREHOUSE_DASHBOARD_WIDGETS in warehouseDashboardWidgets.tsx.
 * Control visibility via visibleWidgetIds (e.g. from user preferences).
 */
export default function WarehouseDashboard({
  visibleWidgetIds,
}: WarehouseDashboardProps) {
  return (
    <WarehouseDashboardProvider>
      <div className="warehouse-dashboard" style={{ minHeight: "100vh", width: "100%" }}>
        <div style={{ padding: "0 24px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
          <CrmPageHeader
            title="Warehouse Dashboard"
            subtitle="Monitor and manage your warehouse and branch inventory"
          />
        </div>
        <DashboardGrid visibleIds={visibleWidgetIds} />
      </div>
    </WarehouseDashboardProvider>
  );
}

