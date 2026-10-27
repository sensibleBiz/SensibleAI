import {
  Card,
  Col,
  DatePicker,
  Descriptions,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Typography,
} from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import type {
  AttendancePayrollInput as AttendanceInput,
  PayrollEmployee,
  SalaryAttendanceSettings,
} from "@/features/payroll/domain";
import { calculateLopDays, calculatePayableDays } from "@/features/payroll/domain";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

const { Text, Title } = Typography;

const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

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

interface AttendancePayrollInputProps {
  attendance: AttendanceInput;
  employee: PayrollEmployee;
  employees?: PayrollEmployee[];
  payrollDate: Dayjs;
  attendanceSettings?: Partial<SalaryAttendanceSettings>;
  attendanceLoading?: boolean;
  onChange: (attendance: AttendanceInput) => void;
  onEmployeeChange: (employee: PayrollEmployee) => void;
  onDateChange: (date: Dayjs) => void;
}

const dayFields: { key: keyof AttendanceInput; label: string }[] = [
  { key: "presentDays", label: "Present Days" },
  { key: "paidLeave", label: "Paid Leave" },
  { key: "weeklyOff", label: "Weekly Off" },
  { key: "paidHolidays", label: "Paid Holidays" },
  { key: "absentDays", label: "Absent Days" },
  { key: "unpaidLeave", label: "Unpaid Leave" },
  { key: "preJoiningDays", label: "Pre-Joining Days" },
  { key: "pendingAttendanceDays", label: "Pending Attendance Days" },
];

const variableFields: { key: keyof AttendanceInput; label: string; precision?: number }[] = [
  { key: "otHours", label: "OT Hours", precision: 2 },
  { key: "loanDeduction", label: "Loan Deduction", precision: 2 },
  { key: "advanceDeduction", label: "Advance Deduction", precision: 2 },
  { key: "otherDeduction", label: "Other Deduction", precision: 2 },
  { key: "incentive", label: "Incentive", precision: 2 },
  { key: "arrears", label: "Arrears", precision: 2 },
];

export default function AttendancePayrollInput({
  attendance,
  employee,
  employees = [],
  payrollDate,
  attendanceSettings,
  attendanceLoading = false,
  onChange,
  onEmployeeChange,
  onDateChange,
}: AttendancePayrollInputProps) {
  const payableDays = calculatePayableDays(attendance, attendanceSettings);
  const lopDays = calculateLopDays(attendance, attendanceSettings);

  const updateAttendance = (key: keyof AttendanceInput, value?: number | null) =>
    onChange({ ...attendance, [key]: Number(value || 0) });

  const employeeOptions = [
    ...employees,
    ...(employees.some((item) => matchesPayrollEmployeeId(item, employee.id))
      ? []
      : [employee]),
  ].map((item) => ({
    label: `${item.empCode || item.id} - ${formatEmployeeName(item.name)}`,
    value: item.id,
  }));

  const selectEmployee = (employeeId: string) => {
    const selected = employees.find((item) =>
      matchesPayrollEmployeeId(item, employeeId)
    );
    if (selected) {
      onEmployeeChange(selected);
    }
  };

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        className="!rounded-xl border-0 shadow-sm"
        style={{ borderLeft: `4px solid ${BRAND_NAVY}` }}
      >
        <Title level={4} style={{ marginTop: 0, color: BRAND_NAVY }}>
          Attendance Payroll Input
        </Title>
        <Text type="secondary">
          Attendance days are calculated from monthly attendance records.
        </Text>
      </Card>

      <Card title="Payroll Period" size="small" className="!rounded-xl border-0 shadow-sm">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Text type="secondary">Employee</Text>
            <Select
              value={employee.id}
              style={{ width: "100%", marginTop: 4 }}
              options={employeeOptions}
              onChange={selectEmployee}
              showSearch
              optionFilterProp="label"
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Month</Text>
            <DatePicker
              picker="month"
              value={payrollDate}
              allowClear={false}
              style={{ width: "100%", marginTop: 4 }}
              onChange={(value) => value && onDateChange(value)}
              suffixIcon={<CalendarOutlined />}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Year</Text>
            <InputNumber
              min={2000}
              max={2100}
              precision={0}
              value={payrollDate.year()}
              style={{ width: "100%", marginTop: 4 }}
              onChange={(year) =>
                year && onDateChange(payrollDate.year(Number(year)))
              }
            />
          </Col>
        </Row>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            title="Attendance Summary"
            size="small"
            className="!rounded-xl border-0 shadow-sm"
            loading={attendanceLoading}
          >
            <Row gutter={[12, 12]}>
              {dayFields.map((field) => (
                <Col xs={24} sm={12} lg={8} key={field.key}>
                  <Text type="secondary">{field.label}</Text>
                  <InputNumber
                    min={0}
                    precision={0}
                    value={Number(attendance[field.key] || 0)}
                    style={{ width: "100%", marginTop: 4 }}
                    disabled
                  />
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            title="Computed Days"
            size="small"
            className="!rounded-xl border-0 shadow-sm"
            loading={attendanceLoading}
          >
            <Row gutter={[12, 12]}>
              <Col span={12}>
                <Statistic title="Payable Days" value={payableDays} valueStyle={{ color: "#389e0d" }} />
              </Col>
              <Col span={12}>
                <Statistic title="LOP Days" value={lopDays} valueStyle={{ color: BRAND_RED }} />
              </Col>
              <Col span={12}>
                <Statistic title="Month Days" value={attendance.monthDays} valueStyle={{ color: BRAND_NAVY }} />
              </Col>
              <Col span={12}>
                <Statistic title="OT Hours" value={attendance.otHours} precision={2} valueStyle={{ color: "#d48806" }} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      <Card title="Monthly Adjustments" size="small" className="!rounded-xl border-0 shadow-sm">
        <Row gutter={[12, 12]}>
          {variableFields.map((field) => (
            <Col xs={24} sm={12} lg={8} key={field.key}>
              <Text type="secondary">{field.label}</Text>
              <InputNumber
                min={0}
                precision={field.precision ?? 0}
                value={Number(attendance[field.key] || 0)}
                style={{ width: "100%", marginTop: 4 }}
                disabled={field.key === "otHours"}
                onChange={(value) => updateAttendance(field.key, value)}
              />
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="Attendance Snapshot" size="small" className="!rounded-xl border-0 shadow-sm">
        <Descriptions column={{ xs: 1, md: 3 }} size="small" bordered>
          <Descriptions.Item label="Employee">
            {formatEmployeeName(employee.name)}
          </Descriptions.Item>
          <Descriptions.Item label="Month">
            {payrollDate.format("MMMM")}
          </Descriptions.Item>
          <Descriptions.Item label="Year">{payrollDate.year()}</Descriptions.Item>
          <Descriptions.Item label="Absent Days">
            {attendance.absentDays}
          </Descriptions.Item>
          <Descriptions.Item label="Unpaid Leave">
            {attendance.unpaidLeave}
          </Descriptions.Item>
          <Descriptions.Item label="OT Hours">{attendance.otHours}</Descriptions.Item>
        </Descriptions>
      </Card>
    </Space>
  );
}