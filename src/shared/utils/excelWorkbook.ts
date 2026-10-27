import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function saveWorkbookAsXlsx(
  workbook: ExcelJS.Workbook,
  fileName: string
) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: XLSX_MIME });
  saveAs(blob, fileName);
}

export { ExcelJS };
