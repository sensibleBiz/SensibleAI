import { Card, Row, Col, Descriptions, Typography } from "antd";
import { useWarehouseDashboardContext } from "../../store/useWarehouseDashboardContext";

const { Text } = Typography;

/** Total Tax, Refund Amt, No. of Bills, Opening Balance, Extra/Dlvr Charges. Uses shift data from context. */
export default function SummaryCard() {
  const { summaryCard } = useWarehouseDashboardContext();

  const formatCurrency = (n: number) => `₹${n.toLocaleString()}`;
  const totalTax = summaryCard?.totalTax ?? 0;
  const refundAmt = summaryCard?.refundAmt ?? 0;
  const noOfBills = summaryCard?.noOfBills ?? 0;
  const openingBalance = summaryCard?.openingBalance ?? 0;
  const extraDlvrCharges = summaryCard?.extraDlvrCharges ?? 0;

  return (
    <Card
      title={<Text strong style={{ fontSize: "18px" }}>Summary</Text>}
      style={{
        borderRadius: "16px",
        border: "none",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
        marginBottom: "24px",
      }}
    >
      <Row gutter={[32, 16]}>
        <Col xs={24} md={12}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Total Tax">
              <Text strong>{formatCurrency(totalTax)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Opening Balance">
              <Text strong>{formatCurrency(openingBalance)}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Col>
        <Col xs={24} md={12}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Refund Amt">
              <Text strong>{formatCurrency(refundAmt)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="No. of Bills">
              <Text strong>{noOfBills}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Extra/Dlvr Charges">
              <Text strong>{formatCurrency(extraDlvrCharges)}</Text>
            </Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>
    </Card>
  );
}
