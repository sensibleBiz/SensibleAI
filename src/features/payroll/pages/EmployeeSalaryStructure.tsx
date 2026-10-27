import {
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Typography,
} from "antd";
import dayjs, { Dayjs } from "dayjs";
import { Calculator, RotateCcw, Save } from "lucide-react";
import {
  calculateMonthlyFixedGross,
  deriveSalaryComponentsFromGross,
  mergeAttendanceSettings,
  mergePayrollOptions,
  roundMoney,
} from "@/features/payroll/domain";
import type {
  MonthDayRule,
  PayrollCalculationResult,
  PayrollEmployee,
  PayrollApplicabilityOptions,
  PayrollGender,
  SalaryComponentKey,
  SalaryStructure,
  SalaryType,
} from "@/features/payroll/domain";
import { STATES_OBJECT } from "@/shared/lib/constants";
import { currency } from "./payrollPageUtils";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

const { Text, Title } = Typography;
const BRAND_NAVY = "#0a3750";

interface EmployeeSalaryStructureProps {
  employee: PayrollEmployee;
  employees?: PayrollEmployee[];
  salaryStructure: SalaryStructure;
  previewResult?: PayrollCalculationResult;
  saving?: boolean;
  salaryStructureSaved?: boolean;
  salaryEffectiveFrom: Dayjs;
  onEmployeeChange: (employee: PayrollEmployee) => void;
  onSalaryStructureChange: (salaryStructure: SalaryStructure) => void;
  onCalculatePreview: () => void;
  onSave: () => void;
  onSalaryEffectiveFromChange: (date: Dayjs) => void;
  onReset: () => void;
}

const autoDerivedEarningKeys = new Set<SalaryComponentKey>([
  "basic",
  "hra",
  "da",
  "conveyance",
  "medical",
  "specialAllowance",
]);

const salaryComponents: { key: SalaryComponentKey; label: string }[] = [
  { key: "basic", label: "Basic" },
  { key: "hra", label: "HRA" },
  { key: "da", label: "DA" },
  { key: "conveyance", label: "Conveyance" },
  { key: "medical", label: "Medical" },
  { key: "specialAllowance", label: "Special Allowance" },
  { key: "otherEarnings", label: "Other Allowance" },
  { key: "incentive", label: "Incentive" },
];

const payrollOptions: {
  key: keyof PayrollApplicabilityOptions;
  label: string;
}[] = [
  { key: "pfApplicable", label: "PF Applicable" },
  { key: "pfCeilingApplicable", label: "Apply PF Ceiling" },
  { key: "esiApplicable", label: "ESI Applicable" },
  { key: "ptApplicable", label: "PT Applicable" },
  { key: "lwfApplicable", label: "LWF Applicable" },
  { key: "bonusApplicable", label: "Bonus Applicable" },
  { key: "gratuityApplicable", label: "Gratuity Applicable" },
  { key: "tdsApplicable", label: "TDS Applicable" },
  { key: "otApplicable", label: "OT Applicable" },
];

const salaryTypeOptions: { label: string; value: SalaryType }[] = [
  { label: "Monthly", value: "MONTHLY" },
  { label: "Daily", value: "DAILY" },
  { label: "Hourly", value: "HOURLY" },
];

const genderOptions: { label: string; value: PayrollGender }[] = [
  { label: "Female", value: "FEMALE" },
  { label: "Male", value: "MALE" },
  { label: "Other", value: "OTHER" },
  { label: "Not specified", value: "UNSPECIFIED" },
];

const monthDayRuleOptions: { label: string; value: MonthDayRule }[] = [
  { label: "Actual Days", value: "ACTUAL_DAYS" },
  { label: "26 Days", value: "DAYS_26" },
  { label: "30 Days", value: "DAYS_30" },
];

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

export default function EmployeeSalaryStructure({
  employee,
  employees = [],
  salaryStructure,
  previewResult,
  saving = false,
  salaryStructureSaved = false,
  salaryEffectiveFrom,
  onEmployeeChange,
  onSalaryStructureChange,
  onCalculatePreview,
  onSave,
  onSalaryEffectiveFromChange,
  onReset,
}: EmployeeSalaryStructureProps) {
  const effectivePayrollOptions = mergePayrollOptions(
    salaryStructure.payrollOptions
  );
  const attendanceSettings = mergeAttendanceSettings(
    salaryStructure.attendanceSettings
  );
  const grossInput = roundMoney(
    salaryStructure.grossSalary ??
      calculateMonthlyFixedGross(salaryStructure.earnings)
  );

  const updateEmployee = (patch: Partial<PayrollEmployee>) =>
    onEmployeeChange({ ...employee, ...patch });

  const updateSalaryStructure = (patch: Partial<SalaryStructure>) =>
    onSalaryStructureChange({ ...salaryStructure, ...patch });

  const updateEarning = (key: SalaryComponentKey, value?: number | null) => {
    if (autoDerivedEarningKeys.has(key)) return;

    const earnings = {
      ...salaryStructure.earnings,
      [key]: Number(value || 0),
    };

    onSalaryStructureChange({
      ...salaryStructure,
      earnings,
    });
  };

  const applyGrossSalaryRules = (
    grossSalary: number,
    isMetroCity = salaryStructure.isMetroCity ?? false
  ) =>
    deriveSalaryComponentsFromGross(grossSalary, {
      isMetroCity,
      earnings: salaryStructure.earnings,
    });

  const updateGrossSalary = (value?: number | null) => {
    if (value === null || value === undefined) return;

    const grossSalary = roundMoney(Math.max(Number(value), 0));

    onSalaryStructureChange({
      ...salaryStructure,
      grossSalary,
      earnings: applyGrossSalaryRules(grossSalary),
    });
  };

  const updateMetroCity = (isMetroCity: boolean) => {
    onSalaryStructureChange({
      ...salaryStructure,
      isMetroCity,
      earnings: applyGrossSalaryRules(grossInput, isMetroCity),
    });
  };

  const updatePayrollOption = (
    key: keyof PayrollApplicabilityOptions,
    checked: boolean
  ) =>
    updateSalaryStructure({
      payrollOptions: {
        ...effectivePayrollOptions,
        [key]: checked,
      },
    });

  const updateAttendanceSetting = (
    patch: Partial<typeof attendanceSettings>
  ) =>
    updateSalaryStructure({
      attendanceSettings: {
        ...attendanceSettings,
        ...patch,
      },
    });

  const selectEmployee = (employeeId: string) => {
    const selected = employees.find((item) =>
      matchesPayrollEmployeeId(item, employeeId)
    );
    if (selected) {
      onEmployeeChange(selected);
    } else {
      updateEmployee({ id: employeeId });
    }
  };

  const employeeOptions = [
    ...employees,
    ...(employees.some((item) => matchesPayrollEmployeeId(item, employee.id))
      ? []
      : [employee]),
  ].map((item) => ({
    label: `${item.empCode || item.id} - ${formatEmployeeName(item.name)}`,
    value: item.id,
  }));

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card
        className="!rounded-xl border-0 shadow-sm"
        style={{ borderLeft: `4px solid ${BRAND_NAVY}` }}
      >
        <Title level={4} style={{ marginTop: 0, color: BRAND_NAVY }}>
          Employee Salary Structure
        </Title>
        <Text type="secondary">
          Salary components and applicability options drive statutory calculations automatically.
        </Text>
      </Card>

      <Card title="Employee Details" size="small" className="!rounded-xl border-0 shadow-sm">
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
            <Text type="secondary">Employee Name</Text>
            <Input
              value={formatEmployeeName(employee.name)}
              readOnly
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Employee ID</Text>
            <Input
              value={employee.id}
              readOnly
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Department</Text>
            <Input
              value={employee.department}
              readOnly
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Designation</Text>
            <Input
              value={employee.designation}
              readOnly
              style={{ marginTop: 4 }}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Work Location State</Text>
            <Select
              value={employee.workLocationState}
              style={{ width: "100%", marginTop: 4 }}
              options={STATES_OBJECT.map((item) => ({
                label: item.label,
                value: item.value,
              }))}
              showSearch
              optionFilterProp="label"
              onChange={(workLocationState) =>
                updateEmployee({ workLocationState })
              }
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Joining Date</Text>
            <DatePicker
              value={employee.dateOfJoining ? dayjs(employee.dateOfJoining) : null}
              disabled
              style={{ width: "100%", marginTop: 4 }}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Gender</Text>
            <Select
              value={employee.gender || "UNSPECIFIED"}
              style={{ width: "100%", marginTop: 4 }}
              options={genderOptions}
              onChange={(gender: PayrollGender) => updateEmployee({ gender })}
            />
          </Col>
        </Row>
      </Card>

      <Card title="Salary Input" size="small" className="!rounded-xl border-0 shadow-sm">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Text type="secondary">Salary Type</Text>
            <Select
              value={salaryStructure.salaryType || "MONTHLY"}
              style={{ width: "100%", marginTop: 4 }}
              options={salaryTypeOptions}
              onChange={(salaryType) => updateSalaryStructure({ salaryType })}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Effective From</Text>
            <DatePicker
              picker="month"
              allowClear={false}
              value={salaryEffectiveFrom}
              style={{ width: "100%", marginTop: 4 }}
              onChange={(value) =>
                value && onSalaryEffectiveFromChange(value.startOf("month"))
              }
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Gross Salary (Monthly)</Text>
            <InputNumber
              min={0}
              precision={2}
              value={grossInput}
              style={{ width: "100%", marginTop: 4 }}
              onChange={updateGrossSalary}
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Metro City (HRA 50%)</Text>
            <div style={{ marginTop: 4 }}>
              <Switch
                checked={salaryStructure.isMetroCity ?? false}
                onChange={updateMetroCity}
                checkedChildren="Metro"
                unCheckedChildren="Non-Metro"
              />
            </div>
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Calculated CTC</Text>
            <InputNumber
              disabled
              value={
                salaryStructureSaved
                  ? salaryStructure.ctc || previewResult?.ctc || grossInput
                  : previewResult?.ctc || grossInput
              }
              formatter={(value) => currency(Number(value || 0))}
              style={{ width: "100%", marginTop: 4 }}
            />
          </Col>
          {salaryComponents.map((component) => (
            <Col xs={24} sm={12} lg={8} key={component.key}>
              <Text type="secondary">{component.label}</Text>
              <InputNumber
                min={0}
                precision={2}
                value={salaryStructure.earnings[component.key]}
                disabled={autoDerivedEarningKeys.has(component.key)}
                style={{ width: "100%", marginTop: 4 }}
                onChange={(value) => updateEarning(component.key, value)}
              />
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="Payroll Options" size="small" className="!rounded-xl border-0 shadow-sm">
        <Row gutter={[12, 12]}>
          {payrollOptions.map((option) => (
            <Col xs={24} sm={12} lg={8} key={option.key}>
              <Space>
                <Switch
                  checked={effectivePayrollOptions[option.key]}
                  onChange={(checked) => updatePayrollOption(option.key, checked)}
                />
                <Text>{option.label}</Text>
              </Space>
            </Col>
          ))}
        </Row>
      </Card>

      <Card title="Attendance Settings" size="small" className="!rounded-xl border-0 shadow-sm">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={8}>
            <Text type="secondary">Month Day Calculation</Text>
            <Select
              value={attendanceSettings.monthDayRule}
              style={{ width: "100%", marginTop: 4 }}
              options={monthDayRuleOptions}
              onChange={(monthDayRule) =>
                updateAttendanceSetting({ monthDayRule })
              }
            />
          </Col>
          <Col xs={24} md={8}>
            <Text type="secondary">Leave Policy</Text>
            <Select
              value={attendanceSettings.leavePolicyId || "default"}
              style={{ width: "100%", marginTop: 4 }}
              options={[{ label: "Default Leave Policy", value: "default" }]}
              onChange={(leavePolicyId) =>
                updateAttendanceSetting({
                  leavePolicyId:
                    leavePolicyId === "default" ? undefined : leavePolicyId,
                })
              }
            />
          </Col>
          <Col xs={24} md={4}>
            <Text type="secondary">Weekly Off Paid</Text>
            <div style={{ marginTop: 8 }}>
              <Switch
                checked={attendanceSettings.weeklyOffPaid}
                onChange={(weeklyOffPaid) =>
                  updateAttendanceSetting({ weeklyOffPaid })
                }
              />
            </div>
          </Col>
          <Col xs={24} md={4}>
            <Text type="secondary">Paid Holiday Included</Text>
            <div style={{ marginTop: 8 }}>
              <Switch
                checked={attendanceSettings.paidHolidayIncluded}
                onChange={(paidHolidayIncluded) =>
                  updateAttendanceSetting({ paidHolidayIncluded })
                }
              />
            </div>
          </Col>
        </Row>
      </Card>

      <Card title="Auto Preview" size="small" className="!rounded-xl border-0 shadow-sm">
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Gross Salary"
              value={previewResult?.earnings.grossEarnings || grossInput}
              formatter={(value) => currency(Number(value))}
              valueStyle={{ color: BRAND_NAVY }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Employee PF"
              value={previewResult?.deductions.employeePF || 0}
              formatter={(value) => currency(Number(value))}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Employer PF"
              value={previewResult?.employerContributions.employerPF || 0}
              formatter={(value) => currency(Number(value))}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Employee ESI"
              value={previewResult?.deductions.employeeESI || 0}
              formatter={(value) => currency(Number(value))}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Employer ESI"
              value={previewResult?.employerContributions.employerESI || 0}
              formatter={(value) => currency(Number(value))}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Professional Tax"
              value={previewResult?.deductions.professionalTax || 0}
              formatter={(value) => currency(Number(value))}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Employee LWF"
              value={previewResult?.deductions.employeeLWF || 0}
              formatter={(value) => currency(Number(value))}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Employer LWF"
              value={previewResult?.employerContributions.employerLWF || 0}
              formatter={(value) => currency(Number(value))}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Estimated TDS"
              value={previewResult?.deductions.tds || 0}
              formatter={(value) => currency(Number(value))}
              valueStyle={{ color: "#ff3228" }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="Net Salary"
              value={previewResult?.netSalary || 0}
              formatter={(value) => currency(Number(value))}
              valueStyle={{ color: "#389e0d" }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Statistic
              title="CTC"
              value={previewResult?.ctc || salaryStructure.ctc || grossInput}
              formatter={(value) => currency(Number(value))}
              valueStyle={{ color: BRAND_NAVY }}
            />
          </Col>
        </Row>

        {previewResult && (
          <>
            <Divider />
            <Descriptions column={{ xs: 1, md: 2 }} size="small">
              <Descriptions.Item label="PF">
                {String(previewResult.ruleBreakup.pf.ruleApplied || "-")}
              </Descriptions.Item>
              <Descriptions.Item label="ESI">
                {String(previewResult.ruleBreakup.esi.ruleApplied || "-")}
              </Descriptions.Item>
              <Descriptions.Item label="PT">
                {previewResult.ruleBreakup.professionalTax.ruleApplied}
              </Descriptions.Item>
              <Descriptions.Item label="LWF">
                {previewResult.ruleBreakup.lwf.ruleApplied}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Card>

      <Space wrap>
        <Button
          type="primary"
          icon={<Save size={16} />}
          loading={saving}
          onClick={onSave}
          style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY }}
        >
          {salaryStructureSaved ? "Update Salary Structure" : "Save Salary Structure"}
        </Button>
        <Button icon={<Calculator size={16} />} onClick={onCalculatePreview}>
          Calculate Preview
        </Button>
        <Button icon={<RotateCcw size={16} />} onClick={onReset}>
          Reset
        </Button>
      </Space>
    </Space>
  );
}