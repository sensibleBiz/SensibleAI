// src/utils/fileExport.ts
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ExcelJS, saveWorkbookAsXlsx } from "./excelWorkbook";

type PdfUnit = "pt" | "mm" | "cm" | "in";
type PdfOrientation = "portrait" | "landscape";
type PdfFormat = "a3" | "a4" | "a5" | "letter" | "legal";

type ExportRow = Record<string, unknown>;
type ExportCellValue = string | number;

export type TableColumn<T extends object = ExportRow> = {
  title: string;            // header shown in PDF/Excel
  dataIndex: keyof T | string; // key in data objects
  width?: number;           // optional, used by PDF auto table column width weighting
  formatter?: (val: unknown, row?: T) => string | number; // optional cell formatter
};

const defaultPdfOptions = {
  orientation: "landscape" as PdfOrientation,
  unit: "pt" as PdfUnit,
  format: "a4" as PdfFormat,
  margin: { top: 40, left: 40, right: 40, bottom: 40 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getValueByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, obj);
}

function toExportCellValue(value: unknown): ExportCellValue {
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value);
}

export const exportToPDF = <T extends object = ExportRow>(
  rows: T[],
  columns: TableColumn<T>[],
  fileName = "export.pdf",
  opts?: Partial<typeof defaultPdfOptions>
) => {
  const options = { ...defaultPdfOptions, ...opts };

  const doc = new jsPDF({
    orientation: options.orientation,
    unit: options.unit,
    format: options.format,
  });

  autoTable(doc,{}); // attach plugin

  const title = fileName.replace(/\.[^.]+$/, "");
  doc.setFontSize(14);
  doc.text(title, options.margin.left, 30);

  const head = columns.map((c) => c.title);
  const body = rows.map((r) =>
    columns.map((col) => {
      const raw = getValueByPath(r, String(col.dataIndex));
      const formatted = col.formatter ? col.formatter(raw, r) : raw ?? "";
      return toExportCellValue(formatted);
    })
  );

  autoTable(doc, {
    head: [head],
    body,
    bodyStyles:{valign:"middle"},
    startY: 48,
    margin: options.margin,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [24, 144, 255], textColor: 255, halign: "left" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(fileName);
};

export const exportToExcel = <T extends object = ExportRow>(
  rows: T[],
  columns: TableColumn<T>[],
  fileName = "export.xlsx",
  sheetName = "Sheet1"
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.addRow(columns.map((column) => column.title));
  rows.forEach((row) => {
    worksheet.addRow(
      columns.map((column) => {
        const raw = getValueByPath(row, String(column.dataIndex));
        const formatted = column.formatter ? column.formatter(raw, row) : raw;
        return toExportCellValue(formatted);
      })
    );
  });

  worksheet.columns = columns.map((column) => ({
    width: Math.max(column.title.length + 2, column.width || 12),
  }));
  worksheet.getRow(1).font = { bold: true };

  return saveWorkbookAsXlsx(workbook, fileName);
};

// Optional helper: export CSV (simple)
export const exportToCSV = <T extends object = ExportRow>(rows: T[], columns: TableColumn<T>[], fileName = "export.csv") => {
  const header = columns.map((c) => `"${c.title.replace(/"/g, '""')}"`).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
         const raw = getValueByPath(r, String(c.dataIndex));
          const formatted = c.formatter ? c.formatter(raw, r) : raw ?? "";
          const cell = String(formatted).replace(/"/g, '""');
          return `"${cell}"`;
        })
        .join(",")
    )
    .join("\n");

  const csv = header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  saveAs(blob, fileName);
};

export default {
  exportToPDF,
  exportToExcel,
  exportToCSV,
};





// Example lead export usage
// import React from "react";
// import { Button, Space } from "antd";
// import fileExport, { TableColumn } from "@/utils/fileExport";
// import type { LeadsManagement } from a domain model module;

// const sampleColumns: TableColumn<LeadsManagement>[] = [
//   { title: "Name", dataIndex: "username" },
//   { title: "Mobile", dataIndex: "mobile" },
//   { title: "Source", dataIndex: "source" },
//   { title: "Stage", dataIndex: "stage" },
//   { title: "Created At", dataIndex: "createdDate", formatter: (v) => (v ? new Date(v).toLocaleString() : "") },
// ];

// const sampleRows: LeadsManagement[] = [
//   { id: "1", username: "John Doe", mobile: "9876543210", source: "Website", stage: "NEW", createdDate: Date.now(), /* ...other fields*/ } as any,
//   { id: "2", username: "Jane Roe", mobile: "9123456780", source: "Facebook", stage: "ASSIGNED", createdDate: Date.now(), } as any,
// ];

// export default function LeadsExportExample() {
//   return (
//     <Space>
//       <Button
//         onClick={() =>
//           fileExport.exportToPDF(sampleRows, sampleColumns, "leads_export.pdf")
//         }
//       >
//         Download PDF
//       </Button>
//       <Button
//         onClick={() =>
//           fileExport.exportToExcel(sampleRows, sampleColumns, "leads_export.xlsx")
//         }
//       >
//         Download Excel
//       </Button>
//       <Button
//         onClick={() => fileExport.exportToCSV(sampleRows, sampleColumns, "leads.csv")}
//       >
//         Download CSV
//       </Button>
//     </Space>
//   );
// }
