import { Button, Card, Col, Descriptions, Empty, Row, Space, Statistic, Table, Typography } from "antd";
import { Download } from "lucide-react";
import type { PayrollCalculationResult } from "@/features/payroll/domain";
import { currency, monthName } from "./payrollPageUtils";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { downloadPayslipPdf, type PayslipLogo } from "./payslipPdf";

const { Text, Title } = Typography;

interface PayslipViewProps {
  result?: PayrollCalculationResult;
  salarySlipLogo?: PayslipLogo | null;
}

const earningLabels: Record<string, string> = {
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
};

const deductionLabels: Record<string, string> = {
  lop: "LOP",
  employeePF: "Employee PF",
  employeeESI: "Employee ESI",
  professionalTax: "Professional Tax",
  employeeLWF: "Employee LWF",
  tds: "TDS",
  loan: "Loan",
  advance: "Advance",
  otherDeductions: "Other Deductions",
  totalDeductions: "Total Deductions",
};

const employerContributionLabels: Record<string, string> = {
  employerPF: "Employer PF",
  employerESI: "Employer ESI",
  employerLWF: "Employer LWF",
  gratuityProvision: "Gratuity Provision",
  bonusProvision: "Bonus Provision",
  totalEmployerContribution: "Total Employer Contribution",
};

function SimpleAmountTable({
  data,
  labels,
}: {
  data: object;
  labels: Record<string, string>;
}) {
  const rows = Object.entries(data as Record<string, unknown>).map(([key, amount]) => ({
    key,
    label: labels[key] || key,
    amount: Number(amount || 0),
  }));

  return (
    <Table
      rowKey="key"
      size="small"
      pagination={false}
      columns={[
        { title: "Particulars", dataIndex: "label", key: "label" },
        {
          title: "Amount",
          dataIndex: "amount",
          key: "amount",
          align: "right" as const,
          render: currency,
        },
      ]}
      dataSource={rows}
    />
  );
}

export default function PayslipView({
  result,
  salarySlipLogo,
}: PayslipViewProps) {
  if (!result) {
    return <Empty description="Generate payroll to view a payslip." />;
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card>
        <Space
          align="start"
          style={{ width: "100%", justifyContent: "space-between" }}
          wrap
        >
          <div>
            {salarySlipLogo?.dataUrl && (
              <img
                src={salarySlipLogo.dataUrl}
                alt={salarySlipLogo.name || "Salary slip logo"}
                style={{
                  display: "block",
                  maxWidth: 120,
                  maxHeight: 48,
                  objectFit: "contain",
                  marginBottom: 8,
                }}
              />
            )}
            <Title level={4} style={{ marginTop: 0 }}>
              Payslip View
            </Title>
            <Text type="secondary">
              {monthName(result.month)} {result.year} salary slip for{" "}
              {formatEmployeeName(result.employee.name)}
            </Text>
          </div>
          <Button
            type="primary"
            icon={<Download size={16} />}
            onClick={() => downloadPayslipPdf(result, { logo: salarySlipLogo })}
          >
            Download PDF
          </Button>
        </Space>
      </Card>

      <Card>
        <Descriptions
          title={`${monthName(result.month)} ${result.year} Payslip`}
          column={{ xs: 1, md: 3 }}
          size="small"
          bordered
        >
          <Descriptions.Item label="Employee">
            {formatEmployeeName(result.employee.name)}
          </Descriptions.Item>
          <Descriptions.Item label="Employee ID">
            {result.employee.id}
          </Descriptions.Item>
          <Descriptions.Item label="State">{result.state}</Descriptions.Item>
          <Descriptions.Item label="Department">
            {result.employee.department || "-"}
          </Descriptions.Item>
          <Descriptions.Item label="Payable Days">
            {result.payableDays}
          </Descriptions.Item>
          <Descriptions.Item label="LOP Days">{result.lopDays}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Earnings" size="small">
            <SimpleAmountTable data={result.earnings} labels={earningLabels} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Deductions" size="small">
            <SimpleAmountTable data={result.deductions} labels={deductionLabels} />
          </Card>
        </Col>
        <Col xs={24}>
          <Card title="Employer Contributions" size="small">
            <SimpleAmountTable
              data={result.employerContributions}
              labels={employerContributionLabels}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic title="Net Salary" value={result.netSalary} formatter={(value) => currency(Number(value))} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic title="CTC" value={result.ctc} formatter={(value) => currency(Number(value))} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card size="small">
            <Statistic
              title="Employer Contribution"
              value={result.employerContributions.totalEmployerContribution}
              formatter={(value) => currency(Number(value))}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Read-only Rule Breakup" size="small">
        <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
          <Descriptions.Item label="PF">
            {String(result.ruleBreakup.pf.ruleApplied || "-")}
          </Descriptions.Item>
          <Descriptions.Item label="ESI">
            {String(result.ruleBreakup.esi.ruleApplied || "-")}
          </Descriptions.Item>
          <Descriptions.Item label="PT">
            {result.ruleBreakup.professionalTax.ruleApplied}
          </Descriptions.Item>
          <Descriptions.Item label="LWF">
            {result.ruleBreakup.lwf.ruleApplied}
          </Descriptions.Item>
          <Descriptions.Item label="LOP">
            {String(result.ruleBreakup.lop.ruleApplied || "-")}
          </Descriptions.Item>
          <Descriptions.Item label="OT">
            {String(result.ruleBreakup.overtime.ruleApplied || "-")}
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}
