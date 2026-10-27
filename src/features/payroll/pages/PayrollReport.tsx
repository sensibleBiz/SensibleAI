import { Card, Descriptions, Empty, Space, Table, Tag, Typography } from "antd";
import {
  EMPLOYEE_SALARY_STRUCTURE_FIELDS,
  PAYROLL_FIRESTORE_COLLECTIONS,
  PAYROLL_RUN_FIRESTORE_FIELDS,
  PAYROLL_SCHEMA_NOTE,
} from "@/features/payroll/domain";
import type { PayrollCalculationResult } from "@/features/payroll/domain";
import { currency, monthName } from "./payrollPageUtils";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

const { Text, Title } = Typography;

interface PayrollReportProps {
  result?: PayrollCalculationResult;
}

export default function PayrollReport({ result }: PayrollReportProps) {
  const reportRows = result
    ? [
        {
          key: `${result.employee.id}-${result.month}-${result.year}`,
          employee: formatEmployeeName(result.employee.name),
          month: `${monthName(result.month)} ${result.year}`,
          state: result.state,
          gross: result.earnings.grossEarnings,
          deductions: result.deductions.totalDeductions,
          net: result.netSalary,
          ctc: result.ctc,
          status: "GENERATED",
        },
      ]
    : [];

  const collectionRows = Object.entries(PAYROLL_FIRESTORE_COLLECTIONS).map(
    ([key, value]) => ({ key, value })
  );

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          Payroll Report
        </Title>
        <Text type="secondary">
          Generated payroll summary and recommended Firestore persistence structure.
        </Text>
      </Card>

      {result ? (
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          columns={[
            { title: "Employee", dataIndex: "employee", key: "employee" },
            { title: "Month", dataIndex: "month", key: "month" },
            { title: "State", dataIndex: "state", key: "state" },
            {
              title: "Gross",
              dataIndex: "gross",
              key: "gross",
              align: "right" as const,
              render: currency,
            },
            {
              title: "Deductions",
              dataIndex: "deductions",
              key: "deductions",
              align: "right" as const,
              render: currency,
            },
            {
              title: "Net",
              dataIndex: "net",
              key: "net",
              align: "right" as const,
              render: currency,
            },
            {
              title: "CTC",
              dataIndex: "ctc",
              key: "ctc",
              align: "right" as const,
              render: currency,
            },
            {
              title: "Status",
              dataIndex: "status",
              key: "status",
              render: (status: string) => <Tag color="blue">{status}</Tag>,
            },
          ]}
          dataSource={reportRows}
        />
      ) : (
        <Empty description="Generate payroll to populate the report." />
      )}

      <Card title="Database / Firestore Structure" size="small">
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Collections">
            <Table
              rowKey="key"
              size="small"
              pagination={false}
              columns={[
                { title: "Logical Name", dataIndex: "key", key: "key" },
                { title: "Collection", dataIndex: "value", key: "value" },
              ]}
              dataSource={collectionRows}
            />
          </Descriptions.Item>
          <Descriptions.Item label="Employee Salary Structure Fields">
            {EMPLOYEE_SALARY_STRUCTURE_FIELDS.join(", ")}
          </Descriptions.Item>
          <Descriptions.Item label="Payroll Run Fields">
            {PAYROLL_RUN_FIRESTORE_FIELDS.join(", ")}
          </Descriptions.Item>
          <Descriptions.Item label="Storage Note">
            {PAYROLL_SCHEMA_NOTE}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}
