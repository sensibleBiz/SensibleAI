import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { UploadProps } from "antd";
import type { Dayjs } from "dayjs";
import { Download, FileText, Trash2, Upload as UploadIcon } from "lucide-react";
import type { ColumnsType } from "antd/es/table";
import type {
  PayrollCalculationResult,
  PayrollEmployee,
  PayrollMonth,
} from "@/features/payroll/domain";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { currency, monthName } from "./payrollPageUtils";
import type { PayslipLogo } from "./payslipPdf";

const { Text, Title } = Typography;
const BRAND_NAVY = "#0a3750";

export interface SalarySlipMonthRow {
  key: string;
  month: PayrollMonth;
  year: number;
  canGenerate: boolean;
  unavailableReason?: "UPCOMING" | "BEFORE_JOINING";
  result?: PayrollCalculationResult;
}

interface GenerateSalarySlipProps {
  employee: PayrollEmployee;
  employees: PayrollEmployee[];
  salaryStructureSaved: boolean;
  salarySlipYear: Dayjs;
  salarySlipMonths: SalarySlipMonthRow[];
  generating?: boolean;
  salarySlipLogo?: PayslipLogo | null;
  onEmployeeChange: (employee: PayrollEmployee) => void;
  onYearChange: (date: Dayjs) => void;
  onGenerate: (month: PayrollMonth, year: number) => void;
  onDownloadPdf: (month: PayrollMonth, year: number) => void;
  onSalarySlipLogoChange: (logo: PayslipLogo | null) => void;
}

const getDepartment = (employee: PayrollEmployee) =>
  employee.department?.trim() || "Unassigned";

const MAX_LOGO_SIZE_BYTES = 1024 * 1024;
const supportedLogoTypes = ["image/png", "image/jpeg"];

const readSalarySlipLogo = (file: File): Promise<PayslipLogo> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Logo could not be read"));
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const image = new Image();

      image.onload = () =>
        resolve({
          dataUrl,
          name: file.name,
          mimeType: file.type,
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
      image.onerror = () =>
        resolve({
          dataUrl,
          name: file.name,
          mimeType: file.type,
        });
      image.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });

export default function GenerateSalarySlip({
  employee,
  employees,
  salaryStructureSaved,
  salarySlipYear,
  salarySlipMonths,
  generating = false,
  salarySlipLogo,
  onEmployeeChange,
  onYearChange,
  onGenerate,
  onDownloadPdf,
  onSalarySlipLogoChange,
}: GenerateSalarySlipProps) {
  const currentDepartment = getDepartment(employee);
  const departments = useMemo(
    () =>
      [...new Set(employees.map(getDepartment))]
        .sort((left, right) => left.localeCompare(right))
        .map((department) => ({ label: department, value: department })),
    [employees]
  );
  const [selectedDepartment, setSelectedDepartment] = useState(
    currentDepartment
  );
  const [logoError, setLogoError] = useState("");

  useEffect(() => {
    setSelectedDepartment(currentDepartment);
  }, [currentDepartment]);

  const departmentEmployees = useMemo(
    () => employees.filter((item) => getDepartment(item) === selectedDepartment),
    [employees, selectedDepartment]
  );

  const changeDepartment = (department: string) => {
    setSelectedDepartment(department);
    const firstEmployee = employees.find(
      (item) => getDepartment(item) === department
    );

    if (firstEmployee) {
      onEmployeeChange(firstEmployee);
    }
  };

  const handleLogoBeforeUpload: UploadProps["beforeUpload"] = async (file) => {
    setLogoError("");

    if (!supportedLogoTypes.includes(file.type)) {
      setLogoError("Upload a PNG or JPG logo.");
      return Upload.LIST_IGNORE;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoError("Logo must be 1 MB or smaller.");
      return Upload.LIST_IGNORE;
    }

    try {
      const logo = await readSalarySlipLogo(file);
      onSalarySlipLogoChange(logo);
    } catch {
      setLogoError("Could not read the logo. Try another image.");
    }

    return false;
  };

  const salarySlipColumns: ColumnsType<SalarySlipMonthRow> = [
    {
      title: "Month",
      key: "month",
      render: (_, record) => `${monthName(record.month)} ${record.year}`,
    },
    {
      title: "Gross",
      key: "gross",
      align: "right",
      render: (_, record) =>
        record.result ? currency(record.result.earnings.grossEarnings) : "-",
    },
    {
      title: "Deductions",
      key: "deductions",
      align: "right",
      render: (_, record) =>
        record.result
          ? currency(record.result.deductions.totalDeductions)
          : "-",
    },
    {
      title: "Net Salary",
      key: "netSalary",
      align: "right",
      render: (_, record) =>
        record.result ? (
          <Text strong style={{ color: "#389e0d" }}>
            {currency(record.result.netSalary)}
          </Text>
        ) : (
          "-"
        ),
    },
    {
      title: "Attendance",
      key: "attendance",
      align: "right",
      render: (_, record) =>
        record.result
          ? `${record.result.payableDays} payable / ${record.result.lopDays} LOP`
          : "-",
    },
    {
      title: "Status",
      key: "status",
      render: (_, record) =>
        record.unavailableReason === "BEFORE_JOINING" ? (
          <Tag className="!rounded-full">Not Joined</Tag>
        ) : !record.canGenerate ? (
          <Tag color="blue" className="!rounded-full">Upcoming</Tag>
        ) : record.result ? (
          <Tag color="green" className="!rounded-full">Generated</Tag>
        ) : (
          <Tag className="!rounded-full">Pending</Tag>
        ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 230,
      render: (_, record) =>
        record.result ? (
          <Button
            size="small"
            icon={<Download size={14} />}
            loading={generating}
            onClick={() => onDownloadPdf(record.month, record.year)}
            style={{ color: BRAND_NAVY, borderColor: BRAND_NAVY }}
          >
            Download PDF
          </Button>
        ) : (
          <Button
            size="small"
            icon={<FileText size={14} />}
            loading={generating}
            disabled={!salaryStructureSaved || !record.canGenerate}
            onClick={() => onGenerate(record.month, record.year)}
          >
            Generate
          </Button>
        ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card className="!rounded-xl border-0 shadow-sm" style={{ borderLeft: `4px solid ${BRAND_NAVY}` }}>
        <Space
          align="start"
          style={{ width: "100%", justifyContent: "space-between" }}
          wrap
        >
          <div>
            <Title level={4} style={{ margin: 0, color: BRAND_NAVY }}>
              Generate Salary Slip
            </Title>
            <Text type="secondary">
              Add a company logo before downloading salary slip PDFs.
            </Text>
          </div>
          <Space wrap>
            <Upload
              accept="image/png,image/jpeg"
              beforeUpload={handleLogoBeforeUpload}
              showUploadList={false}
            >
              <Button icon={<UploadIcon size={14} />}>Upload Logo</Button>
            </Upload>
            {salarySlipLogo && (
              <Button
                danger
                icon={<Trash2 size={14} />}
                onClick={() => {
                  setLogoError("");
                  onSalarySlipLogoChange(null);
                }}
              >
                Remove
              </Button>
            )}
          </Space>
        </Space>

        <div style={{ marginTop: 12 }}>
          {salarySlipLogo ? (
            <Space align="center" wrap>
              <img
                src={salarySlipLogo.dataUrl}
                alt={salarySlipLogo.name || "Salary slip logo"}
                style={{
                  width: 96,
                  height: 48,
                  objectFit: "contain",
                  border: "1px solid #d9d9d9",
                  borderRadius: 6,
                  background: "#fff",
                  padding: 4,
                }}
              />
              <Text>{salarySlipLogo.name || "Uploaded logo"}</Text>
            </Space>
          ) : (
            <Text type="secondary">PNG or JPG, up to 1 MB.</Text>
          )}
          {logoError && (
            <div style={{ marginTop: 8 }}>
              <Text type="danger">{logoError}</Text>
            </div>
          )}
        </div>
      </Card>

      <Card className="!rounded-xl border-0 shadow-sm">
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12}>
            <Text type="secondary">Department</Text>
            <Select
              value={selectedDepartment}
              style={{ width: "100%", marginTop: 4 }}
              options={departments}
              onChange={changeDepartment}
            />
          </Col>
          <Col xs={24} md={12}>
            <Text type="secondary">Employee</Text>
            <Select
              value={employee.id}
              style={{ width: "100%", marginTop: 4 }}
              options={departmentEmployees.map((item) => ({
                label: `${item.empCode || item.id} - ${formatEmployeeName(item.name)}`,
                value: item.id,
              }))}
              onChange={(employeeId) => {
                const selectedEmployee = departmentEmployees.find(
                  (item) => item.id === employeeId
                );

                if (selectedEmployee) {
                  onEmployeeChange(selectedEmployee);
                }
              }}
              showSearch
              optionFilterProp="label"
            />
          </Col>
        </Row>
      </Card>

      <Card
        title="Month Wise Salary Slips"
        size="small"
        className="!rounded-xl border-0 shadow-sm"
        extra={
          <DatePicker
            picker="year"
            allowClear={false}
            value={salarySlipYear}
            onChange={(value) => value && onYearChange(value)}
          />
        }
      >
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ x: 850 }}
          columns={salarySlipColumns}
          dataSource={salarySlipMonths}
        />
      </Card>
    </Space>
  );
}