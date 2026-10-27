import { Card, Collapse, Empty, Space, Table, Tag, Typography } from "antd";
import type { PayrollCalculationResult } from "@/features/payroll/domain";
import { currency } from "./payrollPageUtils";

const { Text, Title } = Typography;

interface PayrollPreviewProps {
  result?: PayrollCalculationResult;
}

interface AmountRow {
  key: string;
  label: string;
  amount: number;
}

const labels: Record<string, string> = {
  basic: "Basic",
  hra: "HRA",
  da: "DA",
  conveyance: "Conveyance",
  medical: "Medical",
  specialAllowance: "Special Allowance",
  incentive: "Incentive",
  overtime: "Overtime",
  bonus: "Bonus",
  arrears: "Arrears",
  otherEarnings: "Other Earnings",
  grossEarnings: "Gross Earnings",
  lop: "LOP Deduction",
  employeePF: "Employee PF",
  employeeESI: "Employee ESI",
  professionalTax: "Professional Tax",
  employeeLWF: "Employee LWF",
  tds: "TDS",
  loan: "Loan",
  advance: "Advance",
  otherDeductions: "Other Deductions",
  totalDeductions: "Total Deductions",
  employerPF: "Employer PF",
  employerESI: "Employer ESI",
  employerLWF: "Employer LWF",
  gratuityProvision: "Gratuity Provision",
  bonusProvision: "Bonus Provision",
  totalEmployerContribution: "Total Employer Contribution",
};

const toRows = (record: object): AmountRow[] =>
  Object.entries(record as Record<string, unknown>).map(([key, amount]) => ({
    key,
    label: labels[key] || key,
    amount: Number(amount || 0),
  }));

function AmountTable({ rows }: { rows: AmountRow[] }) {
  return (
    <Table<AmountRow>
      rowKey="key"
      size="small"
      pagination={false}
      columns={[
        { title: "Component", dataIndex: "label", key: "label" },
        {
          title: "Amount",
          dataIndex: "amount",
          key: "amount",
          align: "right",
          render: currency,
        },
      ]}
      dataSource={rows}
    />
  );
}

export default function PayrollPreview({ result }: PayrollPreviewProps) {
  if (!result) {
    return <Empty description="Generate payroll to preview the calculation." />;
  }

  const ruleItems = Object.entries(result.ruleBreakup).map(([key, value]) => ({
    key,
    label: labels[key] || key.toUpperCase(),
    children: (
      <Table
        rowKey="field"
        size="small"
        pagination={false}
        columns={[
          { title: "Field", dataIndex: "field", key: "field" },
          {
            title: "Value",
            dataIndex: "value",
            key: "value",
            render: (item: string | number | boolean) =>
              typeof item === "boolean" ? <Tag>{item ? "Yes" : "No"}</Tag> : String(item),
          },
        ]}
        dataSource={Object.entries(value).map(([field, item]) => ({
          field,
          value: item,
        }))}
      />
    ),
  }));

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Title level={4} style={{ marginTop: 0 }}>
          Payroll Preview
        </Title>
        <Text type="secondary">
          Review earnings, deductions, employer contributions, and calculation breakups.
        </Text>
      </Card>

      <Card title="Earnings" size="small">
        <AmountTable rows={toRows(result.earnings)} />
      </Card>
      <Card title="Deductions" size="small">
        <AmountTable rows={toRows(result.deductions)} />
      </Card>
      <Card title="Employer Contributions" size="small">
        <AmountTable rows={toRows(result.employerContributions)} />
      </Card>
      <Card title="Rule Calculation Breakup" size="small">
        <Collapse items={ruleItems} />
      </Card>
    </Space>
  );
}
