import { useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Row,
  Select,
  Space,
  Statistic,
  Typography,
} from "antd";
import { Calculator, FileText } from "lucide-react";
import type { Dayjs } from "dayjs";
import type { PayrollCalculationResult, PayrollEmployee } from "@/features/payroll/domain";
import { currency, monthName } from "./payrollPageUtils";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

const { Text, Title } = Typography;
const BRAND_NAVY = "#0a3750";

const matchesPayrollEmployeeId = (
  employee: PayrollEmployee,
  employeeId?: string
) =>
  Boolean(employeeId) &&
  [
    employee.id,
    employee.empCode,
    employee.userProfileId,
    employee.employeeRef,
  ].includes(
    employeeId
  );

export type PayrollGenerationScope =
  | { type: "employee"; employeeId: string }
  | { type: "department"; department: string }
  | { type: "all" };

interface GeneratePayrollProps {
  payrollDate: Dayjs;
  employee: PayrollEmployee;
  employees?: PayrollEmployee[];
  result?: PayrollCalculationResult;
  generating?: boolean;
  onDateChange: (date: Dayjs) => void;
  onEmployeeChange: (employee: PayrollEmployee) => void;
  onGenerate: (scope: PayrollGenerationScope) => void;
}

export default function GeneratePayroll({
  payrollDate,
  employee,
  employees = [],
  result,
  generating = false,
  onDateChange,
  onEmployeeChange,
  onGenerate,
}: GeneratePayrollProps) {
  const employeeOptions = [
    ...employees,
    ...(employees.some((item) => matchesPayrollEmployeeId(item, employee.id))
      ? []
      : [employee]),
  ].map((item) => ({
    label: `${item.empCode || item.id} - ${formatEmployeeName(item.name)}`,
    value: item.id,
  }));

  const departmentOptions = Array.from(
    new Set(
      [employee.department, ...employees.map((item) => item.department)]
        .filter(Boolean)
        .map(String)
    )
  ).map((department) => ({ label: department, value: department }));

  const [scopeType, setScopeType] = useState<PayrollGenerationScope["type"]>(
    "employee"
  );
  const [department, setDepartment] = useState(employee.department || "");

  const selectEmployee = (employeeId: string) => {
    const selected = employees.find((item) =>
      matchesPayrollEmployeeId(item, employeeId)
    );
    if (selected) {
      onEmployeeChange(selected);
    }
  };

  const generate = () => {
    if (scopeType === "all") {
      onGenerate({ type: "all" });
      return;
    }

    if (scopeType === "department") {
      onGenerate({ type: "department", department });
      return;
    }

    onGenerate({ type: "employee", employeeId: employee.id });
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        className="!rounded-xl border-0 shadow-sm"
        style={{ borderLeft: `4px solid ${BRAND_NAVY}` }}
      >
        <Title level={4} style={{ marginTop: 0, color: BRAND_NAVY }}>
          Generate Payroll
        </Title>
        <Text type="secondary">
          Generate payroll from employee salary structures, attendance inputs, and internal rules.
        </Text>
      </Card>

      <Card size="small" className="!rounded-xl border-0 shadow-sm">
        <Row gutter={[12, 12]} align="bottom">
          <Col xs={24} md={6}>
            <Text type="secondary">Month / Year</Text>
            <DatePicker
              picker="month"
              value={payrollDate}
              allowClear={false}
              style={{ width: "100%", marginTop: 4 }}
              onChange={(value) => value && onDateChange(value)}
            />
          </Col>
          <Col xs={24} md={6}>
            <Text type="secondary">Generate For</Text>
            <Select
              value={scopeType}
              style={{ width: "100%", marginTop: 4 }}
              options={[
                { label: "Employee", value: "employee" },
                { label: "Department", value: "department" },
                { label: "All Employees", value: "all" },
              ]}
              onChange={setScopeType}
            />
          </Col>
          <Col xs={24} md={6}>
            {scopeType === "department" ? (
              <>
                <Text type="secondary">Department</Text>
                <Select
                  value={department || undefined}
                  style={{ width: "100%", marginTop: 4 }}
                  options={departmentOptions}
                  onChange={setDepartment}
                  showSearch
                />
              </>
            ) : (
              <>
                <Text type="secondary">Employee</Text>
                <Select
                  value={employee.id}
                  disabled={scopeType === "all"}
                  style={{ width: "100%", marginTop: 4 }}
                  options={employeeOptions}
                  onChange={selectEmployee}
                  showSearch
                  optionFilterProp="label"
                />
              </>
            )}
          </Col>
          <Col xs={24} md={6}>
            <Button
              type="primary"
              icon={<Calculator size={16} />}
              onClick={generate}
              loading={generating}
              block
              style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY }}
            >
              Generate Payroll
            </Button>
          </Col>
        </Row>
      </Card>

      {result && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={8}>
              <Card size="small" className="!rounded-xl border-0 shadow-sm" style={{ borderLeft: `4px solid ${BRAND_NAVY}` }}>
                <Statistic
                  title="Gross Salary"
                  value={result.earnings.grossEarnings}
                  formatter={(value) => currency(Number(value))}
                  valueStyle={{ color: BRAND_NAVY }}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" className="!rounded-xl border-0 shadow-sm" style={{ borderLeft: "4px solid #ff3228" }}>
                <Statistic
                  title="Total Deductions"
                  value={result.deductions.totalDeductions}
                  formatter={(value) => currency(Number(value))}
                  valueStyle={{ color: "#ff3228" }}
                />
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" className="!rounded-xl border-0 shadow-sm" style={{ borderLeft: "4px solid #389e0d" }}>
                <Statistic
                  title="Net Salary"
                  value={result.netSalary}
                  formatter={(value) => currency(Number(value))}
                  valueStyle={{ color: "#389e0d" }}
                />
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            className="!rounded-xl border-0 shadow-sm"
            title={
              <Space>
                <FileText size={16} color={BRAND_NAVY} />
                <span>Generated Payroll Summary</span>
              </Space>
            }
          >
            <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
              <Descriptions.Item label="Employee">
                {formatEmployeeName(result.employee.name)}
              </Descriptions.Item>
              <Descriptions.Item label="Month">
                {monthName(result.month)} {result.year}
              </Descriptions.Item>
              <Descriptions.Item label="State">{result.state}</Descriptions.Item>
              <Descriptions.Item label="Payable Days">
                {result.payableDays}
              </Descriptions.Item>
              <Descriptions.Item label="LOP Days">{result.lopDays}</Descriptions.Item>
              <Descriptions.Item label="CTC">{currency(result.ctc)}</Descriptions.Item>
            </Descriptions>
          </Card>
        </>
      )}
    </Space>
  );
}