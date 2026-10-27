import type {
  AddressCardSettings,
  AddressRecord,
} from "../components/types.ts";
import { toTitleCase } from "@/shared/utils/helperFunctions";

export const CARDS_PER_PAGE = 10;
export const CARD_WIDTH_MM = 92;
export const CARD_HEIGHT_MM = 52;
export const CARD_GAP_MM = 5;
export const PAGE_MARGIN_MM = 10;
export const ADDRESS_CARD_TITLE = "EXCLUSIVE INVITE";

export const ADDRESS_PAGE_LAYOUT = {
  pageWidth: 210,
  pageHeight: 297,
  columns: 2,
  rows: 5,
  cellWidth: CARD_WIDTH_MM,
  cellHeight: CARD_HEIGHT_MM,
  columnGap: CARD_GAP_MM,
  rowGap: CARD_GAP_MM,
  offsetX: PAGE_MARGIN_MM,
  offsetY: PAGE_MARGIN_MM,
} as const;

export const DEFAULT_ADDRESS_CARD_SETTINGS: AddressCardSettings = {
  showMobile: true,
  showBorder: true,
  showCategory: false,
  showCitySeparately: false,
  showSource: false,
  fontSize: 8.5,
  textAlign: "left",
  paddingMm: 5,
  orientation: "portrait",
};

export interface AddressCardContent {
  companyName: string;
  address: string;
  phone: string;
  metadata: string[];
}

export interface AddressDisplayLine {
  key: string;
  text: string;
  bold?: boolean;
  spacingBeforeMm?: number;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export function formatCityStatePincode(address: AddressRecord): string {
  const cityAndState = [address.city, address.state].filter(Boolean).join(", ");

  if (cityAndState && address.pincode) {
    return `${cityAndState} - ${address.pincode}`;
  }

  return cityAndState || address.pincode;
}

export function getAddressCardContent(
  address: AddressRecord,
  settings: AddressCardSettings,
): AddressCardContent {
  const fullAddressLines = (address.fullAddress || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const location = formatCityStatePincode(address);
  const legacyAddressLines = [
    address.addressLine1,
    address.addressLine2,
    location,
  ]
    .map((line) => line.trim())
    .filter(Boolean);
  const postalAddress = (fullAddressLines.length
    ? fullAddressLines
    : legacyAddressLines
  ).join("\n");
  const normalizedAddress = normalizeComparisonText(postalAddress);
  const normalizedCity = normalizeComparisonText(address.city);
  const metadata = [
    settings.showCategory && address.category
      ? `Category: ${address.category}`
      : "",
    settings.showCitySeparately &&
    address.city &&
    (!normalizedCity || !normalizedAddress.includes(normalizedCity))
      ? `City: ${address.city}`
      : "",
    settings.showSource && address.source ? `Source: ${address.source}` : "",
  ].filter(Boolean);

  return {
    companyName: address.company || address.name || "Unnamed recipient",
    address: postalAddress,
    phone: settings.showMobile ? address.mobile : "",
    metadata,
  };
}

export function getAddressDisplayLines(
  address: AddressRecord,
  settings: AddressCardSettings,
): AddressDisplayLine[] {
  const location = formatCityStatePincode(address);
  const fullAddressLines = (address.fullAddress || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const legacyAddressLines = [address.addressLine1, address.addressLine2].filter(
    Boolean,
  );
  const postalAddressLines = fullAddressLines.length
    ? fullAddressLines
    : [...legacyAddressLines, location].filter(Boolean);
  const normalizedFullAddress = normalizeComparisonText(
    [...fullAddressLines, ...legacyAddressLines, location].join(" "),
  );
  const normalizedCity = normalizeComparisonText(address.city);
  const shouldShowSeparateCity = Boolean(
    settings.showCitySeparately &&
      address.city &&
      (!normalizedCity || !normalizedFullAddress.includes(normalizedCity)),
  );
  const lines: Array<AddressDisplayLine | null> = [
    address.name
      ? { key: "name", text: toTitleCase(address.name), bold: true }
      : null,
    address.company
      ? { key: "company", text: toTitleCase(address.company) }
      : null,
    ...postalAddressLines.map((text, index) => ({
      key: `postalAddress-${index}`,
      text,
      spacingBeforeMm: index === 0 ? 1.2 : undefined,
    })),
    settings.showCategory && address.category
      ? { key: "category", text: `Category: ${address.category}` }
      : null,
    shouldShowSeparateCity
      ? { key: "city", text: `City: ${address.city}` }
      : null,
    settings.showSource && address.source
      ? { key: "source", text: `Source: ${address.source}` }
      : null,
    settings.showMobile && address.mobile
      ? {
          key: "mobile",
          text: `Mobile: ${address.mobile}`,
          spacingBeforeMm: 1.2,
        }
      : null,
  ];

  return lines.filter((line): line is AddressDisplayLine => Boolean(line));
}

export function getPreviewFontSize(
  address: AddressRecord,
  requestedFontSize: number,
  settings: AddressCardSettings,
): number {
  const contentLength = getAddressDisplayLines(address, settings).reduce(
    (total, line) => total + line.text.length,
    0,
  );

  if (contentLength > 300) return Math.max(6, requestedFontSize - 3);
  if (contentLength > 220) return Math.max(6.5, requestedFontSize - 2);
  if (contentLength > 150) return Math.max(7, requestedFontSize - 1);
  return requestedFontSize;
}

export function normalizeComparisonText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAddressContentLikelyTooLong(
  address: AddressRecord,
  settings: AddressCardSettings = DEFAULT_ADDRESS_CARD_SETTINGS,
): boolean {
  const content = getAddressCardContent(address, settings);
  const fontScale = settings.fontSize / 8.5;
  const usableWidth = Math.max(1, CARD_WIDTH_MM - settings.paddingMm * 2);
  const widthScale = usableWidth / (CARD_WIDTH_MM - 10);
  const companyCharactersPerLine = Math.max(
    1,
    Math.floor((39 * widthScale) / fontScale),
  );
  const addressCharactersPerLine = Math.max(
    1,
    Math.floor((53 * widthScale) / fontScale),
  );
  const companyLineCount = Math.max(
    1,
    Math.ceil(content.companyName.length / companyCharactersPerLine),
  );
  const addressLineCount = Math.max(
    1,
    content.address
      .split(/\r?\n/)
      .reduce(
        (lineCount, line) =>
          lineCount + Math.max(1, Math.ceil(line.length / addressCharactersPerLine)),
        0,
      ),
  );

  const visibleCompanyLines = Math.min(2, companyLineCount);
  const visibleAddressLines = content.address
    ? Math.min(3, addressLineCount)
    : 0;
  const textHeightMm =
    (10 + visibleCompanyLines * 13 + visibleAddressLines * 10) *
    fontScale *
    0.352778;
  const optionalHeightMm =
    (content.metadata.length ? 0.8 + 8 * fontScale * 0.352778 : 0) +
    (content.phone ? 2 + 11 * fontScale * 0.352778 : 0);
  const spacingHeightMm = 1.5 + (content.address ? 1.4 : 0);
  const totalHeightMm =
    settings.paddingMm * 2 + textHeightMm + optionalHeightMm + spacingHeightMm;

  return (
    companyLineCount > 2 ||
    addressLineCount > 3 ||
    totalHeightMm > CARD_HEIGHT_MM
  );
}

export type AddressRecordStatus =
  | "Ready"
  | "Missing address"
  | "Missing mobile"
  | "Invalid mobile"
  | "Possible duplicate"
  | "Content too long";

export function getAddressRecordStatuses(
  address: AddressRecord,
): AddressRecordStatus[] {
  const statuses: AddressRecordStatus[] = [];

  if (!address.fullAddress && !address.addressLine1 && !address.addressLine2) {
    statuses.push("Missing address");
  }

  if (!address.mobile) {
    statuses.push("Missing mobile");
  } else {
    const digitCount = address.mobile.replace(/\D/g, "").length;
    if (digitCount < 7 || digitCount > 15) statuses.push("Invalid mobile");
  }

  if (address.possibleDuplicate) statuses.push("Possible duplicate");
  if (isAddressContentLikelyTooLong(address)) statuses.push("Content too long");

  return statuses.length ? statuses : ["Ready"];
}

export function getAddressPageCount(cardCount: number): number {
  return Math.ceil(cardCount / CARDS_PER_PAGE);
}

export function getPageLayout() {
  return ADDRESS_PAGE_LAYOUT;
}
