import {
  ArrowLeftOutlined,
  MailOutlined,
  PhoneOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Spin,
  Statistic,
  Tabs,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import type { CustomerRecord } from "@/features/customers";
import type { LeadsManagement } from "../types/types";
import { customerApi } from "@/features/customers";
import type { RootState } from "@/app/store";
import { toTitleCase } from "@/shared/utils/helperFunctions";
import { businessConfigurationApi } from "@/features/onboarding";
import LeadCard from "./LeadCard";
import LeadsTaskModal from "./leads-task-modal";


const { Text, Title } = Typography;

const lifecycleLabel: Record<CustomerRecord["lifecycle"], string> = {
  PROSPECT: "Prospect",
  NEW_CUSTOMER: "New Customer",
  REPEAT_CUSTOMER: "Repeat Customer",
};

export default function CustomerProfilePage() {
  const { customerId = "" } = useParams();
  const navigate = useNavigate();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id,
  );
  const [customer, setCustomer] = useState<CustomerRecord | null>(null);
  const [enquiries, setEnquiries] = useState<LeadsManagement[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<LeadsManagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [isExportVertical, setIsExportVertical] = useState<boolean>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const scopeKey = `${outletId}:${customerId}`;
  const activeScopeRef = useRef(scopeKey);
  const loadMoreRequestRef = useRef<AbortController | null>(null);
  activeScopeRef.current = scopeKey;

  useEffect(() => {
    if (!outletId) {
      setIsExportVertical(undefined);
      return;
    }
    const abortController = new AbortController();
    void businessConfigurationApi.get(outletId, abortController.signal)
      .then((configuration) => {
        if (!abortController.signal.aborted) {
          setIsExportVertical(configuration.vertical.toLowerCase().includes("export"));
        }
      })
      .catch((configurationError: unknown) => {
        if (configurationError instanceof DOMException && configurationError.name === "AbortError") return;
        console.error("Unable to load business vertical for lead cards:", configurationError);
      });
    return () => abortController.abort();
  }, [outletId]);

  useEffect(() => {
    loadMoreRequestRef.current?.abort();
    setCustomer(null);
    setEnquiries([]);
    setNextCursor(null);
    setSelectedLead(null);
    setLoadingMore(false);

    if (!outletId || !customerId) {
      setError("Customer or outlet information is missing.");
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    const requestedScope = `${outletId}:${customerId}`;
    setLoading(true);
    setError("");

    void customerApi
      .getEnquiries(
        outletId,
        customerId,
        { limit: 20 },
        abortController.signal,
      )
      .then((enquiryResult) => {
        if (activeScopeRef.current !== requestedScope) return;
        if (
          enquiryResult.customer.outletId &&
          enquiryResult.customer.outletId !== outletId
        ) {
          setError("Customer details do not belong to the selected outlet.");
          return;
        }
        setCustomer(enquiryResult.customer);
        setEnquiries(enquiryResult.items);
        setNextCursor(enquiryResult.nextCursor);
      })
      .catch((requestError: unknown) => {
        if (activeScopeRef.current !== requestedScope) return;
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Customer profile could not be loaded.",
        );
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });

    return () => abortController.abort();
  }, [customerId, outletId, refreshVersion]);

  const loadMore = useCallback(async () => {
    if (!outletId || !customerId || !nextCursor || loadingMore) return;
    const requestedScope = `${outletId}:${customerId}`;
    const abortController = new AbortController();
    loadMoreRequestRef.current?.abort();
    loadMoreRequestRef.current = abortController;
    setLoadingMore(true);
    try {
      const result = await customerApi.getEnquiries(
        outletId,
        customerId,
        {
          cursor: nextCursor,
          limit: 20,
        },
        abortController.signal,
      );
      if (
        activeScopeRef.current !== requestedScope ||
        (result.customer.outletId && result.customer.outletId !== outletId)
      ) {
        return;
      }
      setEnquiries((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (requestError) {
      if (abortController.signal.aborted) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "More enquiries could not be loaded.",
      );
    } finally {
      if (activeScopeRef.current === requestedScope) setLoadingMore(false);
    }
  }, [customerId, loadingMore, nextCursor, outletId]);

  if (loading) {
    return (
      <div style={{ minHeight: 400, display: "grid", placeItems: "center" }}>
        <Spin size="large" tip="Loading customer profile..." />
      </div>
    );
  }

  if (!customer) {
    return (
      <div style={{ padding: 24 }}>
        <Alert
          type="error"
          showIcon
          message="Customer profile unavailable"
          description={error || "Customer not found."}
        />
      </div>
    );
  }

  const enquiryContent = (
    <div>
      {enquiries.length === 0 ? (
        <Empty description="No linked enquiries" />
      ) : (
        <Row gutter={[16, 16]}>
          {enquiries.map((lead) => (
            <Col key={lead.id} xs={24} md={12} xl={8}>
              <LeadCard
                lead={lead}
                onView={setSelectedLead}
                isExport={isExportVertical}
              />
            </Col>
          ))}
        </Row>
      )}
      {nextCursor && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <Button loading={loadingMore} onClick={loadMore}>
            Load more enquiries
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>

        {error && <Alert type="error" showIcon message={error} closable />}

        <Card>
          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Space wrap>
              <Title level={2} style={{ margin: 0 }}>
                {toTitleCase(customer.businessName, "Customer")}
              </Title>
              <Tag color={customer.lifecycle === "REPEAT_CUSTOMER" ? "green" : "blue"}>
                {lifecycleLabel[customer.lifecycle]}
              </Tag>
              <Tag>{customer.customerCode}</Tag>
            </Space>
            <Space wrap split={<Text type="secondary">|</Text>}>
              {customer.customerName &&
                customer.customerName !== customer.businessName && (
                  <Text>{toTitleCase(customer.customerName)}</Text>
                )}
              {customer.mobile && (
                <Text><PhoneOutlined /> {customer.mobile}</Text>
              )}
              {customer.email && (
                <Text><MailOutlined /> {customer.email}</Text>
              )}
              <Text>{[customer.city, customer.state].filter(Boolean).join(", ")}</Text>
            </Space>
          </Space>

          <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
            <Col xs={12} md={6}><Statistic title="Enquiries" value={customer.totalEnquiries} /></Col>
            <Col xs={12} md={6}><Statistic title="Won" value={customer.totalWon} /></Col>
            <Col xs={12} md={6}><Statistic title="Lost" value={customer.totalLost} /></Col>
            <Col xs={12} md={6}><Statistic title="Status" value={customer.status} /></Col>
          </Row>
        </Card>

        <Card>
          <Tabs
            defaultActiveKey="enquiries"
            items={[
              { key: "enquiries", label: "Enquiries", children: enquiryContent },
              {
                key: "related-history",
                label: "Related History",
                children: (
                  <Alert
                    type="info"
                    showIcon
                    message="History remains enquiry-based"
                    description="Open an enquiry to use the existing quotation, activity, and call views. Orders and purchase history are not duplicated into the Customer document."
                  />
                ),
              },
            ]}
          />
        </Card>
      </Space>

      {selectedLead && (
        <LeadsTaskModal
          lead={selectedLead}
          onClose={() => {
            setSelectedLead(null);
            setRefreshVersion((version) => version + 1);
          }}
        />
      )}
    </div>
  );
}
