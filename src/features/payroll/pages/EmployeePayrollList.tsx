import { useEffect, useState } from "react";
import { Alert, Card, Empty, Space, Table, Tag, Typography } from "antd";
import type { PayrollEmployee, PayrollRunDocument, EmployeeSalaryStructureDocument } from "@/features/payroll/domain";
import { payrollApi } from "../api/payrollApi";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { currency, monthName } from "./payrollPageUtils";

const { Text, Title } = Typography;
const BRAND_NAVY = "#0a3750";

interface EmployeePayrollListProps {
  outletId?: string;
  employees: PayrollEmployee[];
}

interface EmployeePayrollRow {
  key: string;
  employee: string;
  code: string;
  department: string;
  salary: number;
  salaryStatus: "ADDED" | "NOT ADDED";
  payroll: PayrollRunDocument | undefined;
}

const matchesEmployee = (
  employee: PayrollEmployee,
  document: { employeeId?: string; userProfileId?: string; employeeRef?: string }
) =>
  [employee.id, employee.userProfileId, employee.employeeRef].some(
    (value) => value && [document.employeeId, document.userProfileId, document.employeeRef].includes(value)
  );

export default function EmployeePayrollList({ outletId, employees }: EmployeePayrollListProps) {
  const [salaryDocuments, setSalaryDocuments] = useState<EmployeeSalaryStructureDocument[]>([]);
  const [payrollDocuments, setPayrollDocuments] = useState<PayrollRunDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    const loadDocuments = async () => {
      if (!outletId) {
        setSalaryDocuments([]);
        setPayrollDocuments([]);
        return;
      }

      setLoading(true);
      setError(undefined);
      const records = await payrollApi.getOverview(outletId);

      if (cancelled) return;
      setSalaryDocuments(records.map((record) => record.salaryStructure));
      setPayrollDocuments(
        records.flatMap((record) =>
          record.latestPayroll ? [record.latestPayroll] : []
        )
      );
      setLoading(false);
    };

    loadDocuments().catch(() => {
      if (!cancelled) {
        setError("Unable to load employee salary and payroll records.");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [outletId]);

  const rows: EmployeePayrollRow[] = employees.map((employee) => {
    const salary = salaryDocuments.find((document) => matchesEmployee(employee, document));
    const payroll = payrollDocuments
      .filter((document) => matchesEmployee(employee, document))
      .sort((left, right) => right.year - left.year || right.month - left.month)[0];

    return {
      key: employee.id,
      employee: formatEmployeeName(employee.name),
      code: employee.empCode || "-",
      department: employee.department || "-",
      salary: salary?.grossSalary || 0,
      salaryStatus: salary ? "ADDED" : "NOT ADDED",
      payroll,
    };
  });

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        className="!rounded-xl border-0 shadow-sm"
        style={{ borderLeft: `4px solid ${BRAND_NAVY}` }}
      >
        <Title level={4} style={{ marginTop: 0, color: BRAND_NAVY }}>Employee Payroll</Title>
        <Text type="secondary">All active employees with salary structures and latest generated payroll.</Text>
      </Card>
      {error && <Alert type="error" message={error} className="!rounded-xl" showIcon />}
      {!employees.length ? (
        <Card className="!rounded-xl border-0 shadow-sm">
          <Empty description="No active employees found." />
        </Card>
      ) : (
        <Card className="!rounded-xl border-0 shadow-sm">
          <Table
            loading={loading}
            rowKey="key"
            dataSource={rows}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 850 }}
            columns={[
              { title: "Employee", dataIndex: "employee", key: "employee" },
              { title: "Employee Code", dataIndex: "code", key: "code" },
              { title: "Department", dataIndex: "department", key: "department" },
              {
                title: "Added Salary",
                dataIndex: "salary",
                key: "salary",
                align: "right" as const,
                render: (value: number) => (
                  <Text strong style={{ color: BRAND_NAVY }}>
                    {currency(value)}
                  </Text>
                ),
              },
              {
                title: "Salary Structure",
                dataIndex: "salaryStatus",
                key: "salaryStatus",
                render: (status: EmployeePayrollRow["salaryStatus"]) => (
                  <Tag color={status === "ADDED" ? "green" : "orange"} className="!rounded-full">
                    {status}
                  </Tag>
                ),
              },
              {
                title: "Generated Payroll",
                key: "payroll",
                render: (_: unknown, row: EmployeePayrollRow) =>
                  row.payroll ? (
                    `${monthName(row.payroll.month)} ${row.payroll.year}`
                  ) : (
                    <Tag className="!rounded-full">NOT GENERATED</Tag>
                  ),
              },
              {
                title: "Net Salary",
                key: "netSalary",
                align: "right" as const,
                render: (_: unknown, row: EmployeePayrollRow) =>
                  row.payroll ? (
                    <Text strong style={{ color: "#389e0d" }}>
                      {currency(row.payroll.netSalary)}
                    </Text>
                  ) : (
                    "-"
                  ),
              },
              {
                title: "Payroll Status",
                key: "payrollStatus",
                render: (_: unknown, row: EmployeePayrollRow) =>
                  row.payroll ? (
                    <Tag color="blue" className="!rounded-full">
                      {row.payroll.status}
                    </Tag>
                  ) : (
                    "-"
                  ),
              },
            ]}
          />
        </Card>
      )}
    </Space>
  );
}
