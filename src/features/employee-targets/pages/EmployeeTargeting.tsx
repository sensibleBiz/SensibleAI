import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card,
  Table,
  InputNumber,
  Button,
  Space,
  Typography,
  Tag,
  Popconfirm,
  Tooltip,
  DatePicker,
  Select,
  Modal,
  Form,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  ReloadOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  FilePdfOutlined,
  AimOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { Target, TrendingUp, Percent } from "lucide-react";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { employeeTargetApi } from "../api/employeeTargetApi";
import { PERMISSION_MASTER } from "@/shared/lib/constants";
import { useMessageApi } from "@/shared/hooks";
import { Can } from "@/features/access-control";
import { usePermission } from "@/features/access-control";
import dayjs, { Dayjs } from "dayjs";
import { TeamTreeDTO } from "@/features/team";
import jsPDF from "jspdf";
import autoTable, { CellHookData } from "jspdf-autotable";
import {
  formatEmployeeName,
  formatIndianAmount,
} from "@/shared/utils/helperFunctions";

const { Title, Text } = Typography;

// Brand palette — kept consistent with the City & State report
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";
const BRAND_PURPLE = "#7c3aed";

// Types
interface SalesTargetRow {
  id?: string;
  zone: string;
  saleExecutive: string;
  saleExecutiveId?: string; // userProfileId from teamTree
  decForecastNetSales: number;
  achieveNetSales: number;
  achievementPercentage: number;
  isTotal?: boolean;
  isGrandTotal?: boolean;
  parentZone?: string;
  order?: number;
  month?: number; // Month (1-12)
  year?: number; // Year (e.g., 2024)
  createdAt?: number;
  updatedAt?: number;
}

type ZoneType = "South" | "West" | "East" | "North" | "Subscriptions";

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

const EmployeeTargeting: React.FC = () => {
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );
  const teamTreeData = useSelector((state: RootState) =>
    state?.appState?.teamTreeData?.filter(
      (mem) =>
        mem?.department === "SALES" ||
        (mem?.department === "HR" && mem?.isOnPayRoll === true)
    )
  ) as TeamTreeDTO[] | undefined;
  const messageApi = useMessageApi();
  const { hasPermission } = usePermission();

  const [data, setData] = useState<SalesTargetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [, setEditingKey] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());

  // Set Target prompt modal
  const [setTargetOpen, setSetTargetOpen] = useState(false);
  const [setTargetSaving, setSetTargetSaving] = useState(false);
  const [setTargetForm] = Form.useForm();

  // Zone configuration - stable reference
  const zones: ZoneType[] = useMemo(
    () => ["South", "West", "East", "North", "Subscriptions"],
    []
  );

  // Get sales executives from teamTreeData
  const salesExecutives = useMemo(() => {
    if (!teamTreeData) return [];
    return teamTreeData
      .filter((emp) => emp?.isActive && emp?.isOnPayRoll)
      .map((emp) => ({
        label: formatEmployeeName(emp.userName),
        value: emp.userProfileId,
        userName: emp.userName,
      }));
  }, [teamTreeData]);

  // Fetch data from PostgreSQL filtered by month
  const loadTargets = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    try {
      const month = selectedMonth.month() + 1;
      const year = selectedMonth.year();
      const fetchedData = await employeeTargetApi.list(outletId, month, year);
      const sorted = [...fetchedData].sort((a, b) => {
        const zoneOrder = zones.indexOf(a.zone) - zones.indexOf(b.zone);
        return zoneOrder !== 0 ? zoneOrder : (a.order || 0) - (b.order || 0);
      });
      setData(sorted);
    } catch (error) {
      console.error("Error fetching employee targeting data:", error);
      messageApi.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [outletId, selectedMonth, zones, messageApi]);

  useEffect(() => {
    void loadTargets();
  }, [loadTargets]);

  // Calculate achievement percentage
  const calculateAchievement = useCallback((forecast: number, achieved: number): number => {
    if (!forecast || forecast === 0) return 0;
    return Math.round((achieved / forecast) * 100);
  }, []);

  // Calculate totals for a zone
  const calculateZoneTotal = useCallback((zone: ZoneType): SalesTargetRow => {
    const zoneRows = data.filter(
      (row) => row.zone === zone && !row.isTotal && !row.isGrandTotal
    );
    const forecast = zoneRows.reduce(
      (sum, row) => sum + (row.decForecastNetSales || 0),
      0
    );
    const achieved = zoneRows.reduce(
      (sum, row) => sum + (row.achieveNetSales || 0),
      0
    );
    return {
      zone,
      saleExecutive: `${zone} Total`,
      decForecastNetSales: forecast,
      achieveNetSales: achieved,
      achievementPercentage: calculateAchievement(forecast, achieved),
      isTotal: true,
    };
  }, [data, calculateAchievement]);

  // Calculate grand total
  const calculateGrandTotal = useCallback((): SalesTargetRow => {
    const totals = zones.map((zone) => calculateZoneTotal(zone));
    const forecast = totals.reduce(
      (sum, row) => sum + (row.decForecastNetSales || 0),
      0
    );
    const achieved = totals.reduce(
      (sum, row) => sum + (row.achieveNetSales || 0),
      0
    );
    return {
      zone: "Total",
      saleExecutive: "Total",
      decForecastNetSales: forecast,
      achieveNetSales: achieved,
      achievementPercentage: calculateAchievement(forecast, achieved),
      isGrandTotal: true,
    };
  }, [zones, calculateZoneTotal, calculateAchievement]);

  // Build display data with totals
  const displayData = useMemo(() => {
    const result: SalesTargetRow[] = [];
    const processedIds = new Set<string>();

    zones.forEach((zone) => {
      // Add zone rows
      const zoneRows = data.filter(
        (row) =>
          row.zone === zone &&
          !row.isTotal &&
          !row.isGrandTotal &&
          !processedIds.has(row.id || "")
      );
      zoneRows.forEach((row) => {
        result.push(row);
        if (row.id) processedIds.add(row.id);
      });

      // Add zone total
      const zoneTotal = calculateZoneTotal(zone);
      result.push(zoneTotal);
    });

    // Add grand total
    result.push(calculateGrandTotal());

    return result;
  }, [data, zones, calculateZoneTotal, calculateGrandTotal]);

  // Handle cell edit
  const handleCellEdit = (
    record: SalesTargetRow,
    field: "decForecastNetSales" | "achieveNetSales",
    value: number | null
  ) => {
    const newData = data.map((row) => {
      if (row.id === record.id) {
        const updated = {
          ...row,
          [field]: value || 0,
        };
        updated.achievementPercentage = calculateAchievement(
          updated.decForecastNetSales,
          updated.achieveNetSales
        );
        return updated;
      }
      return row;
    });
    setData(newData);
    setHasChanges(true);
  };

  // Add new row
  const handleAddRow = (zone: ZoneType) => {
    const tempId = `new-${Date.now()}`;
    const month = selectedMonth.month() + 1;
    const year = selectedMonth.year();
    const newRow: SalesTargetRow = {
      id: tempId,
      zone,
      saleExecutive: "",
      saleExecutiveId: "",
      decForecastNetSales: 0,
      achieveNetSales: 0,
      achievementPercentage: 0,
      order: data.filter((r) => r.zone === zone && !r.isTotal).length,
      month,
      year,
    };
    setData([...data, newRow]);
    setEditingKey(tempId);
    setHasChanges(true);
  };

  // Delete row
  const handleDeleteRow = async (record: SalesTargetRow) => {
    if (!record.id || !outletId) return;

    // If it's a new row (temp id), just remove from local state
    if (record.id.startsWith("new-")) {
      setData(data.filter((row) => row.id !== record.id));
      setHasChanges(true);
      return;
    }

    try {
      await employeeTargetApi.delete(outletId, record.id);
      setData((current) => current.filter((row) => row.id !== record.id));
      messageApi.success("Row deleted successfully");
    } catch (error) {
      console.error("Delete error:", error);
      messageApi.error("Failed to delete row");
    }
  };

  // Save all changes
  const handleSaveAll = async () => {
    if (!outletId) {
      messageApi.error("Outlet not selected");
      return;
    }

    setSaving(true);
    try {
      const month = selectedMonth.month() + 1;
      const year = selectedMonth.year();

      const items = data
        .filter((row) => !row.isTotal && !row.isGrandTotal)
        .map((row) => ({
          ...(row.id && !row.id.startsWith("new-") ? { id: row.id } : {}),
          zone: row.zone as ZoneType,
          saleExecutive: row.saleExecutive,
          ...(row.saleExecutiveId ? { saleExecutiveId: row.saleExecutiveId } : {}),
          decForecastNetSales: row.decForecastNetSales || 0,
          achieveNetSales: row.achieveNetSales || 0,
          order: row.order ?? 0,
        }));
      const saved = await employeeTargetApi.sync(outletId, month, year, items);
      setData(saved);
      messageApi.success("Data saved successfully!");
      setHasChanges(false);
      setEditingKey(null);
    } catch (error) {
      console.error("Save error:", error);
      messageApi.error("Failed to save data");
    } finally {
      setSaving(false);
    }
  };

  // Initialize default data if empty for current month
  const handleInitializeData = async () => {
    if (!outletId) return;

    setLoading(true);
    try {
      const month = selectedMonth.month() + 1;
      const year = selectedMonth.year();

      const existingData = await employeeTargetApi.list(outletId, month, year);

      if (existingData.length > 0) {
        messageApi.info("Data already exists for this month");
        setLoading(false);
        return;
      }

      // Initialize with first sales executive from each zone if available
      const initialRows: SalesTargetRow[] = [];
      let order = 0;

      zones.forEach((zone) => {
        // Add "Sale from HO" and "New Dealer" as special entries
        if (zone !== "Subscriptions") {
          initialRows.push({
            zone,
            saleExecutive: "Sale from HO",
            decForecastNetSales: 0,
            achieveNetSales: 0,
            achievementPercentage: 0,
            order: order++,
            month,
            year,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          initialRows.push({
            zone,
            saleExecutive: "New Dealer",
            decForecastNetSales: 0,
            achieveNetSales: 0,
            achievementPercentage: 0,
            order: order++,
            month,
            year,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
      });

      const initialized = await employeeTargetApi.sync(
        outletId,
        month,
        year,
        initialRows.map((row) => ({
          zone: row.zone as ZoneType,
          saleExecutive: row.saleExecutive,
          decForecastNetSales: row.decForecastNetSales,
          achieveNetSales: row.achieveNetSales,
          order: row.order ?? 0,
        })),
      );
      setData(initialized);
      messageApi.success("Default data initialized for this month!");
    } catch (error) {
      console.error("Initialize error:", error);
      messageApi.error("Failed to initialize data");
    } finally {
      setLoading(false);
    }
  };

  // Set Target via prompt modal
  const handleSetTargetSubmit = async () => {
    if (!outletId) return;
    try {
      const values = await setTargetForm.validateFields();
      setSetTargetSaving(true);

      const month = selectedMonth.month() + 1;
      const year = selectedMonth.year();
      const isSpecial = values.employeeId === "Sale from HO" || values.employeeId === "New Dealer";
      const selectedEmp = salesExecutives.find((e) => e.value === values.employeeId);

      const existing = data.find(
        (r) =>
          !r.isTotal &&
          !r.isGrandTotal &&
          r.zone === values.zone &&
          (isSpecial
            ? r.saleExecutive === values.employeeId
            : r.saleExecutiveId === values.employeeId),
      );

      let updatedData: SalesTargetRow[];
      if (existing) {
        // Update forecast on the existing row
        updatedData = data.map((r) =>
          r.id === existing.id
            ? {
                ...r,
                decForecastNetSales: values.forecastNetSales,
                achievementPercentage: calculateAchievement(
                  values.forecastNetSales,
                  r.achieveNetSales,
                ),
              }
            : r,
        );
      } else {
        // Create a new row
        const newRow: SalesTargetRow = {
          id: `new-${Date.now()}`,
          zone: values.zone,
          saleExecutive: selectedEmp?.userName ?? values.employeeId,
          ...(!isSpecial && selectedEmp ? { saleExecutiveId: selectedEmp.value } : {}),
          decForecastNetSales: values.forecastNetSales,
          achieveNetSales: 0,
          achievementPercentage: 0,
          order: data.filter((r) => r.zone === values.zone && !r.isTotal).length,
          month,
          year,
        };
        updatedData = [...data, newRow];
      }

      // Persist immediately
      const items = updatedData
        .filter((r) => !r.isTotal && !r.isGrandTotal)
        .map((r) => ({
          ...(r.id && !r.id.startsWith("new-") ? { id: r.id } : {}),
          zone: r.zone as ZoneType,
          saleExecutive: r.saleExecutive,
          ...(r.saleExecutiveId ? { saleExecutiveId: r.saleExecutiveId } : {}),
          decForecastNetSales: r.decForecastNetSales ?? 0,
          achieveNetSales: r.achieveNetSales ?? 0,
          order: r.order ?? 0,
        }));
      const saved = await employeeTargetApi.sync(outletId, month, year, items);
      setData(saved);
      setHasChanges(false);
      messageApi.success(`Target set for ${selectedEmp?.label ?? values.employeeId}`);
      setSetTargetOpen(false);
      setTargetForm.resetFields();
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return; // validation
      console.error("Set target error:", err);
      messageApi.error("Failed to set target");
    } finally {
      setSetTargetSaving(false);
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    if (displayData.length === 0) {
      messageApi.warning("No data to export");
      return;
    }

    const monthName = selectedMonth.format("MMMM YYYY");
    const fileName = `Employee_Sales_Targeting_${selectedMonth.format(
      "MM_YYYY"
    )}.pdf`;

    // Create PDF in landscape mode for better table fit
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(10, 55, 80); // Brand navy
    doc.text("Employee Sales Target Vs. Actual Report", 40, 30);

    // Month and date
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(`Month: ${monthName}`, 40, 50);
    doc.text(`Generated: ${dayjs().format("DD MMM YYYY HH:mm A")}`, 40, 65);

    // Prepare table data
    const head = [
      "Zone",
      "Sale Executive",
      "Forecast Net Sales",
      "Achieve Net Sales",
      "Achievement Percentage",
    ];

    const body = displayData.map((row) => {
      const forecast = row.decForecastNetSales || 0;
      const achieved = row.achieveNetSales || 0;
      const percentage = row.achievementPercentage || 0;

      return [
        row.zone || "",
        row.saleExecutive || "",
        `${formatIndianAmount(forecast)}`,
        `${formatIndianAmount(achieved)}`,
        `${percentage}%`,
      ];
    });

    // Column widths (landscape A4: ~780pt width, minus margins 80pt = 700pt available)
    const columnWidths = [110, 180, 150, 150, 110];

    // Generate table with custom styling
    autoTable(doc, {
      head: [head],
      body,
      startY: 80,
      margin: { left: 40, right: 40, top: 80, bottom: 40 },
      styles: {
        fontSize: 9,
        cellPadding: 4,
        overflow: "linebreak",
        lineColor: [0, 0, 0],
        lineWidth: 0.5,
        textColor: [0, 0, 0],
        halign: "left",
      },
      headStyles: {
        fillColor: [10, 55, 80], // Brand navy header
        textColor: [255, 255, 255], // White text
        fontStyle: "bold",
        halign: "center",
        fontSize: 10,
      },
      columnStyles: {
        0: { halign: "left", cellWidth: columnWidths[0] },
        1: { halign: "left", cellWidth: columnWidths[1] },
        2: { halign: "right", cellWidth: columnWidths[2] },
        3: { halign: "right", cellWidth: columnWidths[3] },
        4: { halign: "center", cellWidth: columnWidths[4] },
      },
      didParseCell: (data: CellHookData) => {
        const row = displayData[data.row.index];
        if (!row) return;

        // Style total rows with a soft navy tint
        if (row.isTotal || row.isGrandTotal) {
          data.cell.styles.fillColor = [230, 238, 242]; // Light navy tint
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.textColor = [10, 55, 80]; // Navy text
        }

        // Style grand total with a stronger navy tint
        if (row.isGrandTotal) {
          data.cell.styles.fillColor = [204, 220, 229]; // Darker navy tint
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawCell: (data: CellHookData) => {
        // Add border styling
        if (data.section === "body") {
          const row = displayData[data.row.index];
          if (row?.isTotal || row?.isGrandTotal) {
            // Ensure borders are visible
            doc.setDrawColor(10, 55, 80);
            doc.setLineWidth(0.5);
          }
        }
      },
    });

    // Add summary statistics at the bottom
    const finalY = ((doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? 80) + 20;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Summary Statistics", 40, finalY);

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Total Forecast: ${formatIndianAmount(summaryStats.totalForecast)}`,
      40,
      finalY + 20
    );
    doc.text(
      `Total Achieved: ${formatIndianAmount(summaryStats.totalAchieved)}`,
      40,
      finalY + 35
    );
    doc.text(
      `Overall Achievement: ${summaryStats.overallPercentage}%`,
      40,
      finalY + 50
    );

    // Save PDF
    doc.save(fileName);
    messageApi.success("PDF exported successfully!");
  };

  // Table columns
  const columns: ColumnsType<SalesTargetRow> = [
    {
      title: "Zone",
      dataIndex: "zone",
      key: "zone",
      width: 150,
      render: (text: string, record: SalesTargetRow) => {
        if (record.isTotal || record.isGrandTotal) {
          return (
            <Text strong style={{ color: BRAND_NAVY }}>
              {text}
            </Text>
          );
        }
        return text;
      },
      onCell: (record: SalesTargetRow) => ({
        style: {
          backgroundColor:
            record.isTotal || record.isGrandTotal ? "rgba(10,55,80,0.06)" : undefined,
        },
      }),
    },
    {
      title: "Sale Executive",
      dataIndex: "saleExecutive",
      key: "saleExecutive",
      width: 200,
      render: (text: string, record: SalesTargetRow) => {
        if (record.isTotal || record.isGrandTotal) {
          return (
            <Text strong style={{ color: BRAND_NAVY }}>
              {text}
            </Text>
          );
        }
        // Show select dropdown for sales executives
        const currentValue = record.saleExecutiveId || record.saleExecutive;

        return (
          <Can permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_EDIT}>
            <Select
              style={{ width: "100%" }}
              value={currentValue}
              onChange={(value) => {
                const isSpecialEntry =
                  value === "Sale from HO" || value === "New Dealer";
                const selectedEmp = salesExecutives.find(
                  (emp) => emp.value === value
                );
                const newData = data.map((row) => {
                  if (row.id === record.id) {
                    // Build updated row - exclude saleExecutiveId for special entries
                    const baseRow = {
                      ...row,
                      saleExecutive: selectedEmp?.userName || value,
                    };

                    if (isSpecialEntry) {
                      // For special entries, exclude saleExecutiveId
                      const rowWithoutId = { ...baseRow };
                      delete rowWithoutId.saleExecutiveId;
                      return rowWithoutId;
                    } else {
                      // For regular employees, include saleExecutiveId
                      return {
                        ...baseRow,
                        saleExecutiveId: selectedEmp?.value || value,
                      };
                    }
                  }
                  return row;
                });
                setData(newData);
                setHasChanges(true);
              }}
              placeholder="Select employee"
              showSearch
              optionFilterProp="label"
              allowClear
              options={[
                ...salesExecutives,
                { label: "Sale from HO", value: "Sale from HO" },
                { label: "New Dealer", value: "New Dealer" },
              ]}
            />
          </Can>
        );
      },
      onCell: (record: SalesTargetRow) => ({
        style: {
          backgroundColor:
            record.isTotal || record.isGrandTotal ? "rgba(10,55,80,0.06)" : undefined,
        },
      }),
    },
    {
      title: "Forecast Net Sales",
      dataIndex: "decForecastNetSales",
      key: "decForecastNetSales",
      width: 200,
      align: "right" as const,
      render: (value: number, record: SalesTargetRow) => {
        if (record.isTotal || record.isGrandTotal) {
          return (
            <Text strong style={{ color: BRAND_NAVY }}>
              ₹{value?.toLocaleString("en-IN") || 0}
            </Text>
          );
        }
        return (
          <Can permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_EDIT}>
            <InputNumber
              style={{ width: "100%" }}
              value={value}
              onChange={(val) =>
                handleCellEdit(record, "decForecastNetSales", val)
              }
              formatter={(value) =>
                `₹ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
              }
              parser={(value) => Number(value!.replace(/₹\s?|(,*)/g, "")) || 0}
              min={0}
              precision={0}
            />
          </Can>
        );
      },
      onCell: (record: SalesTargetRow) => ({
        style: {
          backgroundColor:
            record.isTotal || record.isGrandTotal ? "rgba(10,55,80,0.06)" : undefined,
        },
      }),
    },
    {
      title: "Achieve Net Sales",
      dataIndex: "achieveNetSales",
      key: "achieveNetSales",
      width: 200,
      align: "right" as const,
      render: (value: number, record: SalesTargetRow) => {
        if (record.isTotal || record.isGrandTotal) {
          return (
            <Text strong style={{ color: BRAND_NAVY }}>
              ₹{value?.toLocaleString("en-IN") || 0}
            </Text>
          );
        }
        return (
          <Can permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_EDIT}>
            <InputNumber
              style={{ width: "100%" }}
              value={value}
              onChange={(val) => handleCellEdit(record, "achieveNetSales", val)}
              formatter={(value) =>
                `₹ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
              }
              parser={(value) => Number(value!.replace(/₹\s?|(,*)/g, "")) || 0}
              min={0}
              precision={0}
            />
          </Can>
        );
      },
      onCell: (record: SalesTargetRow) => ({
        style: {
          backgroundColor:
            record.isTotal || record.isGrandTotal ? "rgba(10,55,80,0.06)" : undefined,
        },
      }),
    },
    {
      title: "Achievement Percentage",
      dataIndex: "achievementPercentage",
      key: "achievementPercentage",
      width: 180,
      align: "center" as const,
      render: (value: number) => {
        const percentage = value || 0;
        let color = "default";
        if (percentage >= 100) color = "success";
        else if (percentage >= 50) color = "warning";
        else color = "error";

        return (
          <Tag color={color} style={{ fontSize: "14px", padding: "4px 12px" }}>
            {percentage}%
          </Tag>
        );
      },
      onCell: (record: SalesTargetRow) => ({
        style: {
          backgroundColor:
            record.isTotal || record.isGrandTotal ? "rgba(10,55,80,0.06)" : undefined,
        },
      }),
    },
    {
      title: "Actions",
      key: "actions",
      width: 120,
      render: (_: unknown, record: SalesTargetRow) => {
        if (record.isTotal || record.isGrandTotal) return null;

        return (
          <Can permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_DELETE}>
            <Space>
              <Popconfirm
                title="Are you sure you want to delete this row?"
                onConfirm={() => handleDeleteRow(record)}
                okText="Yes"
                cancelText="No"
              >
                <Tooltip title="Delete">
                  <Button
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    type="text"
                  />
                </Tooltip>
              </Popconfirm>
            </Space>
          </Can>
        );
      },
      onCell: (record: SalesTargetRow) => ({
        style: {
          backgroundColor:
            record.isTotal || record.isGrandTotal ? "rgba(10,55,80,0.06)" : undefined,
        },
      }),
    },
  ];

  // Summary statistics
  const summaryStats = useMemo(() => {
    const grandTotal = calculateGrandTotal();
    return {
      totalForecast: grandTotal.decForecastNetSales,
      totalAchieved: grandTotal.achieveNetSales,
      overallPercentage: grandTotal.achievementPercentage,
    };
  }, [calculateGrandTotal]);

  const summaryCards = [
    {
      key: "forecast",
      label: "Total Forecast",
      value: `₹${summaryStats.totalForecast.toLocaleString("en-IN")}`,
      accent: BRAND_NAVY,
      icon: <Target size={20} />,
    },
    {
      key: "achieved",
      label: "Total Achieved",
      value: `₹${summaryStats.totalAchieved.toLocaleString("en-IN")}`,
      accent: BRAND_PURPLE,
      icon: <TrendingUp size={20} />,
    },
    {
      key: "achievement",
      label: "Overall Achievement",
      value: `${summaryStats.overallPercentage}%`,
      accent: BRAND_RED,
      icon: <Percent size={20} />,
    },
  ];

  if (!outletId) {
    return (
      <Card>
        <Text type="warning">Please select an outlet first.</Text>
      </Card>
    );
  }

  // Check VIEW permission
  if (!hasPermission(PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_VIEW)) {
    return (
      <Card>
        <Text type="danger">You don't have permission to view this page.</Text>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div
        className="mb-5 overflow-hidden rounded-xl shadow-sm"
        style={{ background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #124a6b 100%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <AimOutlined style={{ color: BRAND_RED, fontSize: 18 }} />
            </div>
            <div>
              <Title level={2} className="!mb-1 !text-white">
                Employee Sales Target Vs. Actual
              </Title>
              <Text className="text-slate-200 !text-white">
                Manage and track sales targets by zone and executive
              </Text>
            </div>
          </div>

          <Space wrap>
            {data.length === 0 && (
              <Can permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_CREATE}>
                <Button icon={<ReloadOutlined />} onClick={handleInitializeData} loading={loading}>
                  Initialize Default Data
                </Button>
              </Can>
            )}
            <Can permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_CREATE}>
              <Button
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  setTargetForm.resetFields();
                  setSetTargetOpen(true);
                }}
                style={{ backgroundColor: "#7c3aed", borderColor: "#7c3aed", color: "#fff" }}
              >
                Set Target
              </Button>
            </Can>
            <Button
              icon={<FilePdfOutlined />}
              onClick={handleExportPDF}
              style={{ backgroundColor: BRAND_RED, borderColor: BRAND_RED, color: "#fff" }}
            >
              Export PDF
            </Button>
            <Can permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_EDIT}>
              <Button
                icon={<SaveOutlined />}
                onClick={handleSaveAll}
                loading={saving}
                disabled={!hasChanges}
                style={{
                  color: "#fff",
                  ...(hasChanges
                    ? { backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY }
                    : {}),
                }}
              >
                Save All Changes
              </Button>
            </Can>
          </Space>
        </div>
      </div>

      {/* Month Picker */}
      <Card className="!rounded-xl border-0 shadow-sm mb-5" styles={{ body: { padding: 16 } }}>
        <Space wrap>
          <Text strong>Select Month:</Text>
          <DatePicker.MonthPicker
            allowClear={false}
            value={selectedMonth}
            onChange={(date) => {
              if (date) {
                setSelectedMonth(date);
                setHasChanges(false); // Reset changes when month changes
                setEditingKey(null); // Clear any editing state
              }
            }}
            style={{ width: 200 }}
            suffixIcon={<CalendarOutlined />}
            format="MMMM YYYY"
            disabledDate={(current) => current && current.isAfter(dayjs(), "month")}
          />
          <Text type="secondary">Viewing data for {selectedMonth.format("MMMM YYYY")}</Text>
        </Space>
      </Card>

      {/* Summary Cards */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => (
          <Card
            key={card.key}
            size="small"
            className="!rounded-xl border-0 shadow-sm"
            style={{ borderLeft: `4px solid ${card.accent}` }}
            styles={{ body: { padding: 16 } }}
          >
            <div className="flex items-center justify-between">
              <div>
                <Text type="secondary" className="text-[12.5px] font-medium uppercase tracking-wide">
                  {card.label}
                </Text>
                <div className="mt-1 text-2xl font-semibold" style={{ color: card.accent }}>
                  {card.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${card.accent}14`, color: card.accent }}
              >
                {card.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main Table */}
      <Card className="!rounded-xl border-0 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Title level={4} style={{ margin: 0, color: BRAND_NAVY }}>
            Zone-wise Sales Targets
          </Title>
          <Can permission={PERMISSION_MASTER.CRM_EMPLOYEE_TARGET_CREATE}>
            <div className="flex flex-wrap gap-2">
              {zones.map((zone) => (
                <Button key={zone} icon={<PlusOutlined />} onClick={() => handleAddRow(zone)} size="small">
                  Add to {zone}
                </Button>
              ))}
            </div>
          </Can>
        </div>

        <Table
          columns={columns}
          dataSource={displayData}
          rowKey={(record, index) =>
            record.id || `${record.zone}-${record.saleExecutive}-${index}`
          }
          loading={loading}
          pagination={false}
          bordered
          size="middle"
          scroll={{ x: "max-content" }}
          style={{ borderRadius: "8px", overflow: "hidden" }}
          components={{
            header: {
              cell: (props: React.ThHTMLAttributes<HTMLTableCellElement>) => (
                <th
                  {...props}
                  style={{
                    ...props.style,
                    backgroundColor: BRAND_NAVY,
                    color: "white",
                    fontWeight: "bold",
                    textAlign: "center",
                  }}
                />
              ),
            },
          }}
          rowClassName={(record) => {
            if (record.isGrandTotal) return "grand-total-row";
            if (record.isTotal) return "total-row";
            return "";
          }}
        />

        {/* Footer Info */}
        <div style={{ marginTop: "16px", textAlign: "center" }}>
          <Text type="secondary" style={{ fontSize: "12px" }}>
            <CalculatorOutlined /> Achievement percentage is calculated automatically.
          </Text>
        </div>
      </Card>

      {/* Set Target Modal */}
      <Modal
        title={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ThunderboltOutlined style={{ color: BRAND_PURPLE, fontSize: 18 }} />
            <span>Set Employee Target</span>
          </div>
        }
        open={setTargetOpen}
        onCancel={() => {
          setSetTargetOpen(false);
          setTargetForm.resetFields();
        }}
        onOk={() => void handleSetTargetSubmit()}
        okText="Set Target"
        okButtonProps={{
          loading: setTargetSaving,
          style: { backgroundColor: BRAND_PURPLE, borderColor: BRAND_PURPLE },
        }}
        width={480}
        destroyOnClose
      >
        <div style={{ marginBottom: 12, color: "#64748b", fontSize: 13 }}>
          Setting a target for <strong>{selectedMonth.format("MMMM YYYY")}</strong>.
          If the employee already has a target this month, it will be updated.
        </div>
        <Form form={setTargetForm} layout="vertical" requiredMark={false}>
          <Form.Item
            label="Zone"
            name="zone"
            rules={[{ required: true, message: "Select a zone" }]}
          >
            <Select placeholder="Select zone" options={zones.map((z) => ({ label: z, value: z }))} />
          </Form.Item>

          <Form.Item
            label="Employee"
            name="employeeId"
            rules={[{ required: true, message: "Select an employee" }]}
          >
            <Select
              placeholder="Select employee"
              showSearch
              optionFilterProp="label"
              options={[
                ...salesExecutives,
                { label: "Sale from HO", value: "Sale from HO" },
                { label: "New Dealer", value: "New Dealer" },
              ]}
            />
          </Form.Item>

          <Form.Item
            label="Forecast Net Sales (Target ₹)"
            name="forecastNetSales"
            rules={[
              { required: true, message: "Enter target amount" },
              { type: "number", min: 1, message: "Target must be greater than 0" },
            ]}
          >
            <InputNumber
              style={{ width: "100%" }}
              placeholder="e.g. 500000"
              formatter={(v) => `₹ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
              parser={(v) => (Number(v?.replace(/₹\s?|(,*)/g, "")) || 0) as unknown as 1}
              min={1}
              precision={0}
            />
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .total-row {
          background-color: rgba(10, 55, 80, 0.06) !important;
          font-weight: 600;
        }
        .grand-total-row {
          background-color: rgba(10, 55, 80, 0.12) !important;
          font-weight: 700;
        }
        .ant-table-tbody > tr.total-row:hover > td,
        .ant-table-tbody > tr.grand-total-row:hover > td {
          background-color: inherit !important;
        }
      `}</style>
    </div>
  );
};

export default EmployeeTargeting;