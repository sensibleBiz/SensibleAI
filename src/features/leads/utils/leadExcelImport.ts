import type { CellValue, Worksheet } from "exceljs";
import ExcelJS from "exceljs";
import type { BulkLeadImportItem } from "../api/leadApi";

export const LEAD_IMPORT_HEADERS = [
  "id",
  "created_time",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "form_id",
  "form_name",
  "is_organic",
  "platform",
  "full_name",
  "phone_number",
  "city",
  "inbox_url",
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5_000;

export interface InvalidLeadImportRow {
  rowNumber: number;
  name: string;
  phone: string;
  reasons: string[];
}

export interface LeadImportPreview {
  fileName: string;
  worksheetName: string;
  totalRows: number;
  validRows: BulkLeadImportItem[];
  invalidRows: InvalidLeadImportRow[];
}

export class LeadImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadImportError";
  }
}

const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[\s-]+/g, "_");

const readCellText = (value: CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value) return readCellText(value.result as CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
};

const worksheetRows = (worksheet: Worksheet) => {
  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      values.push(readCellText(row.getCell(column).value));
    }
    rows.push(values);
  });
  return rows;
};

const normalizeMobile = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

const parseSource = (platform: string): BulkLeadImportItem["source"] => {
  const normalized = platform.trim().toLowerCase();
  if (normalized === "fb" || normalized === "facebook") return "Facebook";
  if (normalized === "ig" || normalized === "instagram") return "Instagram";
  return "Other";
};

const parseCreatedAt = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const isEmptyRow = (row: string[]) => row.every((value) => !value.trim());

export async function parseLeadImportWorkbook(file: File): Promise<LeadImportPreview> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new LeadImportError("Please upload an Excel file in .xlsx format.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new LeadImportError("The Excel file must be 10 MB or smaller.");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new LeadImportError("The workbook could not be read. Upload a valid .xlsx file.");
  }

  const worksheet = workbook.worksheets.find((sheet) => sheet.rowCount > 1);
  if (!worksheet) throw new LeadImportError("No lead rows were found in the workbook.");

  const rows = worksheetRows(worksheet);
  const headerRow = rows[0] ?? [];
  const columnByHeader = new Map(
    headerRow.map((header, index) => [normalizeHeader(header), index]),
  );
  const missingHeaders = LEAD_IMPORT_HEADERS.filter(
    (header) => !columnByHeader.has(header),
  );
  if (missingHeaders.length > 0) {
    throw new LeadImportError(
      `The Excel format is not valid. Missing columns: ${missingHeaders.join(", ")}.`,
    );
  }

  const dataRows = rows.slice(1).filter((row) => !isEmptyRow(row));
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new LeadImportError(
      `This workbook contains ${dataRows.length} rows. Import a maximum of ${MAX_IMPORT_ROWS} rows at a time.`,
    );
  }

  const validRows: BulkLeadImportItem[] = [];
  const invalidRows: InvalidLeadImportRow[] = [];
  const externalIds = new Set<string>();
  const valueAt = (row: string[], header: (typeof LEAD_IMPORT_HEADERS)[number]) =>
    row[columnByHeader.get(header) as number]?.trim() ?? "";

  dataRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const externalId = valueAt(row, "id");
    const adId = valueAt(row, "ad_id");
    const customerName = valueAt(row, "full_name");
    const rawPhone = valueAt(row, "phone_number");
    const mobile = normalizeMobile(rawPhone);
    const createdTime = valueAt(row, "created_time");
    const originalCreatedAt = parseCreatedAt(createdTime);
    const adName = valueAt(row, "ad_name");
    const campaignName = valueAt(row, "campaign_name");
    const formName = valueAt(row, "form_name");
    const reasons: string[] = [];

    if (!externalId) reasons.push("Lead ID is missing");
    else if (externalIds.has(externalId)) reasons.push("Duplicate lead ID in this file");
    if (!customerName) reasons.push("Full name is missing");
    if (!/^\d{10}$/.test(mobile)) reasons.push("Phone number must contain at least 10 digits");
    if (!originalCreatedAt) reasons.push("Created time is invalid");

    if (reasons.length > 0) {
      invalidRows.push({ rowNumber, name: customerName, phone: rawPhone, reasons });
      return;
    }

    externalIds.add(externalId);
    validRows.push({
      rowNumber,
      externalId,
      adId,
      originalCreatedAt,
      customerName,
      mobile,
      city: valueAt(row, "city"),
      source: parseSource(valueAt(row, "platform")),
      requirement: adName || formName || "Bulk Excel Lead",
      leadCampaign: adName || campaignName || formName,
      inboxUrl: valueAt(row, "inbox_url"),
    });
  });

  return {
    fileName: file.name,
    worksheetName: worksheet.name,
    totalRows: dataRows.length,
    validRows,
    invalidRows,
  };
}

export async function downloadLeadImportTemplate() {
  const { saveWorkbookAsXlsx } = await import("@/shared/utils/excelWorkbook");
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Bulk Leads");
  worksheet.addRow([...LEAD_IMPORT_HEADERS]);
  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" },
  };
  worksheet.columns = LEAD_IMPORT_HEADERS.map((name) => ({
    header: name,
    key: name,
    width: Math.max(name.length + 4, 16),
  }));
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  await saveWorkbookAsXlsx(workbook, "bulk-lead-import-template.xlsx");
}
