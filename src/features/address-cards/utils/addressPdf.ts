import { jsPDF } from "jspdf";
import type {
  AddressCardSettings,
  AddressRecord,
} from "../components/types.ts";
import {
  ADDRESS_CARD_TITLE,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
  CARDS_PER_PAGE,
  chunkArray,
  getAddressCardContent,
  getPageLayout,
} from "./addressCards.ts";

const POINT_TO_MM = 0.352778;
const TITLE_RED = [198, 40, 40] as const;

interface PdfTextStyle {
  fontSize: number;
  fontStyle: "normal" | "bold";
  lineHeightPt: number;
  maxLines: number;
}

function truncateToWidth(
  doc: jsPDF,
  text: string,
  maxWidth: number,
): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;

  let shortened = text;
  while (shortened.length && doc.getTextWidth(`${shortened}...`) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }

  return `${shortened.trimEnd()}...`;
}

function wrapText(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  style: PdfTextStyle,
): string[] {
  doc.setFont("helvetica", style.fontStyle);
  doc.setFontSize(style.fontSize);
  const lines = doc.splitTextToSize(text, maxWidth) as string[];

  if (lines.length <= style.maxLines) return lines;

  const visibleLines = lines.slice(0, style.maxLines);
  visibleLines[visibleLines.length - 1] = truncateToWidth(
    doc,
    `${visibleLines[visibleLines.length - 1]} ${lines[style.maxLines]}`,
    maxWidth,
  );
  return visibleLines;
}

function drawTextBlock(
  doc: jsPDF,
  text: string,
  x: number,
  topY: number,
  maxWidth: number,
  style: PdfTextStyle,
): number {
  const lines = wrapText(doc, text, maxWidth, style);
  const lineHeightMm = style.lineHeightPt * POINT_TO_MM;

  doc.setFont("helvetica", style.fontStyle);
  doc.setFontSize(style.fontSize);
  lines.forEach((line, index) => {
    doc.text(line, x, topY + style.fontSize * POINT_TO_MM + index * lineHeightMm);
  });

  return topY + lines.length * lineHeightMm;
}

function drawPhoneIcon(doc: jsPDF, x: number, y: number): void {
  doc.setDrawColor(...TITLE_RED);
  doc.setLineWidth(0.7);
  doc.setLineCap("round");
  doc.setLineJoin("round");
  doc.path([
    { op: "m", c: [x + 0.7, y + 0.3] },
    {
      op: "c",
      c: [x + 0.1, y + 1, x + 0.7, y + 2.5, x + 1.8, y + 3.5],
    },
    {
      op: "c",
      c: [x + 2.9, y + 4.5, x + 4.2, y + 4.8, x + 4.8, y + 4.1],
    },
  ]);
  doc.stroke();
  doc.setLineWidth(0.5);
  doc.line(x + 0.7, y + 0.3, x + 1.55, y + 1.2);
  doc.line(x + 3.95, y + 3.25, x + 4.8, y + 4.1);
}

function drawCardText(
  doc: jsPDF,
  address: AddressRecord,
  settings: AddressCardSettings,
  cardX: number,
  cardY: number,
): void {
  const content = getAddressCardContent(address, settings);
  const fontScale = settings.fontSize / 8.5;
  const scaledFontSize = (value: number) => value * fontScale;
  const textX = cardX + settings.paddingMm;
  const maxWidth = CARD_WIDTH_MM - settings.paddingMm * 2;
  let cursorY = cardY + settings.paddingMm;

  doc.setTextColor(...TITLE_RED);
  cursorY = drawTextBlock(doc, ADDRESS_CARD_TITLE, textX, cursorY, maxWidth, {
    fontSize: scaledFontSize(8),
    fontStyle: "bold",
    lineHeightPt: scaledFontSize(10),
    maxLines: 1,
  });

  doc.setTextColor(0, 0, 0);
  cursorY += 1.5;
  cursorY = drawTextBlock(doc, content.companyName, textX, cursorY, maxWidth, {
    fontSize: scaledFontSize(11),
    fontStyle: "bold",
    lineHeightPt: scaledFontSize(13),
    maxLines: 2,
  });

  if (content.address) {
    cursorY += 1.4;
    cursorY = drawTextBlock(doc, content.address, textX, cursorY, maxWidth, {
      fontSize: settings.fontSize,
      fontStyle: "normal",
      lineHeightPt: scaledFontSize(10),
      maxLines: 3,
    });
  }

  if (content.metadata.length) {
    cursorY += 0.8;
    doc.setTextColor(71, 85, 105);
    cursorY = drawTextBlock(
      doc,
      content.metadata.join(" · "),
      textX,
      cursorY,
      maxWidth,
      {
        fontSize: scaledFontSize(7),
        fontStyle: "normal",
        lineHeightPt: scaledFontSize(8),
        maxLines: 1,
      },
    );
  }

  if (content.phone) {
    cursorY += 2;
    drawPhoneIcon(doc, textX, cursorY - 0.2);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(scaledFontSize(9));
    doc.text(
      content.phone,
      textX + 7,
      cursorY + scaledFontSize(9) * POINT_TO_MM,
    );
  }
}

function drawAddressCard(
  doc: jsPDF,
  address: AddressRecord,
  settings: AddressCardSettings,
  cardIndex: number,
): void {
  const layout = getPageLayout();
  const column = cardIndex % layout.columns;
  const row = Math.floor(cardIndex / layout.columns);
  const cardX = layout.offsetX + column * (layout.cellWidth + layout.columnGap);
  const cardY = layout.offsetY + row * (layout.cellHeight + layout.rowGap);

  if (settings.showBorder) {
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.4 * POINT_TO_MM);
    doc.roundedRect(cardX, cardY, CARD_WIDTH_MM, CARD_HEIGHT_MM, 3, 3);
  }

  drawCardText(doc, address, settings, cardX, cardY);
}

function formatPdfDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createAddressCardsPdf(
  addresses: AddressRecord[],
  settings: AddressCardSettings,
): jsPDF {
  if (!addresses.length) {
    throw new Error("No address cards were supplied for PDF generation.");
  }

  const pages = chunkArray(addresses, CARDS_PER_PAGE);
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: "portrait",
    compress: true,
  });

  pages.forEach((pageCards, pageIndex) => {
    if (pageIndex > 0) {
      doc.addPage("a4", "portrait");
    }

    pageCards.forEach((address, cardIndex) => {
      drawAddressCard(doc, address, settings, cardIndex);
    });
  });

  return doc;
}

export function downloadAddressCardsPdf(
  addresses: AddressRecord[],
  settings: AddressCardSettings,
): void {
  const doc = createAddressCardsPdf(addresses, settings);
  doc.save(`address-cards-${formatPdfDate(new Date())}.pdf`);
}
