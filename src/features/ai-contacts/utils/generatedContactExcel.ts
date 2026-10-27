import ExcelJS from "exceljs";

export type ContactCellValue = string | number | boolean | null;

export interface GeneratedContactField {
  header: string;
  field: string;
  value: ContactCellValue;
}

export interface GeneratedContactRow {
  rowNumber: number;
  values: Record<string, ContactCellValue>;
  excelFields: GeneratedContactField[];
}

export interface GeneratedContactPreview {
  fileName: string;
  worksheetName: string;
  headers: string[];
  fieldNames: string[];
  rows: GeneratedContactRow[];
  skippedEmptyRows: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const RESERVED_FIELDS = new Set([
  "id",
  "excelfields",
  "importmetadata",
  "assignedto",
  "assignedtoname",
  "assigneduserid",
  "assignedusername",
  "assignedemployeecode",
  "assignment",
  "uploadedby",
  "uploadedat",
  "uploadeddate",
  "uploadedtime",
  "uploadeddatetime",
  "importid",
  "filename",
  "worksheetname",
  "excelrownumber",
]);

const MOBILE_HEADER_ALIASES = new Set([
  "phone",
  "phone number",
  "phone no",
  "phone_number",
  "number",
  "contact",
  "contact number",
  "contact no",
  "mobile",
  "mobile number",
  "mobile no",
]);

const CANONICAL_HEADER_ALIASES: Record<string, string> = {
  name: "name",
  "business name": "name",
  "company name": "name",
  company: "name",
  contact_name: "name",
  full_name: "name",
  email: "email",
  "email address": "email",
  email_id: "email",
  address: "address",
  "full address": "address",
  category: "category",
  "business category": "category",
  city: "city",
  location: "city",
  source: "source",
  platform: "source",
};

const HEADERLESS_CONTACT_COLUMNS = [
  "Name",
  "Mobile",
  "Address",
  "Category",
  "City",
  "Source",
] as const;

const HEADERLESS_CONTACT_COLUMNS_WITH_EMAIL = [
  "Name",
  "Mobile",
  "Email",
  "Address",
  "Category",
  "City",
  "Source",
] as const;

const headerlessContactHeaders = (firstRow: string[], columnCount: number) => {
  const includesEmailColumn =
    columnCount >= HEADERLESS_CONTACT_COLUMNS_WITH_EMAIL.length ||
    (firstRow[2] ?? "").includes("@");
  const knownHeaders = includesEmailColumn
    ? HEADERLESS_CONTACT_COLUMNS_WITH_EMAIL
    : HEADERLESS_CONTACT_COLUMNS;

  return Array.from(
    { length: columnCount },
    (_, index) => knownHeaders[index] ?? `Column ${index + 1}`,
  );
};

const normalizedHeader = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, " ");

const looksLikeMobile = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

const isHeaderlessGeneratedContactSheet = (firstRow: string[]) => {
  if (firstRow.length < 2) return false;

  // Generated Google Maps contact files commonly start immediately with
  // name + mobile + address and do not contain a heading row.
  const secondCell = firstRow[1] ?? "";
  const thirdCell = (firstRow[2] ?? "").toLowerCase();
  return (
    looksLikeMobile(secondCell) ||
    (thirdCell.length > 25 && /\d/.test(thirdCell))
  );
};

const canonicalFieldName = (header: string, index: number) => {
  const original = header.trim() || `Column ${index + 1}`;
  const normalized = normalizedHeader(original);
  if (MOBILE_HEADER_ALIASES.has(normalized)) return "mobile";
  return CANONICAL_HEADER_ALIASES[normalized] ?? original;
};

const cellValueToStorageValue = (value: ExcelJS.CellValue): ContactCellValue => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object") {
    if ("result" in value && value.result !== undefined) {
      return cellValueToStorageValue(value.result as ExcelJS.CellValue);
    }
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("error" in value) return String(value.error);
  }
  return String(value);
};

const makeUniqueFieldNames = (headers: string[]) => {
  const used = new Set<string>();

  return headers.map((header, index) => {
    const original = canonicalFieldName(header, index);
    let candidate = original;
    let suffix = 2;

    while (
      used.has(candidate.toLowerCase()) ||
      RESERVED_FIELDS.has(candidate.toLowerCase()) ||
      /^__.*__$/.test(candidate)
    ) {
      candidate = `${original} (${suffix})`;
      suffix += 1;
    }

    used.add(candidate.toLowerCase());
    return candidate;
  });
};

export async function parseGeneratedContactWorkbook(
  file: File,
): Promise<GeneratedContactPreview> {
  if (!/\.xls[xm]$/i.test(file.name)) {
    throw new Error("Please upload an Excel workbook in .xlsx or .xlsm format.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("The Excel workbook must be 10 MB or smaller.");
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load((await file.arrayBuffer()) as never);
  } catch {
    throw new Error("The workbook could not be read. Upload a valid Excel file.");
  }

  const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 1);
  if (!worksheet) throw new Error("The workbook does not contain any contact rows.");

  const columnCount = worksheet.actualColumnCount || worksheet.columnCount;
  const firstRow = worksheet.getRow(1);
  const firstRowValues = Array.from({ length: columnCount }, (_, index) => {
    const value = cellValueToStorageValue(firstRow.getCell(index + 1).value);
    return String(value ?? "").trim();
  });
  const headerless = isHeaderlessGeneratedContactSheet(firstRowValues);
  const headers = headerless
    ? headerlessContactHeaders(firstRowValues, columnCount)
    : firstRowValues.map((value, index) => value || `Column ${index + 1}`);
  const fieldNames = makeUniqueFieldNames(headers);
  const rows: GeneratedContactRow[] = [];
  let skippedEmptyRows = 0;

  for (
    let rowNumber = headerless ? 1 : 2;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const cells = fieldNames.map((_, index) =>
      cellValueToStorageValue(worksheetRow.getCell(index + 1).value),
    );
    const isEmpty = cells.every(
      (value) => value === null || (typeof value === "string" && value.trim() === ""),
    );
    if (isEmpty) {
      skippedEmptyRows += 1;
      continue;
    }

    const values = Object.fromEntries(
      fieldNames.map((field, index) => [field, cells[index]]),
    );
    rows.push({
      rowNumber,
      values,
      excelFields: fieldNames.map((field, index) => ({
        header: headers[index],
        field,
        value: cells[index],
      })),
    });
  }

  if (!rows.length) throw new Error("No non-empty contact rows were found in the workbook.");

  return {
    fileName: file.name,
    worksheetName: worksheet.name,
    headers,
    fieldNames,
    rows,
    skippedEmptyRows,
  };
}
