import { useCallback, useEffect, useState } from "react";
import {
  Card,
  Row,
  Col,
  Input,
  Select,
  DatePicker,
  Button,
  Tag,
  Space,
  Modal,
  Descriptions,
  Popconfirm,
  Tooltip,
} from "antd";
import {
  SearchOutlined,
  DownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  TeamOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { Fingerprint, Smartphone } from "lucide-react";
import {
  APP_MESSAGES,
  PERMISSION_MASTER,
} from "@/shared/lib/constants";
import type { AttendanceRecord } from "../types/types";
import type { LeaveApplication, HolidayDTO } from "@/features/leave";
import type { SalaryMaster } from "@/features/payroll";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { attendanceApi } from "../api/attendanceApi";
import dayjs, { Dayjs } from "dayjs";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
import { useMessageApi } from "@/shared/hooks";
import { mapAntdToExportColumns } from "@/shared/lib/mapAntdColumns";
import fileExport from "@/shared/utils/fileExport";
import SpinLoader from "@/shared/components/SpinLoader";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { Can } from "@/features/access-control";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CellHookData, Styles } from "jspdf-autotable";
import { ExcelJS, saveWorkbookAsXlsx } from "@/shared/utils/excelWorkbook";
type AttendanceStatus = "PRESENT" | "ON_LEAVE" | "ABSENT";
type FilterStatus = AttendanceStatus | "all";
type TableCellValue = string | number | boolean | null;
type TableRow = TableCellValue[];
type AutoTableColumnStyles = Record<number, Partial<Styles>>;

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

const formatAttendanceDeviceLabel = (value?: unknown) => {
  if (value === null || value === undefined) return "";
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return "";

  if (normalized === "BIOMETRIC" || normalized === "BIO") {
    return "BIOMETRIC";
  }

  if (normalized === "MOBILE") {
    return "MOBILE";
  }

  const label = normalized.replace(/[^A-Z0-9]+/g, " ");

  if (
    label.includes("BIOMETRIC") ||
    label.includes("BIOMAT") ||
    label.includes("BIOMATRIC") ||
    label.includes("BIOMAX") ||
    label.includes("FINGERPRINT") ||
    label.includes("FINGER PRINT") ||
    label === "FP"
  ) {
    return "BIOMETRIC";
  }

  if (
    label.includes("MOBILE") ||
    label.includes("ANDROID") ||
    label.includes("IOS") ||
    label.includes("IPHONE") ||
    label.includes("PHONE")
  ) {
    return "MOBILE";
  }

  return "";
};

const readRecordField = (record: AttendanceRecord, keys: string[]) => {
  const data = record as AttendanceRecord & Record<string, unknown>;
  const wanted = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, value] of Object.entries(data)) {
    if (
      wanted.has(key.toLowerCase()) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  for (const key of keys) {
    const value = data[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
};

const isRecordLike = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const readNestedRecordField = (value: unknown, keys: string[]): unknown => {
  if (!isRecordLike(value)) return undefined;

  const wanted = new Set(keys.map((key) => key.toLowerCase()));

  for (const [key, item] of Object.entries(value)) {
    if (
      wanted.has(key.toLowerCase()) &&
      item !== null &&
      item !== undefined &&
      String(item).trim() !== ""
    ) {
      return item;
    }
  }

  for (const item of Object.values(value)) {
    const nestedValue = readNestedRecordField(item, keys);
    if (nestedValue !== undefined) {
      return nestedValue;
    }
  }

  return undefined;
};

const readAttendanceRecordField = (record: AttendanceRecord, keys: string[]) =>
  readRecordField(record, keys) ?? readNestedRecordField(record, keys);

const readRecordValues = (record: AttendanceRecord, keys: string[]) =>
  keys
    .map((key) => readAttendanceRecordField(record, [key]))
    .filter(
      (value) => value !== null && value !== undefined && String(value).trim() !== ""
    );

const hasRecordValue = (record: AttendanceRecord, keys: string[]) =>
  Boolean(readAttendanceRecordField(record, keys));

const deviceValueKeys = [
  "device",
  "deviceType",
  "type",
  "source",
  "value",
  "label",
  "name",
];

const getPunchDeviceLabel = (
  value: unknown
): "BIOMETRIC" | "MOBILE" | "" => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedLabel = getPunchDeviceLabel(item);
      if (nestedLabel) return nestedLabel;
    }

    return "";
  }

  if (isRecordLike(value)) {
    const wanted = new Set(deviceValueKeys.map((key) => key.toLowerCase()));

    for (const [key, item] of Object.entries(value)) {
      if (wanted.has(key.toLowerCase())) {
        const nestedLabel = getPunchDeviceLabel(item);
        if (nestedLabel) return nestedLabel;
      }
    }

    for (const item of Object.values(value)) {
      const nestedLabel = getPunchDeviceLabel(item);
      if (nestedLabel) return nestedLabel;
    }

    return "";
  }

  const label = formatAttendanceDeviceLabel(value);
  return label === "BIOMETRIC" || label === "MOBILE" ? label : "";
};

const getAttendanceDevice = (
  record: AttendanceRecord,
  type: "in" | "out"
): "BIOMETRIC" | "MOBILE" | "-" => {
  const time = type === "in" ? record.checkInTime : record.checkOutTime;

  if (!time || time === 0) return "-";

  const deviceLabel = getPunchDeviceLabel(readAttendanceRecordField(record, ["device"]));
  if (deviceLabel) {
    return deviceLabel;
  }

  const typeTxnKeys =
    type === "in"
      ? [
          "txnInId",
          "txn_in_id",
          "checkInTxnId",
          "checkInTransactionId",
          "inTxnId",
          "inTransactionId",
          "checkInPunchId",
          "inPunchId",
        ]
      : [
          "txnOutId",
          "txn_out_id",
          "checkOutTxnId",
          "checkOutTransactionId",
          "outTxnId",
          "outTransactionId",
          "checkOutPunchId",
          "outPunchId",
        ];
  const typeSourceKeys =
    type === "in"
      ? [
          "checkInSource",
          "checkInDevice",
          "checkInDeviceType",
          "inSource",
          "inDevice",
          "inDeviceType",
        ]
      : [
          "checkOutSource",
          "checkOutDevice",
          "checkOutDeviceType",
          "outSource",
          "outDevice",
          "outDeviceType",
        ];
  const sharedSourceKeys = [
    "source",
    "punchSource",
    "attendanceSource",
    "deviceType",
  ];
  const biometricProofKeys = [
    "dvcId",
    "dvcID",
    "dvc_id",
    "dvcIP",
    "dvc_ip",
    "punchId",
    "punch_id",
    "txnId",
    "txn_id",
    "transactionId",
    "transaction_id",
  ];

  // Strongest signal: biometric transaction id for this punch direction.
  if (readRecordField(record, typeTxnKeys)) {
    return "BIOMETRIC";
  }

  const typeLabels = readRecordValues(record, typeSourceKeys).map((value) =>
    getPunchDeviceLabel(value)
  );
  const sharedLabels = readRecordValues(record, sharedSourceKeys).map((value) =>
    getPunchDeviceLabel(value)
  );
  const hasTypeLabel = typeLabels.some(Boolean);

  if (typeLabels.includes("BIOMETRIC")) {
    return "BIOMETRIC";
  }

  if (typeLabels.includes("MOBILE")) {
    return "MOBILE";
  }

  // Biometric proof wins over generic mobile defaults saved on the record.
  if (
    !hasTypeLabel &&
    (sharedLabels.includes("BIOMETRIC") ||
      deviceLabel === "BIOMETRIC" ||
      hasRecordValue(record, biometricProofKeys))
  ) {
    return "BIOMETRIC";
  }

  for (const label of sharedLabels) {
    if (label) {
      return label;
    }
  }

  return "-";
};

const renderAttendanceDeviceIcon = (device: string) => {
  if (device === "BIOMETRIC") {
    return (
      <Tooltip title="BIOMETRIC">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
          <Fingerprint size={14} />
        </span>
      </Tooltip>
    );
  }

  if (device === "MOBILE") {
    return (
      <Tooltip title="MOBILE">
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          <Smartphone size={14} />
        </span>
      </Tooltip>
    );
  }

  return null;
};

const renderAttendanceDeviceLabel = (device: string) => {
  if (device === "BIOMETRIC") return "BIOMETRIC";
  if (device === "MOBILE") return "MOBILE";
  return "-";
};

const renderAttendanceDeviceCell = (device: string) => {
  if (device === "-") {
    return <span className="text-slate-400">-</span>;
  }

  return (
    <div className="inline-flex items-center gap-2 whitespace-nowrap">
      {renderAttendanceDeviceIcon(device)}
      <span className="text-slate-700">{renderAttendanceDeviceLabel(device)}</span>
    </div>
  );
};

const AttendanceRecords = () => {
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(
    null
  );
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs()); // default: today
  const [loading, setLoading] = useState(true);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [isMonthlyModalVisible, setIsMonthlyModalVisible] = useState(false);
  const [monthlyReportMonth, setMonthlyReportMonth] = useState<Dayjs>(dayjs());
  const [tablePage, setTablePage] = useState(1);
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );
  const messageApi = useMessageApi();
  const loadDailyAttendance = useCallback(
    async (signal?: AbortSignal) => {
      if (!outletId) {
        setAttendance([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const result = await attendanceApi.getDaily(
          {
            outletId,
            date: selectedDate.startOf("day").valueOf(),
          },
          signal
        );

        setAttendance(result.items);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        console.error(error);
        messageApi.error(APP_MESSAGES.ERROR_FETCH);
        setAttendance([]);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [outletId, selectedDate, messageApi]
  );

  useEffect(() => {
    const abortController = new AbortController();
    void loadDailyAttendance(abortController.signal);

    return () => abortController.abort();
  }, [loadDailyAttendance]);

  const filteredData = attendance.filter((record: AttendanceRecord) => {
    // Normalize search text
    const search = searchText.toLowerCase().trim();

    // Match against userName OR empCode (if available)
    const matchesSearch =
      !search ||
      record?.userName?.toLowerCase()?.includes(search) ||
      record?.empCode?.toLowerCase()?.includes(search);

    // Status filter
    const matchesStatus =
      filterStatus === "all" || record?.attendanceStatus === filterStatus;

    return matchesSearch && matchesStatus;
  });
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safeTablePage = Math.min(tablePage, totalPages);
  const pagedAttendance = filteredData.slice(
    (safeTablePage - 1) * pageSize,
    safeTablePage * pageSize
  );

  const exportPDF = () => {
    const exportColumns = mapAntdToExportColumns(columns);
    fileExport.exportToPDF(attendance, exportColumns, "Attendance_Report.pdf");
  };

  type MonthlyAttendanceRow = {
    empCode: string;
    userName: string;
    [key: string]: string | number; // Dynamic day columns
    totalDays: number;
    presentDays: number;
    absentDays: number;
  };

  const fetchMonthlyAttendanceData = async (month: Dayjs) => {
    if (!outletId) return { rows: [], days: [] };

    setMonthlyLoading(true);
    try {
      const monthStart = month.startOf("month");
      const monthEnd = month.endOf("month");

      const monthlyData = await attendanceApi.getMonthly({
        outletId,
        month: month.format("YYYY-MM"),
      });
      const teamList = monthlyData.team;
      if (!teamList.length) {
        setMonthlyLoading(false);
        return { rows: [], days: [] };
      }

      const monthlyAttendance = monthlyData.attendance;
      const approvedLeavesForMonth = monthlyData.leaves;
      const allHolidays = monthlyData.holidays;
      
      // Create holiday map using dateString (YYYY-MM-DD format)
      const holidayMap = new Map<string, HolidayDTO>();
      allHolidays.forEach((holiday) => {
        if (holiday.dateString) {
          // Convert YYYY-MM-DD to DD-MM-YYYY for dayId format
          const [year, monthStr, day] = holiday.dateString.split("-");
          const dayId = `${day}-${monthStr}-${year}`;
          const holidayDate = dayjs(holiday.dateString);
          // Check if holiday falls within the selected month
          if (holidayDate.isSameOrAfter(monthStart, "day") && holidayDate.isSameOrBefore(monthEnd, "day")) {
            holidayMap.set(dayId, holiday);
          }
        } else if (typeof holiday.date === 'number') {
          // Fallback: use timestamp to create dayId
          const holidayDate = dayjs(holiday.date);
          if (holidayDate.isSameOrAfter(monthStart, "day") && holidayDate.isSameOrBefore(monthEnd, "day")) {
            const dayId = holidayDate.format("DD-MM-YYYY");
            holidayMap.set(dayId, holiday);
          }
        }
      });

      // Create lookup maps
      const attendanceMap = new Map<string, Map<string, AttendanceRecord>>();
      monthlyAttendance.forEach((a) => {
        if (!attendanceMap.has(a.userId)) {
          attendanceMap.set(a.userId, new Map());
        }
        attendanceMap.get(a.userId)!.set(a.dayId, a);
      });

      const leaveMap = new Map<string, LeaveApplication[]>();
      approvedLeavesForMonth.forEach((l) => {
        if (!leaveMap.has(l.userProfileId)) {
          leaveMap.set(l.userProfileId, []);
        }
        leaveMap.get(l.userProfileId)!.push(l);
      });

      // Get all days in month excluding Sundays
      const daysInMonth = month.daysInMonth();
      const workingDays: { day: number; date: Dayjs; dayId: string }[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const currentDay = month.date(day);
        // dayjs day() returns 0 for Sunday, 6 for Saturday
        if (currentDay.day() !== 0) {
          // Exclude Sunday
          workingDays.push({
            day,
            date: currentDay,
            dayId: currentDay.format("DD-MM-YYYY"),
          });
        }
      }

      // Generate employee-wise rows
      const rows: MonthlyAttendanceRow[] = [];

      teamList.forEach((user) => {
        const row: MonthlyAttendanceRow = {
          empCode: user.empCode ?? "NA",
          userName: user.userName ?? "NA",
          totalDays: workingDays.length,
          presentDays: 0,
          absentDays: 0,
        };

        workingDays.forEach(({ dayId, date }) => {
          const dayStart = date.startOf("day").valueOf();
          const dayEnd = date.endOf("day").valueOf();
          const dayKey = `day_${dayId}`;

          // Check for holiday first
          const holiday = holidayMap.get(dayId);
          if (holiday) {
            row[dayKey] = "H"; // Holiday
            // Don't increment presentDays or absentDays for holidays
          } else {
            // Check for attendance
            const userAttendance = attendanceMap.get(user.userProfileId)?.get(dayId);
            if (userAttendance) {
              row[dayKey] = "P"; // Present
              row.presentDays++;
            } else {
              // Check for leave
              const userLeaves = leaveMap.get(user.userProfileId);
              const leaveOnDay = userLeaves?.find(
                (l) => l.fromDate <= dayEnd && l.toDate >= dayStart
              );

              if (leaveOnDay) {
                row[dayKey] = "L"; // Leave
              } else {
                row[dayKey] = "A"; // Absent
                row.absentDays++;
              }
            }
          }
        });

        rows.push(row);
      });

      // Add summary row
      const totalDays = workingDays.length;
      const totalPresent = rows.reduce((sum, r) => sum + r.presentDays, 0);
      const totalAbsent = rows.reduce((sum, r) => sum + r.absentDays, 0);

      const summaryRow: MonthlyAttendanceRow = {
        empCode: "TOTAL",
        userName: "SUMMARY",
        totalDays,
        presentDays: totalPresent,
        absentDays: totalAbsent,
      };

      workingDays.forEach(({ dayId }) => {
        summaryRow[`day_${dayId}`] = "";
      });

      rows.push(summaryRow);

      setMonthlyLoading(false);
      return { rows, days: workingDays, holidays: holidayMap };
    } catch (error) {
      console.error("Error fetching monthly attendance:", error);
      messageApi.error("Failed to fetch monthly attendance data");
      setMonthlyLoading(false);
      return { rows: [], days: [], holidays: new Map() };
    }
  };

  const handleMonthlyReportClick = () => {
    setMonthlyReportMonth(dayjs());
    setIsMonthlyModalVisible(true);
  };

  const exportMonthlyPDF = async () => {
    if (!monthlyReportMonth) {
      messageApi.warning("Please select a month");
      return;
    }

    setIsMonthlyModalVisible(false);
    setMonthlyLoading(true);
    try {
      const { rows, days } = await fetchMonthlyAttendanceData(monthlyReportMonth);
      
      if (rows.length === 0) {
        messageApi.warning("No attendance data found for the selected month");
        setMonthlyLoading(false);
        return;
      }

      const monthName = monthlyReportMonth.format("MMMM YYYY");
      const fileName = `Monthly_Attendance_Report_${monthlyReportMonth.format("MM_YYYY")}.pdf`;

      // Create PDF with custom styling
      const doc = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "a4",
      });

      // Title
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text(`Monthly Attendance Report - ${monthName}`, 40, 30);

      // Prepare table data (removed Employee ID column to prevent overflow)
      const head = [
        "Employee Name",
        ...days.map(({ date }) => date.format("DD")),
        "Total Days",
        "Present",
        "Absent",
      ];

      const body = rows.map((row) => {
        const rowData: TableRow = [
          row.userName,
          ...days.map(({ dayId }) => row[`day_${dayId}`] || ""),
          row.totalDays,
          row.presentDays,
          row.absentDays,
        ];
        return rowData;
      });

      // Calculate column widths (without Employee ID column)
      const totalWidth = doc.internal.pageSize.getWidth() - 80; // 40pt margin on each side
      const empNameWidth = 150; // Increased width for employee name
      const dayColumnWidth = 18; // Slightly reduced width for each day column to fit better
      const summaryColWidth = 50; // Width for Total Days, Present, Absent
      const totalDayColumnsWidth = days.length * dayColumnWidth;
      const remainingWidth = totalWidth - empNameWidth - totalDayColumnsWidth - (3 * summaryColWidth);

      // Adjust employee name width if needed
      const finalEmpNameWidth = empNameWidth + (remainingWidth > 0 ? remainingWidth : 0);

      // Create column styles
      const columnStyles: AutoTableColumnStyles = {
        0: { cellWidth: finalEmpNameWidth, halign: "left" }, // Employee Name
      };

      // Day columns - center aligned, fixed width, no wrapping
      days.forEach((_, index) => {
        columnStyles[index + 1] = { 
          cellWidth: dayColumnWidth, 
          halign: "center",
          valign: "middle",
          cellPadding: 2,
          fontSize: 9,
        };
      });

      // Summary columns
      const summaryStartIndex = 1 + days.length;
      columnStyles[summaryStartIndex] = { 
        cellWidth: summaryColWidth, 
        halign: "center",
      }; // Total Days
      columnStyles[summaryStartIndex + 1] = { 
        cellWidth: summaryColWidth, 
        halign: "center",
      }; // Present
      columnStyles[summaryStartIndex + 2] = { 
        cellWidth: summaryColWidth, 
        halign: "center",
      }; // Absent

      // Calculate total table width
      const calculatedTableWidth = finalEmpNameWidth + totalDayColumnsWidth + (3 * summaryColWidth);
      
      // Generate table with borders and no text wrapping
      autoTable(doc, {
        head: [head],
        body,
        startY: 50,
        margin: { left: 40, right: 40, top: 50, bottom: 40 },
        tableWidth: calculatedTableWidth,
        styles: {
          fontSize: 8,
          cellPadding: 3,
          overflow: "linebreak", // Use linebreak but with proper cell widths to prevent wrapping
          lineColor: [0, 0, 0], // Black borders
          lineWidth: 0.5,
          textColor: [0, 0, 0],
          cellWidth: "wrap", // Will use columnStyles widths
        },
        headStyles: {
          fillColor: [24, 144, 255], // Blue header
          textColor: [255, 255, 255], // White text
          fontStyle: "bold",
          halign: "center",
          fontSize: 9,
          cellPadding: 4,
          lineColor: [0, 0, 0],
          lineWidth: 0.5,
        },
        bodyStyles: {
          valign: "middle",
          halign: "left",
          lineColor: [0, 0, 0], // Black borders for all cells
          lineWidth: 0.5,
          cellPadding: 3, 
        },
        columnStyles,
        alternateRowStyles: {
          fillColor: [245, 245, 245], // Light gray for alternate rows
        },
        // Style cells based on content and row type
        didParseCell: (data: CellHookData) => {
          // Skip styling for header rows - keep them blue
          if (data.section === 'head') {
            return; // Don't apply any custom styling to headers
          }
          
          // Style the summary row (last row)
          if (data.row.index === rows.length - 1) {
            data.cell.styles.fillColor = [220, 220, 220]; // Darker gray for summary
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = [0, 0, 0];
          }
          // Style Present cells with green background (day columns only)
          else if (data.column.index > 0 && data.column.index <= days.length) {
            // Day columns are from index 1 to days.length (after Employee Name)
            // Access cell value from body array directly (most reliable method)
            const cellValue = String(body[data.row.index]?.[data.column.index] || "").trim();
            
            if (cellValue === "P") {
              // Green background for Present - explicitly set to override alternate row styles
              data.cell.styles.fillColor = [76, 175, 80]; // Green (RGB: 76, 175, 80)
              data.cell.styles.textColor = [255, 255, 255]; // White text for better contrast
              data.cell.styles.fontStyle = "bold";
            } else if (cellValue === "L") {
              // Orange background for Leave - explicitly set to override alternate row styles
              data.cell.styles.fillColor = [255, 152, 0]; // Orange
              data.cell.styles.textColor = [255, 255, 255]; // White text
              data.cell.styles.fontStyle = "bold";
            } else if (cellValue === "A") {
              // Light red background for Absent - explicitly set to override alternate row styles
              data.cell.styles.fillColor = [244, 67, 54]; // Red
              data.cell.styles.textColor = [255, 255, 255]; // White text
              data.cell.styles.fontStyle = "bold";
            } else if (cellValue === "H") {
              // Purple background for Holiday - explicitly set to override alternate row styles
              data.cell.styles.fillColor = [156, 39, 176]; // Purple (RGB: 156, 39, 176)
              data.cell.styles.textColor = [255, 255, 255]; // White text
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
        // Add borders to all cells - ensure all cells have borders
        tableLineWidth: 0.5,
        tableLineColor: [0, 0, 0],
        showHead: "everyPage",
        showFoot: "everyPage",
        // didDrawPage: () => {
        //   // Draw color legend at the bottom of each page
        //   const pageHeight = doc.internal.pageSize.getHeight();
        //   const legendY = pageHeight - 30; // 30pt from bottom
        //   const legendStartX = 40; // Start from left margin
        //   const boxSize = 12; // Size of color box
        //   const labelOffset = 3; // Vertical offset for text
          
        //   // Legend title
        //   doc.setFontSize(9);
        //   doc.setFont("helvetica", "bold");
        //   doc.text("Legend:", legendStartX, legendY - 5);
          
        //   // Color definitions
        //   const legendItems = [
        //     { label: "Present", color: [76, 175, 80] },      // Green
        //     { label: "Leave", color: [255, 152, 0] },        // Orange
        //     { label: "Absent", color: [244, 67, 54] },       // Red
        //     { label: "Holiday", color: [156, 39, 176] },     // Purple
        //   ];
          
        //   let currentX = legendStartX + 50; // Start after "Legend:" text
          
        //   legendItems.forEach((item) => {
        //     // Draw colored box
        //     doc.setFillColor(item.color[0], item.color[1], item.color[2]);
        //     doc.rect(currentX, legendY - boxSize, boxSize, boxSize, "F");
            
        //     // Draw border around box
        //     doc.setDrawColor(0, 0, 0);
        //     doc.setLineWidth(0.5);
        //     doc.rect(currentX, legendY - boxSize, boxSize, boxSize, "S");
            
        //     // Draw label
        //     doc.setFontSize(8);
        //     doc.setFont("helvetica", "normal");
        //     doc.setTextColor(0, 0, 0);
        //     doc.text(item.label, currentX + boxSize + 5, legendY - labelOffset);
            
        //     // Move to next item
        //     const textWidth = doc.getTextWidth(item.label);
        //     currentX += boxSize + textWidth + 20; // box + spacing + text + spacing
        //   });
        // },
      });

      // Get final Y position after table
      const finalY = (doc as JsPdfWithAutoTable).lastAutoTable?.finalY || doc.internal.pageSize.getHeight() - 50;
      
      // Add color legend at the bottom if there's space, otherwise it will be added via didDrawPage
      const pageHeight = doc.internal.pageSize.getHeight();
      if (finalY < pageHeight - 50) {
        // Add legend below table if there's space
        const legendY = finalY + 20;
        const legendStartX = 40;
        const boxSize = 12;
        
        // Legend title
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text("Legend:", legendStartX, legendY);
        
        // Color definitions
        const legendItems = [
          { label: "Present", color: [76, 175, 80] },      // Green
          { label: "Leave", color: [255, 152, 0] },        // Orange
          { label: "Absent", color: [244, 67, 54] },      // Red
          { label: "Holiday", color: [156, 39, 176] },     // Purple
        ];
        
        let currentX = legendStartX + 50;
        
        legendItems.forEach((item) => {
          // Draw colored box
          doc.setFillColor(item.color[0], item.color[1], item.color[2]);
          doc.rect(currentX, legendY - boxSize + 3, boxSize, boxSize, "F");
          
          // Draw border around box
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.5);
          doc.rect(currentX, legendY - boxSize + 3, boxSize, boxSize, "S");
          
          // Draw label
          doc.setFontSize(8);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(0, 0, 0);
          doc.text(item.label, currentX + boxSize + 5, legendY);
          
          // Move to next item
          const textWidth = doc.getTextWidth(item.label);
          currentX += boxSize + textWidth + 20;
        });
      }

      // Save PDF
      doc.save(fileName);
      messageApi.success(`Monthly attendance report for ${monthName} generated successfully`);
    } catch (error) {
      console.error("Error exporting monthly report:", error);
      messageApi.error("Failed to generate monthly attendance report");
    } finally {
      setMonthlyLoading(false);
    }
  };

  const formatTime = (timestamp?: number): string => {
    if (!timestamp || timestamp === 0) return "00:00";
    const time = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    return dayjs(time).format("HH:mm");
  };

  const formatDuration = (hours: number, minutes: number): string => {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };
  const timeToDecimalHours = (time: string): number => {
  if (!time || !time.includes(":")) return 0;

  const [hours, minutes] = time.split(":").map(Number);
  return Number((hours + minutes / 60).toFixed(2));
};
const calculateSalary = ({
  monthlySalary,
  monthDays,
  payDays,
  otHours,
  otAllowed,
  otRatePerHour,
  pfDeduction,
  esiDeduction,
  professionalTax,
  advanceDeduction,
  otherDeduction,
}: {
  monthlySalary: number;
  monthDays: number;
  payDays: number;
  otHours: number;
  otAllowed: boolean;
  otRatePerHour: number;
  pfDeduction: number;
  esiDeduction: number;
  professionalTax: number;
  advanceDeduction: number;
  otherDeduction: number;
}) => {
  const perDaySalary = monthlySalary / monthDays;
  const basicSalary = perDaySalary * payDays;

  const otAmount = otAllowed ? otHours * otRatePerHour : 0;

  const totalDeduction =
    pfDeduction +
    esiDeduction +
    professionalTax +
    advanceDeduction +
    otherDeduction;

  const grossSalary = basicSalary + otAmount;
  const netSalary = grossSalary - totalDeduction;

  return {
    perDaySalary: Math.round(perDaySalary),
    basicSalary: Math.round(basicSalary),
    otAmount: Math.round(otAmount),
    grossSalary: Math.round(grossSalary),
    totalDeduction: Math.round(totalDeduction),
    netSalary: Math.round(netSalary),
  };
};

  const calculateHours = (checkIn?: number, checkOut?: number): { hours: number; minutes: number } => {
    if (!checkIn || !checkOut || checkIn === 0 || checkOut === 0) {
      return { hours: 0, minutes: 0 };
    }
    const inTime = checkIn < 1e12 ? checkIn * 1000 : checkIn;
    const outTime = checkOut < 1e12 ? checkOut * 1000 : checkOut;
    const diffMs = outTime - inTime;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
  };

  const calculateOvertime = (checkIn?: number, checkOut?: number, shiftEndHour: number = 18): { hours: number; minutes: number } => {
    if (!checkIn || !checkOut || checkIn === 0 || checkOut === 0) {
      return { hours: 0, minutes: 0 };
    }
    const outTime = checkOut < 1e12 ? checkOut * 1000 : checkOut;
    const shiftEnd = dayjs(outTime).hour(shiftEndHour).minute(0).second(0);
    if (dayjs(outTime).isAfter(shiftEnd)) {
      const diffMs = dayjs(outTime).diff(shiftEnd);
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return { hours, minutes };
    }
    return { hours: 0, minutes: 0 };
  };

  const isLate = (checkIn?: number, expectedTime: string = "10:00"): boolean => {
    if (!checkIn || checkIn === 0) return false;
    const inTime = checkIn < 1e12 ? checkIn * 1000 : checkIn;
    const [expHour, expMin] = expectedTime.split(":").map(Number);
    const expected = dayjs(inTime).hour(expHour).minute(expMin).second(0);
    return dayjs(inTime).isAfter(expected);
  };

  const isEarlyLeaving = (
    checkOut?: number,
    expectedTime: string = "18:30"
  ): boolean => {
    if (!checkOut || checkOut === 0) return false;
    const outTime = checkOut < 1e12 ? checkOut * 1000 : checkOut;
    const [expHour, expMin] = expectedTime.split(":").map(Number);
    const expected = dayjs(outTime).hour(expHour).minute(expMin).second(0);
    return dayjs(outTime).isBefore(expected);
  };

  const attendanceStats = attendance.reduce(
    (stats, record) => {
      const isPresent = record.attendanceStatus === "PRESENT";
      const hasCheckOut = !!record.checkOutTime && record.checkOutTime > 0;

      if (isPresent) {
        stats.presentToday += 1;

        if (isLate(record.checkInTime)) {
          stats.lateComers += 1;
        }

        if (hasCheckOut) {
          const { hours, minutes } = calculateHours(
            record.checkInTime,
            record.checkOutTime
          );
          const workedMinutes = hours * 60 + minutes;

          if (workedMinutes > 0 && workedMinutes < 240) {
            stats.halfDay += 1;
          }

          if (isEarlyLeaving(record.checkOutTime)) {
            stats.earlyLeaving += 1;
          }
        }
      }

      if (record.attendanceStatus === "ABSENT") {
        stats.absentToday += 1;
      }

      if (record.attendanceStatus === "ON_LEAVE") {
        stats.onLeave += 1;
      }

      return stats;
    },
    {
      totalEmployees: attendance.length,
      presentToday: 0,
      absentToday: 0,
      halfDay: 0,
      lateComers: 0,
      earlyLeaving: 0,
      onBreak: 0,
      onLeave: 0,
    }
  );

  const attendanceSummaryItems = [
    {
      label: "Total",
      value: attendanceStats.totalEmployees,
      color: "#33279b",
    },
    {
      label: "Present",
      value: attendanceStats.presentToday,
      color: "#16a05d",
    },
    {
      label: "Absent",
      value: attendanceStats.absentToday,
      color: "#c21807",
    },
    {
      label: "Half Day",
      value: attendanceStats.halfDay,
      color: "#d68a00",
    },
    {
      label: "Late Comers",
      value: attendanceStats.lateComers,
      color: "#7b20b2",
    },
    {
      label: "Early Leaving",
      value: attendanceStats.earlyLeaving,
      color: "#0077b6",
    },
    {
      label: "On Break",
      value: attendanceStats.onBreak,
      color: "#00a6c8",
    },
    {
      label: "On Leave",
      value: attendanceStats.onLeave,
      color: "#d6a800",
    },
  ];

  // const getStatus = (
  //   attendance?: AttendanceRecord,
  //   leave?: LeaveApplication,
  //   isSunday: boolean = false
  // ): string => {
  //   if (isSunday) return "WO";
  //   if (leave) return "L";
  //   if (attendance?.isPresent) {
  //     const late = isLate(attendance.checkInTime);
  //     return late ? "p*" : "P";
  //   }
  //   return "A";
  // };

  const exportMonthlyExcel = async () => {
    if (!monthlyReportMonth) {
      messageApi.warning("Please select a month");
      return;
    }

    setIsMonthlyModalVisible(false);
    setMonthlyLoading(true);
    try {
      const monthStart = monthlyReportMonth.startOf("month");
      const monthEnd = monthlyReportMonth.endOf("month");

      const monthlyData = await attendanceApi.getMonthly({
        outletId: outletId!,
        month: monthlyReportMonth.format("YYYY-MM"),
        includeSalary: true,
      });
      const teamList = monthlyData.team;
      if (!teamList.length) {
        messageApi.warning("No employees found");
        setMonthlyLoading(false);
        return;
      }

      const salaryList = monthlyData.salaries;
      const salaryMap = new Map<string, SalaryMaster>(
        salaryList.map((salary) => [salary.userId, salary])
      );
      const monthlyAttendance = monthlyData.attendance;
      const approvedLeavesForMonth = monthlyData.leaves;
      const allHolidays = monthlyData.holidays;
      
      // Create holiday map using dateString (YYYY-MM-DD format)
      const holidayMap = new Map<string, HolidayDTO>();
      allHolidays.forEach((holiday) => {
        if (holiday.dateString) {
          // Convert YYYY-MM-DD to DD-MM-YYYY for dayId format
          const [year, monthStr, day] = holiday.dateString.split("-");
          const dayId = `${day}-${monthStr}-${year}`;
          const holidayDate = dayjs(holiday.dateString);
          // Check if holiday falls within the selected month
          if (holidayDate.isSameOrAfter(monthStart, "day") && holidayDate.isSameOrBefore(monthEnd, "day")) {
            holidayMap.set(dayId, holiday);
          }
        } else if (typeof holiday.date === 'number') {
          // Fallback: use timestamp to create dayId
          const holidayDate = dayjs(holiday.date);
          if (holidayDate.isSameOrAfter(monthStart, "day") && holidayDate.isSameOrBefore(monthEnd, "day")) {
            const dayId = holidayDate.format("DD-MM-YYYY");
            holidayMap.set(dayId, holiday);
          }
        }
      });

      // Create lookup maps
      const attendanceMap = new Map<string, Map<string, AttendanceRecord>>();
      monthlyAttendance.forEach((a) => {
        if (!attendanceMap.has(a.userId!)) {
          attendanceMap.set(a.userId!, new Map());
        }
        attendanceMap.get(a.userId!)!.set(a.dayId!, a);
      });

      const leaveMap = new Map<string, LeaveApplication[]>();
      approvedLeavesForMonth.forEach((l) => {
        if (!leaveMap.has(l.userProfileId)) {
          leaveMap.set(l.userProfileId, []);
        }
        leaveMap.get(l.userProfileId)!.push(l);
      });

      // Get all days in month
      const daysInMonth = monthlyReportMonth.daysInMonth();
      const allDays: { day: number; date: Dayjs; dayId: string; isSunday: boolean }[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const currentDay = monthlyReportMonth.date(day);
        allDays.push({
          day,
          date: currentDay,
          dayId: currentDay.format("DD-MM-YYYY"),
          isSunday: currentDay.day() === 0,
        });
      }

      // Create workbook
      const workbook = new ExcelJS.Workbook();

      // Prepare data rows
      const dataRows: TableRow[] = [];

      // Header row 1: Title
      const titleRow: TableRow = [];
      titleRow.push("Monthly Performance Report For the Month: " + monthlyReportMonth.format("MMM-YYYY"));
      const summaryColumnsCount = 15;
      const salaryColumnsCount = 11;
      const totalCols =
        1 + allDays.length * 6 + summaryColumnsCount + salaryColumnsCount;
      for (let i = 1; i < totalCols; i++) {
        titleRow.push("");
      }
      dataRows.push(titleRow);

      // Header row 2: Day numbers (merged for each day's 6 columns) and summary headers
      const headerRow2: TableRow = ["Day"];
      allDays.forEach(({ day }) => {
        headerRow2.push(day);
        for (let i = 0; i < 5; i++) headerRow2.push(""); // 5 more columns per day (Shift, In, Out, OT, Total Hrs, Status - day is first)
      });
      headerRow2.push(
        "Present Days",
        "WOFF",
        "Leave",
        "COFF",
        "OT Hrs",
        "Total Hrs (Monthly)",
        "OT Days",
        "Absent Days",
        "Late Days",
        "Late Cut",
        "Late Leave",
        "LWP",
        "Pay Days",
        "Early Days",
        "Early Cut",
        "Monthly Salary",
        "Per Day Salary",
        "Basic Salary",
        "OT Amount",
        "Gross Salary",
        "PF",
        "ESI",
        "PT",
        "Other Deduction",
        "Total Deduction",
        "Net Salary"
      );
      dataRows.push(headerRow2);

      // Header row 3: Sub-headers for each day (Shift, In, Out, OT, Total Hrs, Status)
      const headerRow3: TableRow = ["Employee Name"];
      allDays.forEach(() => {
        headerRow3.push("Shift", "In", "Out", "OT", "Total Hrs", "Status");
      });
      for (let i = 0; i < 26; i++) {
        headerRow3.push("");
      }
      dataRows.push(headerRow3);

      // Data rows for each employee
      teamList.forEach((user) => {
        const userAttendance = attendanceMap.get(user.userProfileId);
        const userLeaves = leaveMap.get(user.userProfileId) || [];

        let presentDays = 0;
        let absentDays = 0;
        let lateDays = 0;
        let woffDays = 0;
        let leaveDays = 0;
        let totalHours = 0;
        let totalMinutes = 0;
        let otDays = 0;
        let totalOtHours = 0;
        let totalOtMinutes = 0;
        let holidayDays = 0;
        const coffDays = 0;
        const lwpDays = 0;
        const lateCutDays = 0;
        const lateLeaveDays = 0;
        const earlyDays = 0;
        const earlyCutDays = 0;

        const row: TableRow = [user.userName || "NA"];

        allDays.forEach(({ dayId, date, isSunday }) => {
          const dayStart = date.startOf("day").valueOf();
          const dayEnd = date.endOf("day").valueOf();

          const attendance = userAttendance?.get(dayId);
          const leaveOnDay = userLeaves.find(
            (l) => l.fromDate <= dayEnd && l.toDate >= dayStart
          );
          const holiday = holidayMap.get(dayId);

          // const status = getStatus(attendance, leaveOnDay, isSunday);

          // Check for holiday first
          if (holiday) {
            holidayDays++;
            row.push("", "", "", "", "", "H"); // Holiday
          } else if (isSunday) {
            woffDays++;
            row.push("", "", "", "", "", "WO");
          } else if (leaveOnDay) {
            leaveDays++;
            row.push("", "", "", "", "", "L");
          } else if (attendance?.isPresent) {
            presentDays++;
            const shift = "GS"; // Default shift, can be enhanced
            const inTime = formatTime(attendance.checkInTime);
            const outTime = attendance.checkOutTime && attendance.checkOutTime > 0 
              ? formatTime(attendance.checkOutTime) 
              : "00:00";
            const { hours: otHours, minutes: otMinutes } = calculateOvertime(
              attendance.checkInTime,
              attendance.checkOutTime
            );
            const ot = formatDuration(otHours, otMinutes);
            totalOtHours += otHours;
            totalOtMinutes += otMinutes;
            
            const { hours: totalHrs, minutes: totalMins } = calculateHours(
              attendance.checkInTime,
              attendance.checkOutTime
            );
            const totalHrsStr = formatDuration(totalHrs, totalMins);
            totalHours += totalHrs;
            totalMinutes += totalMins;

            if (otHours > 0 || otMinutes > 0) {
              otDays++;
            }

            if (isLate(attendance.checkInTime)) {
              lateDays++;
              row.push(shift, inTime, outTime, ot, totalHrsStr, "p*");
            } else {
              row.push(shift, inTime, outTime, ot, totalHrsStr, "P");
            }
          } else {
            absentDays++;
            row.push("", "", "", "", "", "A");
          }
        });

        // Calculate total hours
        const finalHours = totalHours + Math.floor(totalMinutes / 60);
        const finalMinutes = totalMinutes % 60;
        const totalHrsMonthly = formatDuration(finalHours, finalMinutes);
        
        // Calculate total OT hours
        const finalOtHours = totalOtHours + Math.floor(totalOtMinutes / 60);
        const finalOtMins = totalOtMinutes % 60;
        const totalOtHrsStr = formatDuration(finalOtHours, finalOtMins);

        const paidWeeklyOffDays = woffDays;
        const paidHolidayDays = holidayDays;
        const paidLeaveDays = leaveDays;

        const payDays =
          presentDays +
          paidWeeklyOffDays +
          paidHolidayDays +
          paidLeaveDays +
          coffDays -
          lwpDays -
          lateCutDays -
          earlyCutDays;

        const salaryMaster = salaryMap.get(user.userProfileId);
        const otDecimalHours = timeToDecimalHours(totalOtHrsStr);

        const salary = salaryMaster
          ? calculateSalary({
              monthlySalary: salaryMaster.monthlySalary || 0,
              monthDays: monthlyReportMonth.daysInMonth(),
              payDays,
              otHours: otDecimalHours,
              otAllowed: salaryMaster.otAllowed || false,
              otRatePerHour: salaryMaster.otRatePerHour || 0,
              pfDeduction: salaryMaster.pfDeduction || 0,
              esiDeduction: salaryMaster.esiDeduction || 0,
              professionalTax: salaryMaster.professionalTax || 0,
              advanceDeduction: salaryMaster.advanceDeduction || 0,
              otherDeduction: salaryMaster.otherDeduction || 0,
            })
          : null;

        // Summary columns
        row.push(
          presentDays,
          woffDays,
          leaveDays,
          coffDays,
          totalOtHrsStr,
          totalHrsMonthly,
          otDays,
          absentDays,
          lateDays,
          lateCutDays,
          lateLeaveDays,
          lwpDays,
          payDays,
          earlyDays,
          earlyCutDays,
          salaryMaster?.monthlySalary || 0,
          salary?.perDaySalary || 0,
          salary?.basicSalary || 0,
          salary?.otAmount || 0,
          salary?.grossSalary || 0,
          salaryMaster?.pfDeduction || 0,
          salaryMaster?.esiDeduction || 0,
          salaryMaster?.professionalTax || 0,
          salaryMaster?.otherDeduction || 0,
          salary?.totalDeduction || 0,
          salary?.netSalary || 0
        );

        dataRows.push(row);
      });

      // Create worksheet
      const worksheet = workbook.addWorksheet("Monthly Report");
      worksheet.addRows(dataRows);

      // Merge cells for title
      worksheet.mergeCells(1, 1, 1, totalCols);
      
      // Merge day header cells (row 2, each day spans 6 columns)
      allDays.forEach((_, dayIndex) => {
        const startCol = 2 + dayIndex * 6; // Start after "Day" column
        worksheet.mergeCells(2, startCol, 2, startCol + 5);
      });

      // Set column widths
      const colWidths: number[] = [20]; // Employee Name
      allDays.forEach(() => {
        colWidths.push(8, 8, 8, 8, 10, 8);
      });
      for (let i = 0; i < 26; i++) {
        colWidths.push(14);
      }
      worksheet.columns = colWidths.map((width) => ({ width }));

      // Style header rows
      for (let rowIndex = 1; rowIndex <= 3; rowIndex += 1) {
        for (let columnIndex = 1; columnIndex <= totalCols; columnIndex += 1) {
          const cell = worksheet.getCell(rowIndex, columnIndex);
          cell.style = {
            font: { bold: true, size: 11 },
            fill: {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FF4472C4" },
            },
            alignment: { horizontal: "center", vertical: "middle" },
            border: {
              top: { style: "thin" },
              bottom: { style: "thin" },
              left: { style: "thin" },
              right: { style: "thin" },
            },
          };
        }
      }

      // Style title row
      const titleCell = worksheet.getCell(1, 1);
      titleCell.font = { bold: true, size: 14 };
      titleCell.alignment = { horizontal: "center", vertical: "middle" };

      // Generate file
      const monthName = monthlyReportMonth.format("MMM-YYYY");
      const fileName = `Monthly_Performance_Report_${monthlyReportMonth.format("MM_YYYY")}.xlsx`;
      await saveWorkbookAsXlsx(workbook, fileName);

      messageApi.success(`Monthly Excel report for ${monthName} generated successfully`);
    } catch (error) {
      console.error("Error exporting monthly Excel report:", error);
      messageApi.error("Failed to generate monthly Excel report");
    } finally {
      setMonthlyLoading(false);
    }
  };

  const handleDeleteRecord = async (record: AttendanceRecord) => {
    if (!record.id) {
      messageApi.error("Invalid attendance record");
      return;
    }

    if (!outletId) {
      messageApi.error("Outlet not selected");
      return;
    }

    try {
      await attendanceApi.deleteAttendance(outletId, record.id);
      setAttendance((current) =>
        current.filter((item) => item.id !== record.id)
      );
      messageApi.success(APP_MESSAGES.SUCCESS_DELETE);
    } catch (error) {
      console.error(error);
      messageApi.error("Failed to delete record");
    }
  };

  const columns = [
    {
      title: "Employee ID",
      dataIndex: "empCode",
      key: "empCode",
      sorter: (a: AttendanceRecord, b: AttendanceRecord) =>
        (a.empCode ?? "").localeCompare(b.empCode ?? ""),
    },
    {
      title: "Employee Name",
      dataIndex: "userName",
      key: "userName",
      sorter: (a: AttendanceRecord, b: AttendanceRecord) =>
        (a.userName ?? "").localeCompare(b.userName ?? ""),
      render: (name?: string) => formatEmployeeName(name, "NA"),
    },
    {
      title: "Date",
      dataIndex: "dayId",
      key: "dayId",
    },
    {
      title: "Check-In Time",
      dataIndex: "checkInTime",
      key: "checkInTime",
      sorter: (a: AttendanceRecord, b: AttendanceRecord) =>
        (a.checkInTime ?? 0) - (b.checkInTime ?? 0),
      render: (time?: number) => {
        if (!time || time === 0) {
          return <span className="text-gray-400 italic">NA</span>;
        }
        const date = dayjs(time < 1e12 ? time * 1000 : time);
        return <span>{date.format("hh:mm A")}</span>;
      },
    },
    {
      title: "Check-Out Time",
      dataIndex: "checkOutTime",
      key: "checkOutTime",
      sorter: (a: AttendanceRecord, b: AttendanceRecord) =>
        (a.checkOutTime ?? 0) - (b.checkOutTime ?? 0),
      render: (time?: number) => {
        if (!time || time === 0) {
          return <span className="text-gray-400 italic">NA</span>;
        }
        const date = dayjs(time < 1e12 ? time * 1000 : time);
        return <span>{date.format("hh:mm A")}</span>;
      },
    },
    {
      title: "Check-In Device",
      key: "checkInDevice",
      render: (_: unknown, record: AttendanceRecord) =>
        getAttendanceDevice(record, "in"),
    },
    {
      title: "Check-Out Device",
      key: "checkOutDevice",
      render: (_: unknown, record: AttendanceRecord) =>
        getAttendanceDevice(record, "out"),
    },
    {
      title: "Status",
      dataIndex: "attendanceStatus",
      key: "status",
      render: (status: "PRESENT" | "ON_LEAVE" | "ABSENT") => {
        const colorMap: Record<string, string> = {
          PRESENT: "green",
          ON_LEAVE: "orange",
          ABSENT: "red",
        };

        return <Tag color={colorMap[status]}>{status.replace("_", " ")}</Tag>;
      },
    },
    {
      title: "Location",
      dataIndex: ["checkInLocationDetails", "locality"],
      key: "location",
    },
    {
      title: "Actions",
      key: "actions",
      render: (_: unknown, record: AttendanceRecord) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedRecord(record);
              setIsModalVisible(true);
            }}
          />
          <Can permission={PERMISSION_MASTER.CRM_ATTENDANCE_DELETE}>
            <Popconfirm
              title="Delete Record"
              description="Are you sure you want to delete this record?"
              onConfirm={() => handleDeleteRecord(record)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  if (loading) {
    return <SpinLoader loading={loading} />;
  }

  return (
    <div>
      <Card
        style={{ marginBottom: 24 }}
        variant={"borderless"}
      >
        <div
          className="attendance-summary-panel"
          style={{
            marginBottom: 24,
            maxWidth: "100%",
            overflow: "hidden",
            border: "1px solid #f0f0f0",
            borderRadius: 12,
            background: "#fff",
            boxShadow: "0 4px 18px rgba(15, 23, 42, 0.08)",
            width: "50%",
          }}
        >
          <Row
            className="attendance-summary-header"
            align="middle"
            justify="space-between"
            gutter={[16, 16]}
            style={{ padding: "18px 24px" }}
          >
            <Col>
              <Space align="center" size={12}>
                <span
                  style={{
                    display: "inline-flex",
                    width: 34,
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#111827",
                    fontSize: 22,
                  }}
                >
                  <TeamOutlined />
                </span>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
                    Attendance
                  </h2>
                  <div style={{ color: "#6b7280", fontSize: 13 }}>
                    Report Center
                  </div>
                </div>
              </Space>
            </Col>
            <Col>
              <DatePicker
                allowClear={false}
                value={selectedDate}
                onChange={(date) => {
                  if (date) {
                    setSelectedDate(date);
                  }
                }}
                format="DD MMM YYYY | ddd"
                suffixIcon={<CalendarOutlined />}
                disabledDate={(current) => current && current > dayjs()}
                style={{
                  width: 220,
                  border: "none",
                  borderRadius: 10,
                  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.12)",
                  fontWeight: 600,
                }}
              />
            </Col>
          </Row>

          <div
            className="attendance-summary-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            {attendanceSummaryItems.map((item, index) => (
              <div
                className="attendance-summary-item"
                key={item.label}
                style={{
                  minHeight: 108,
                  padding: "20px 24px",
                  borderRight:
                    index % 4 === 3 ? "none" : "1px solid #e5e7eb",
                  borderBottom:
                    index < 4 ? "1px solid #e5e7eb" : "none",
                }}
              >
                <div
                  style={{
                    color: item.color,
                    fontSize: 16,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    color: item.color,
                    fontSize: 30,
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "18px 24px",
            }}
          >
            {/* <Button type="link" style={{ color: "#33279b", fontWeight: 700 }}>
              Detailed Attendance View <RightOutlined />
            </Button> */}
          </div>
        </div>

        <Row
          justify="space-between"
          align="middle"
          gutter={[16, 16]}
          style={{ marginBottom: 24 }}
        >
          <Col>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
              Attendance Records
            </h2>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={exportPDF}
              >
                Export
              </Button>
              <Button
                type="default"
                icon={<FilePdfOutlined />}
                onClick={handleMonthlyReportClick}
                loading={monthlyLoading}
              >
                Monthly Report
              </Button>
            </Space>
          </Col>
        </Row>

        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          <Col xs={24} sm={12} lg={12}>
            <Input
              style={{ width: "100%" }}
              placeholder="Search by Employee ID"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Col>
          <Col xs={24} sm={12} lg={12}>
            <Select
              style={{ width: "100%" }}
              placeholder="Filter by Status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { label: "All", value: "all" },
                { label: "Present", value: "PRESENT" },
                { label: "Absent", value: "ABSENT" },
                { label: "On Leave", value: "ON_LEAVE" },
              ]}
            />
          </Col>
        </Row>

        {filteredData.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
            No attendance records found
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[1400px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-3">Employee ID</th>
                    <th className="px-4 py-3">Employee Name</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Check-In Time</th>
                    <th className="px-4 py-3">Check-Out Time</th>
                    <th className="px-4 py-3">Check-In Device</th>
                    <th className="px-4 py-3">Check-Out Device</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAttendance.map((record) => {
                    const checkInTime = record?.checkInTime
                      ? dayjs(
                          record.checkInTime < 1e12
                            ? record.checkInTime * 1000
                            : record.checkInTime
                        ).format("hh:mm A")
                      : "NA";
                    const checkOutTime = record?.checkOutTime
                      ? dayjs(
                          record.checkOutTime < 1e12
                            ? record.checkOutTime * 1000
                            : record.checkOutTime
                        ).format("hh:mm A")
                      : "NA";
                    const checkInDevice = getAttendanceDevice(record, "in");
                    const checkOutDevice = getAttendanceDevice(record, "out");
                    const colorMap: Record<AttendanceStatus, string> = {
                      PRESENT: "green",
                      ON_LEAVE: "orange",
                      ABSENT: "red",
                    };

                    return (
                      <tr
                        key={`${record.userId}-${record.dayId}`}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">
                          {record.empCode || "NA"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatEmployeeName(record.userName, "NA")}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {record.dayId}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {checkInTime}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {checkOutTime}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {renderAttendanceDeviceCell(checkInDevice)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {renderAttendanceDeviceCell(checkOutDevice)}
                        </td>
                        <td className="px-4 py-3">
                          <Tag color={colorMap[record.attendanceStatus as AttendanceStatus]}>
                            {String(record.attendanceStatus || "ABSENT").replace(
                              "_",
                              " "
                            )}
                          </Tag>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {record.checkInLocationDetails?.locality || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Space>
                            <Button
                              type="text"
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => {
                                setSelectedRecord(record);
                                setIsModalVisible(true);
                              }}
                            />
                            <Can
                              permission={PERMISSION_MASTER.CRM_ATTENDANCE_DELETE}
                            >
                              <Popconfirm
                                title="Delete Record"
                                description="Are you sure you want to delete this record?"
                                onConfirm={() => handleDeleteRecord(record)}
                                okText="Yes"
                                cancelText="No"
                              >
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                />
                              </Popconfirm>
                            </Can>
                          </Space>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <span className="text-sm text-slate-500">
                Showing {pagedAttendance.length} of {filteredData.length} records
              </span>
              <Space>
                <Button
                  disabled={safeTablePage <= 1}
                  onClick={() => setTablePage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <span className="text-sm text-slate-600">
                  Page {safeTablePage} of {totalPages}
                </span>
                <Button
                  disabled={safeTablePage >= totalPages}
                  onClick={() =>
                    setTablePage((page) => Math.min(totalPages, page + 1))
                  }
                >
                  Next
                </Button>
              </Space>
            </div>
          </>
        )}
      </Card>

      <Modal
        title="Attendance Details"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={600}
      >
        {selectedRecord && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="Employee ID">
              {selectedRecord?.empCode}
            </Descriptions.Item>
            <Descriptions.Item label="Date">
              {selectedRecord?.dayId}
            </Descriptions.Item>
            <Descriptions.Item label="Check-In Time">
              {selectedRecord?.checkInTime ? (
                dayjs(
                  selectedRecord?.checkInTime < 1e12
                    ? selectedRecord?.checkInTime * 1000
                    : selectedRecord?.checkInTime
                ).format("hh:mm A")
              ) : (
                <span className="text-gray-400 italic">NA</span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Check-In Device">
              {renderAttendanceDeviceCell(getAttendanceDevice(selectedRecord, "in"))}
            </Descriptions.Item>
            <Descriptions.Item label="Check-Out Time">
              {selectedRecord?.checkOutTime ? (
                dayjs(
                  selectedRecord?.checkOutTime < 1e12
                    ? selectedRecord?.checkOutTime * 1000
                    : selectedRecord?.checkOutTime
                ).format("hh:mm A")
              ) : (
                <span className="text-gray-400 italic">NA</span>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Check-Out Device">
              {renderAttendanceDeviceCell(getAttendanceDevice(selectedRecord, "out"))}
            </Descriptions.Item>
            <Descriptions.Item label="Check-In Location">{`${
              selectedRecord?.checkInLocationDetails?.locality || "NA"
            } ${
              selectedRecord?.checkInLocationDetails?.subLocality || "NA"
            }`}</Descriptions.Item>
            <Descriptions.Item label="Check-Out Location">{`${
              selectedRecord?.checkOutLocationDetails?.locality || "NA"
            } ${
              selectedRecord?.checkOutLocationDetails?.subLocality || "NA"
            }`}</Descriptions.Item>
            {/* <Descriptions.Item label="Locality">{selectedRecord?.checkOutLocationDetails?.locality}</Descriptions.Item> */}
            <Descriptions.Item label="Status">
              <Tag color={selectedRecord?.isPresent ? "green" : "red"}>
                {selectedRecord?.isPresent ? "Present" : "Absent"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Notes">
              {selectedRecord?.note || "No notes"}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title="Generate Monthly Attendance Report"
        open={isMonthlyModalVisible}
        onCancel={() => setIsMonthlyModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsMonthlyModalVisible(false)}>
            Cancel
          </Button>,
          <Button
            key="excel"
            type="default"
            icon={<FileExcelOutlined />}
            onClick={exportMonthlyExcel}
            loading={monthlyLoading}
          >
            Download Excel
          </Button>,
          <Button
            key="pdf"
            type="primary"
            icon={<FilePdfOutlined />}
            onClick={exportMonthlyPDF}
            loading={monthlyLoading}
          >
            Download PDF
          </Button>,
        ]}
      >
        <div style={{ padding: "20px 0" }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
            Select Month:
          </label>
          <DatePicker
            picker="month"
            allowClear={false}
            style={{ width: "100%" }}
            value={monthlyReportMonth}
            onChange={(date) => {
              if (date) {
                setMonthlyReportMonth(date);
              }
            }}
            placeholder="Select Month"
            format="MMMM YYYY"
            disabledDate={(current) => current && current > dayjs()}
          />
        </div>
      </Modal>
    </div>
  );
};

export default AttendanceRecords;
