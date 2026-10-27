import { ExcelJS, saveWorkbookAsXlsx } from "@/shared/utils/excelWorkbook";
import type { AddressRecord } from "../components/types.ts";
import { getAddressRecordStatuses, normalizeComparisonText } from "./addressCards.ts";

export const MAX_EXCEL_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_EXCEL_EXTENSIONS = [".xlsx"];
const MAX_HEADER_SCAN_ROWS = 20;

export type ImportLogicalField =
  | "name"
  | "mobile"
  | "fullAddress"
  | "category"
  | "city"
  | "source"
  | "company"
  | "addressLine1"
  | "addressLine2"
  | "state"
  | "pincode";

export type MappingConfidence = "high" | "medium" | "low" | "unmapped";

export interface ExcelImportColumn {
  id: string;
  index: number;
  label: string;
  originalHeading: string;
  samples: string[];
}

export interface ExcelColumnMapping {
  field: ImportLogicalField;
  columnId: string | null;
  confidence: MappingConfidence;
  reason: string;
}

export type ExcelColumnMappings = Record<
  ImportLogicalField,
  ExcelColumnMapping
>;

export interface WorksheetSummary {
  name: string;
  score: number;
  estimatedRecords: number;
  detectedHeaderRowIndex: number | null;
  isHeaderlessLeadFormat: boolean;
}

export interface AddressWorkbookSession {
  fileName: string;
  workbook: ExcelJS.Workbook;
  worksheetNames: string[];
  worksheetSummaries: WorksheetSummary[];
  suggestedWorksheetName: string;
}

export interface AddressWorksheetAnalysis {
  worksheetName: string;
  columns: ExcelImportColumn[];
  mappings: ExcelColumnMappings;
  dataRows: string[][];
  dataStartRowIndex: number;
  totalWorksheetRows: number;
  headerRowIndex: number | null;
  isHeaderlessLeadFormat: boolean;
  detectionConfidence: MappingConfidence;
  detectionMessage: string;
}

export interface AddressImportPreviewRow {
  sourceRowNumber: number;
  record: AddressRecord;
  statuses: ReturnType<typeof getAddressRecordStatuses>;
}

export interface AddressImportStats {
  totalExcelRows: number;
  validRows: number;
  emptyRows: number;
  duplicateRows: number;
  missingAddressRows: number;
  readyRows: number;
}

export interface AddressImportPreview {
  rows: AddressImportPreviewRow[];
  stats: AddressImportStats;
}

export interface AddressImportResult {
  records: AddressRecord[];
  skippedRows: number;
  worksheetName: string;
}

interface LogicalFieldDefinition {
  label: string;
  aliases: string[];
  addressRelated?: boolean;
}

export const IMPORT_FIELD_DEFINITIONS: Record<
  ImportLogicalField,
  LogicalFieldDefinition
> = {
  name: {
    label: "Business / customer name",
    aliases: [
      "name",
      "business name",
      "customer name",
      "client name",
      "party name",
      "recipient name",
      "contact person",
    ],
  },
  mobile: {
    label: "Mobile",
    aliases: [
      "mobile",
      "mobile number",
      "phone",
      "phone number",
      "contact",
      "contact number",
      "contact no",
    ],
  },
  fullAddress: {
    label: "Full address",
    addressRelated: true,
    aliases: [
      "address",
      "full address",
      "customer address",
      "delivery address",
      "shipping address",
      "billing address",
      "office address",
      "residential address",
      "permanent address",
      "current address",
      "location",
    ],
  },
  category: {
    label: "Business category",
    aliases: ["category", "business category", "type", "business type"],
  },
  city: {
    label: "City",
    addressRelated: true,
    aliases: ["city", "town", "village"],
  },
  source: {
    label: "Lead source",
    aliases: ["source", "lead source", "data source", "origin"],
  },
  company: {
    label: "Company",
    aliases: [
      "company",
      "company name",
      "business",
      "firm name",
      "organization",
    ],
  },
  addressLine1: {
    label: "Address line 1",
    addressRelated: true,
    aliases: [
      "address 1",
      "address line 1",
      "address1",
      "addressline1",
      "street address",
      "house no",
      "house number",
      "flat no",
      "flat number",
      "building",
      "street",
      "road",
    ],
  },
  addressLine2: {
    label: "Address line 2",
    addressRelated: true,
    aliases: [
      "address 2",
      "address line 2",
      "address2",
      "addressline2",
      "area",
      "locality",
      "landmark",
      "district",
      "taluka",
    ],
  },
  state: {
    label: "State",
    addressRelated: true,
    aliases: ["state", "province", "region"],
  },
  pincode: {
    label: "Pincode",
    addressRelated: true,
    aliases: [
      "pincode",
      "pin code",
      "pin",
      "postal code",
      "postcode",
      "zip",
      "zip code",
    ],
  },
};

export const IMPORT_LOGICAL_FIELDS = Object.keys(
  IMPORT_FIELD_DEFINITIONS,
) as ImportLogicalField[];

let fallbackId = 0;

export class AddressImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddressImportError";
  }
}

export function normalizeExcelHeading(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toCellString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function cleanAddress(value: unknown): string {
  return String(value ?? "")
    .replace(/[\uE000-\uF8FF]/g, "")
    .replace(/^(?:(?:îƒˆ|ðŸ“|ðŸ—º|📍|🗺️?|�)\s*)+/u, "")
    .replace(/\t+/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();
}

export function cleanPhone(value: unknown): string {
  const phone = String(value ?? "").trim();
  const hasPlus = phone.startsWith("+");
  const digits = phone.replace(/\D/g, "");

  return hasPlus && digits ? `+${digits}` : digits;
}

function createAddressId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  fallbackId += 1;
  return `address-${Date.now()}-${fallbackId}`;
}

function getWorksheetRows(worksheet: ExcelJS.Worksheet): string[][] {
  if (!worksheet.rowCount || !worksheet.columnCount) return [];

  return Array.from({ length: worksheet.rowCount }, (_, rowIndex) => {
    const row = worksheet.getRow(rowIndex + 1);

    return Array.from({ length: worksheet.columnCount }, (_, columnIndex) =>
      toCellString(row.getCell(columnIndex + 1).text),
    );
  });
}

function isRowEmpty(row: string[]): boolean {
  return row.every((value) => !value.trim());
}

function getPhoneDigitCount(value: string): number {
  return value.replace(/\D/g, "").length;
}

function looksPhoneLike(value: string): boolean {
  const digitCount = getPhoneDigitCount(value);
  return digitCount >= 7 && digitCount <= 15;
}

function getAddressValueScore(value: string): number {
  const normalized = normalizeComparisonText(value);
  if (!normalized) return 0;

  const terms = [
    "road",
    "street",
    "lane",
    "nagar",
    "colony",
    "society",
    "chowk",
    "marg",
    "layout",
    "phase",
    "sector",
    "taluka",
    "district",
    "near",
    "opposite",
    "behind",
    "shop",
    "flat",
    "building",
    "apartment",
  ];
  const termMatches = terms.filter((term) => normalized.includes(term)).length;
  let score = Math.min(4, termMatches * 1.2);

  const hasPostalCode = /\b\d{5,6}\b/.test(value);
  if (hasPostalCode) score += 1.5;
  if (hasPostalCode && value.length >= 35) score += 1;
  if (/\b(?:shop|flat|house|plot|building)\s*(?:no\.?\s*)?[a-z0-9/-]+/i.test(value)) {
    score += 1.5;
  }
  if (value.includes(",")) score += 1;
  if (/\r|\n/.test(value)) score += 1;
  if (normalized.split(" ").length >= 5 && score > 0) score += 0.5;

  return score;
}

function getHeaderMatchCount(row: string[]): number {
  const aliases = Object.values(IMPORT_FIELD_DEFINITIONS).flatMap(
    (definition) => definition.aliases,
  );
  const normalizedAliases = new Set(aliases.map(normalizeExcelHeading));

  return row.reduce(
    (count, cell) =>
      count + (normalizedAliases.has(normalizeExcelHeading(cell)) ? 1 : 0),
    0,
  );
}

function detectHeaderlessLeadFormat(rows: string[][]): {
  detected: boolean;
  score: number;
  firstDataRowIndex: number;
} {
  const firstDataRowIndex = rows
    .slice(0, MAX_HEADER_SCAN_ROWS)
    .findIndex(
      (row) =>
        Boolean(row[0]) &&
        looksPhoneLike(row[1] || "") &&
        !row[2] &&
        getAddressValueScore(row[3] || "") >= 2.5,
    );
  const samples = rows
    .slice(Math.max(0, firstDataRowIndex))
    .filter((row) => !isRowEmpty(row))
    .slice(0, 10);
  if (firstDataRowIndex < 0 || !samples.length) {
    return { detected: false, score: 0, firstDataRowIndex: 0 };
  }

  const ratio = (predicate: (row: string[]) => boolean) =>
    samples.filter(predicate).length / samples.length;
  const nameRatio = ratio(
    (row) => Boolean(row[0]) && !looksPhoneLike(row[0]) && row[0].length >= 3,
  );
  const phoneRatio = ratio((row) => looksPhoneLike(row[1] || ""));
  const blankThirdRatio = ratio((row) => !row[2]);
  const addressRatio = ratio((row) => getAddressValueScore(row[3] || "") >= 2.5);
  const categoryRatio = ratio((row) => Boolean(row[4]));
  const cityRatio = ratio(
    (row) => Boolean(row[5]) && !/\d/.test(row[5]) && row[5].length <= 50,
  );
  const sourceRatio = ratio((row) =>
    /google\s*maps|justdial|indiamart|facebook|instagram|referral|website/i.test(
      row[6] || "",
    ),
  );
  const score =
    nameRatio * 0.12 +
    phoneRatio * 0.2 +
    blankThirdRatio * 0.1 +
    addressRatio * 0.3 +
    categoryRatio * 0.08 +
    cityRatio * 0.08 +
    sourceRatio * 0.12;
  const hasLeadMetadataPattern =
    sourceRatio >= 0.5 || (categoryRatio >= 0.6 && cityRatio >= 0.6);
  const detected =
    nameRatio >= 0.6 &&
    phoneRatio >= 0.6 &&
    blankThirdRatio >= 0.6 &&
    addressRatio >= 0.6 &&
    hasLeadMetadataPattern &&
    score >= 0.72;

  return { detected, score, firstDataRowIndex };
}

function detectHeaderRow(rows: string[][]): {
  rowIndex: number | null;
  score: number;
} {
  let bestRowIndex: number | null = null;
  let bestScore = 0;

  rows.slice(0, MAX_HEADER_SCAN_ROWS).forEach((row, rowIndex) => {
    const nonEmpty = row.filter(Boolean);
    if (!nonEmpty.length) return;

    const headerMatches = getHeaderMatchCount(row);
    const uniqueRatio = new Set(nonEmpty.map(normalizeExcelHeading)).size / nonEmpty.length;
    const textRatio = nonEmpty.filter((cell) => !looksPhoneLike(cell)).length / nonEmpty.length;
    const followingRows = rows
      .slice(rowIndex + 1, rowIndex + 5)
      .filter((candidate) => !isRowEmpty(candidate));
    const looksLikeData = row.some(looksPhoneLike) || row.some((cell) => getAddressValueScore(cell) >= 2.5);
    const score =
      headerMatches * 10 +
      Math.min(nonEmpty.length, 8) +
      uniqueRatio * 3 +
      textRatio * 2 +
      Math.min(followingRows.length, 3) * 2 -
      (looksLikeData ? 8 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = rowIndex;
    }
  });

  if (bestRowIndex === null) return { rowIndex: null, score: 0 };
  const bestMatches = getHeaderMatchCount(rows[bestRowIndex]);
  if (bestMatches === 0 && bestScore < 11) return { rowIndex: null, score: bestScore };

  return { rowIndex: bestRowIndex, score: bestScore };
}

function columnName(index: number): string {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function buildColumns(
  rows: string[][],
  headerRowIndex: number | null,
  explicitDataStartRowIndex?: number,
): ExcelImportColumn[] {
  const dataStartRowIndex =
    explicitDataStartRowIndex ??
    (headerRowIndex === null ? 0 : headerRowIndex + 1);
  const maximumColumns = rows.reduce(
    (maximum, row) => Math.max(maximum, row.length),
    0,
  );

  return Array.from({ length: maximumColumns }, (_, index) => {
    const heading = headerRowIndex === null ? "" : rows[headerRowIndex]?.[index] || "";
    const samples = rows
      .slice(dataStartRowIndex)
      .map((row) => row[index] || "")
      .filter(Boolean)
      .slice(0, 8);
    const letter = columnName(index);

    return {
      id: `column-${index}`,
      index,
      label: heading ? `${heading} (Column ${letter})` : `Column ${letter}`,
      originalHeading: heading,
      samples,
    };
  }).filter((column) => column.originalHeading || column.samples.length);
}

function emptyMappings(): ExcelColumnMappings {
  return Object.fromEntries(
    IMPORT_LOGICAL_FIELDS.map((field) => [
      field,
      {
        field,
        columnId: null,
        confidence: "unmapped",
        reason: "No matching column detected",
      },
    ]),
  ) as ExcelColumnMappings;
}

function autoMapColumns(
  columns: ExcelImportColumn[],
  isHeaderlessLeadFormat: boolean,
): ExcelColumnMappings {
  const mappings = emptyMappings();

  if (isHeaderlessLeadFormat) {
    const fixedColumns: Partial<Record<ImportLogicalField, number>> = {
      name: 0,
      mobile: 1,
      fullAddress: 3,
      category: 4,
      city: 5,
      source: 6,
    };

    Object.entries(fixedColumns).forEach(([field, columnIndex]) => {
      const column = columns.find((candidate) => candidate.index === columnIndex);
      if (!column) return;
      const logicalField = field as ImportLogicalField;
      mappings[logicalField] = {
        field: logicalField,
        columnId: column.id,
        confidence: "high",
        reason: "Confident headerless seven-column lead format",
      };
    });

    return mappings;
  }

  const usedColumnIds = new Set<string>();
  IMPORT_LOGICAL_FIELDS.forEach((field) => {
    const normalizedAliases = IMPORT_FIELD_DEFINITIONS[field].aliases.map(
      normalizeExcelHeading,
    );
    const exactColumn = columns.find(
      (column) =>
        !usedColumnIds.has(column.id) &&
        normalizedAliases.includes(normalizeExcelHeading(column.originalHeading)),
    );

    if (exactColumn) {
      mappings[field] = {
        field,
        columnId: exactColumn.id,
        confidence: "high",
        reason: "Exact normalized header match",
      };
      usedColumnIds.add(exactColumn.id);
    }
  });

  const hasMappedAddress = ([
    "fullAddress",
    "addressLine1",
    "addressLine2",
  ] as ImportLogicalField[]).some(
    (field) => mappings[field].columnId,
  );

  if (!hasMappedAddress) {
    const addressCandidates = columns
      .filter((column) => !usedColumnIds.has(column.id))
      .map((column) => ({
        column,
        score:
          column.samples.reduce(
            (total, sample) => total + getAddressValueScore(sample),
            0,
          ) / Math.max(1, column.samples.length),
      }))
      .sort((left, right) => right.score - left.score);
    const bestCandidate = addressCandidates[0];

    if (bestCandidate?.score >= 2.5) {
      mappings.fullAddress = {
        field: "fullAddress",
        columnId: bestCandidate.column.id,
        confidence: "medium",
        reason: "Address-like sample values detected; please review",
      };
    } else if (bestCandidate?.score >= 1.5) {
      mappings.fullAddress = {
        field: "fullAddress",
        columnId: null,
        confidence: "low",
        reason: `Possible address column: ${bestCandidate.column.label}`,
      };
    }
  }

  return mappings;
}

function analyzeRows(
  worksheetName: string,
  rows: string[][],
  headerRowOverride: number | null | "auto" = "auto",
): AddressWorksheetAnalysis {
  const headerlessResult = detectHeaderlessLeadFormat(rows);
  const detectedHeader = detectHeaderRow(rows);
  const useHeaderlessLeadFormat =
    headerRowOverride === "auto" && headerlessResult.detected;
  const headerRowIndex =
    headerRowOverride === "auto"
      ? useHeaderlessLeadFormat
        ? null
        : detectedHeader.rowIndex
      : headerRowOverride;
  const dataStartRowIndex = useHeaderlessLeadFormat
    ? headerlessResult.firstDataRowIndex
    : headerRowIndex === null
      ? 0
      : headerRowIndex + 1;
  const columns = buildColumns(rows, headerRowIndex, dataStartRowIndex);
  const mappings = autoMapColumns(columns, useHeaderlessLeadFormat);

  return {
    worksheetName,
    columns,
    mappings,
    dataRows: rows.slice(dataStartRowIndex),
    dataStartRowIndex,
    totalWorksheetRows: rows.length,
    headerRowIndex,
    isHeaderlessLeadFormat: useHeaderlessLeadFormat,
    detectionConfidence: useHeaderlessLeadFormat
      ? "high"
      : headerRowIndex === null
        ? "low"
        : "high",
    detectionMessage: useHeaderlessLeadFormat
      ? "Detected the headerless A–G lead export: name, mobile, blank column, address, category, city and source."
      : headerRowIndex === null
        ? "No reliable header row was found. Review the column mapping before importing."
        : `Detected row ${headerRowIndex + 1} as the header row.`,
  };
}

export function validateExcelFile(file: File): void {
  const dotIndex = file.name.lastIndexOf(".");
  const extension = dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : "";

  if (!ACCEPTED_EXCEL_EXTENSIONS.includes(extension)) {
    throw new AddressImportError("Please upload an Excel file in .xlsx format.");
  }

  if (file.size > MAX_EXCEL_FILE_SIZE) {
    throw new AddressImportError("The Excel file must be 5 MB or smaller.");
  }
}

export async function analyzeAddressWorkbook(
  file: File,
): Promise<AddressWorkbookSession> {
  validateExcelFile(file);

  const workbook = new ExcelJS.Workbook();

  try {
    const workbookData = await file.arrayBuffer();
    // ExcelJS supports ArrayBuffer in browsers, although its declaration uses Node's Buffer.
    await workbook.xlsx.load(workbookData as never);
  } catch {
    throw new AddressImportError(
      "The Excel file could not be read. Make sure it is a valid .xlsx workbook.",
    );
  }

  const worksheetNames = workbook.worksheets.map((worksheet) => worksheet.name);

  if (!worksheetNames.length) {
    throw new AddressImportError("The Excel file does not contain a worksheet.");
  }

  const worksheetSummaries = workbook.worksheets.map((worksheet) => {
    const name = worksheet.name;
    const rows = getWorksheetRows(worksheet);
    const analysis = analyzeRows(name, rows);
    const nonEmptyRows = analysis.dataRows.filter((row) => !isRowEmpty(row)).length;
    const mappedFields = IMPORT_LOGICAL_FIELDS.filter(
      (field) => analysis.mappings[field].columnId,
    ).length;

    return {
      name,
      score:
        (analysis.isHeaderlessLeadFormat ? 100 : 0) +
        mappedFields * 10 +
        Math.min(nonEmptyRows, 25),
      estimatedRecords: nonEmptyRows,
      detectedHeaderRowIndex: analysis.headerRowIndex,
      isHeaderlessLeadFormat: analysis.isHeaderlessLeadFormat,
    } satisfies WorksheetSummary;
  });
  const suggestedWorksheet = [...worksheetSummaries].sort(
    (left, right) => right.score - left.score,
  )[0];

  if (!suggestedWorksheet || suggestedWorksheet.estimatedRecords === 0) {
    throw new AddressImportError("No data rows were found in the workbook.");
  }

  return {
    fileName: file.name,
    workbook,
    worksheetNames,
    worksheetSummaries,
    suggestedWorksheetName: suggestedWorksheet.name,
  };
}

export function analyzeAddressWorksheet(
  session: AddressWorkbookSession,
  worksheetName: string,
  headerRowOverride: number | null | "auto" = "auto",
): AddressWorksheetAnalysis {
  const worksheet = session.workbook.getWorksheet(worksheetName);
  if (!worksheet || !worksheet.rowCount || !worksheet.columnCount) {
    throw new AddressImportError("The selected worksheet is empty.");
  }

  return analyzeRows(
    worksheetName,
    getWorksheetRows(worksheet),
    headerRowOverride,
  );
}

function getMappedValue(
  row: string[],
  columnsById: Map<string, ExcelImportColumn>,
  mapping: ExcelColumnMapping,
): string {
  if (!mapping.columnId) return "";
  const column = columnsById.get(mapping.columnId);
  return column ? row[column.index] || "" : "";
}

function appendUniqueAddressPart(parts: string[], value: string): void {
  const cleaned = cleanAddress(value);
  if (!cleaned) return;
  const normalized = normalizeComparisonText(cleaned);
  const existingAddress = normalizeComparisonText(parts.join(" "));

  if (!normalized || existingAddress.includes(normalized)) return;
  parts.push(cleaned);
}

function createRecordFromRow(
  row: string[],
  columnsById: Map<string, ExcelImportColumn>,
  mappings: ExcelColumnMappings,
): AddressRecord {
  const read = (field: ImportLogicalField) =>
    getMappedValue(row, columnsById, mappings[field]);
  const name = toCellString(read("name"));
  const company = toCellString(read("company"));
  const addressLine1 = cleanAddress(read("addressLine1"));
  const addressLine2 = cleanAddress(read("addressLine2"));
  const city = cleanAddress(read("city"));
  const state = cleanAddress(read("state"));
  const pincode = toCellString(read("pincode"));
  const fullAddressParts: string[] = [];
  const mappedFullAddress = cleanAddress(read("fullAddress"));

  appendUniqueAddressPart(fullAddressParts, mappedFullAddress);
  appendUniqueAddressPart(fullAddressParts, addressLine1);
  appendUniqueAddressPart(fullAddressParts, addressLine2);
  const hasBaseAddress = fullAddressParts.length > 0;

  if (hasBaseAddress && !mappedFullAddress) {
    appendUniqueAddressPart(fullAddressParts, city);
  }
  if (hasBaseAddress) appendUniqueAddressPart(fullAddressParts, state);

  if (
    hasBaseAddress &&
    pincode &&
    !normalizeComparisonText(fullAddressParts.join(" ")).includes(
      normalizeComparisonText(pincode),
    )
  ) {
    fullAddressParts.push(pincode);
  }

  return {
    id: createAddressId(),
    name,
    company,
    fullAddress: cleanAddress(fullAddressParts.join(", ")),
    addressLine1,
    addressLine2,
    city,
    state,
    pincode,
    mobile: cleanPhone(read("mobile")),
    category: toCellString(read("category")),
    source: toCellString(read("source")),
    selected: true,
  };
}

function getDuplicateKey(record: AddressRecord): string {
  const name = normalizeComparisonText(record.name);
  const phone = record.mobile.replace(/\D/g, "");
  const address = normalizeComparisonText(record.fullAddress);
  return [name, phone, address].join("|");
}

export function hasUsableAddressMapping(mappings: ExcelColumnMappings): boolean {
  return (["fullAddress", "addressLine1", "addressLine2"] as ImportLogicalField[]).some(
    (field) => mappings[field].columnId,
  );
}

export function createAddressImportPreview(
  analysis: AddressWorksheetAnalysis,
  mappings: ExcelColumnMappings,
): AddressImportPreview {
  const columnsById = new Map(
    analysis.columns.map((column) => [column.id, column]),
  );
  const seenDuplicateKeys = new Set<string>();
  const previewRows: AddressImportPreviewRow[] = [];
  let emptyRows = 0;
  let validRows = 0;
  let duplicateRows = 0;
  let missingAddressRows = 0;

  analysis.dataRows.forEach((row, rowIndex) => {
    if (isRowEmpty(row)) {
      emptyRows += 1;
      return;
    }

    const record = createRecordFromRow(row, columnsById, mappings);
    const hasAddress = Boolean(
      record.fullAddress || record.addressLine1 || record.addressLine2,
    );
    const valid = Boolean(record.name || hasAddress);
    const duplicateKey = getDuplicateKey(record);
    const isDuplicate =
      Boolean(record.name || record.mobile || record.fullAddress) &&
      seenDuplicateKeys.has(duplicateKey);

    if (!seenDuplicateKeys.has(duplicateKey)) seenDuplicateKeys.add(duplicateKey);
    if (valid) validRows += 1;
    if (!hasAddress) missingAddressRows += 1;
    if (isDuplicate) duplicateRows += 1;

    record.possibleDuplicate = isDuplicate;
    record.selected = hasAddress && valid && !isDuplicate;
    previewRows.push({
      sourceRowNumber: analysis.dataStartRowIndex + rowIndex + 1,
      record,
      statuses: getAddressRecordStatuses(record),
    });
  });

  return {
    rows: previewRows,
    stats: {
      totalExcelRows: analysis.dataRows.length,
      validRows,
      emptyRows,
      duplicateRows,
      missingAddressRows,
      readyRows: previewRows.filter((row) => row.record.selected).length,
    },
  };
}

export async function parseAddressExcelFile(
  file: File,
): Promise<AddressImportResult> {
  const session = await analyzeAddressWorkbook(file);
  const analysis = analyzeAddressWorksheet(
    session,
    session.suggestedWorksheetName,
  );
  const preview = createAddressImportPreview(analysis, analysis.mappings);

  if (!hasUsableAddressMapping(analysis.mappings)) {
    throw new AddressImportError(
      "No reliable address column was detected. Review the column mapping before importing.",
    );
  }

  const records = preview.rows.map((row) => row.record);
  if (!records.length) {
    throw new AddressImportError("No usable records were found in the selected worksheet.");
  }

  return {
    records,
    skippedRows: preview.stats.emptyRows,
    worksheetName: analysis.worksheetName,
  };
}

export async function downloadAddressExcelTemplate(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Addresses");

  worksheet.columns = [
    { header: "Name", key: "name", width: 22 },
    { header: "Company", key: "company", width: 24 },
    { header: "FullAddress", key: "fullAddress", width: 64 },
    { header: "Category", key: "category", width: 24 },
    { header: "City", key: "city", width: 18 },
    { header: "Source", key: "source", width: 18 },
    { header: "Mobile", key: "mobile", width: 18 },
  ];
  worksheet.addRow({
    name: "Rahul Sharma",
    company: "ABC Traders",
    fullAddress:
      "Shop No. 12, MG Road, Near Central Mall, Pune, Maharashtra 411001",
    category: "Wholesale trader",
    city: "Pune",
    source: "Google Maps",
    mobile: "9876543210",
  });

  await saveWorkbookAsXlsx(workbook, "address-card-template.xlsx");
}
