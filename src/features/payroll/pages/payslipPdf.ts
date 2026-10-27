import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { PayrollCalculationResult } from "@/features/payroll/domain";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { monthName } from "./payrollPageUtils";

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

export type PayslipLogo = {
  dataUrl: string;
  name?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

export type PayslipPdfOptions = {
  logo?: PayslipLogo | null;
};

const earningLabels: Record<string, string> = {
  basic: "Basic",
  hra: "HRA",
  da: "DA",
  conveyance: "Conveyance",
  medical: "Medical",
  specialAllowance: "Special Allowance",
  incentive: "Incentive",
  overtime: "Overtime",
  bonus: "Bonus",
  arrears: "Arrears",
  otherEarnings: "Other Earnings",
  grossEarnings: "Gross Earnings",
};

const deductionLabels: Record<string, string> = {
  lop: "LOP",
  employeePF: "Employee PF",
  employeeESI: "Employee ESI",
  professionalTax: "Professional Tax",
  employeeLWF: "Employee LWF",
  tds: "TDS",
  loan: "Loan",
  advance: "Advance",
  otherDeductions: "Other Deductions",
  totalDeductions: "Total Deductions",
};

const employerContributionLabels: Record<string, string> = {
  employerPF: "Employer PF",
  employerESI: "Employer ESI",
  employerLWF: "Employer LWF",
  gratuityProvision: "Gratuity Provision",
  bonusProvision: "Bonus Provision",
  totalEmployerContribution: "Total Employer Contribution",
};

const money = (value?: number) =>
  Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const safeFilePart = (value?: string | number) =>
  String(value || "employee")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_");

const amountRows = (data: object, labels: Record<string, string>) =>
  Object.entries(data as Record<string, unknown>).map(([key, amount]) => [
    labels[key] || key,
    money(Number(amount || 0)),
  ]);

const getLogoImageFormat = (logo: PayslipLogo) => {
  const mimeType =
    logo.mimeType ||
    logo.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] ||
    "";

  if (mimeType.toLowerCase().includes("png")) return "PNG";
  return "JPEG";
};

const getLogoDisplaySize = (logo: PayslipLogo) => {
  const maxWidth = 34;
  const maxHeight = 16;
  const sourceWidth = logo.width || maxWidth;
  const sourceHeight = logo.height || maxHeight;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);

  return {
    width: Math.max(sourceWidth * scale, 1),
    height: Math.max(sourceHeight * scale, 1),
  };
};

const addAmountTable = ({
  doc,
  title,
  rows,
  startY,
}: {
  doc: jsPDF;
  title: string;
  rows: string[][];
  startY: number;
}) => {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, startY);

  autoTable(doc, {
    head: [["Particulars", "Amount (Rs.)"]],
    body: rows,
    startY: startY + 4,
    margin: { left: 14, right: 14 },
    styles: {
      fontSize: 9,
      cellPadding: 3,
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: [36, 94, 79],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    columnStyles: {
      0: { cellWidth: 118 },
      1: { halign: "right", cellWidth: 64 },
    },
    alternateRowStyles: {
      fillColor: [246, 248, 250],
    },
  });

  return ((doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? startY) + 8;
};

export const createPayslipPdf = (
  result: PayrollCalculationResult,
  options: PayslipPdfOptions = {}
) => {
  const doc = new jsPDF({ orientation: "portrait", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const employeeCode = result.employee.empCode || result.employee.id;
  let titleX = 14;

  if (options.logo?.dataUrl) {
    try {
      const logoSize = getLogoDisplaySize(options.logo);
      doc.addImage(
        options.logo.dataUrl,
        getLogoImageFormat(options.logo),
        14,
        8,
        logoSize.width,
        logoSize.height
      );
      titleX = 54;
    } catch (error) {
      console.warn("Failed to add salary slip logo", error);
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SALARY SLIP", titleX, 18);
  doc.setFontSize(11);
  doc.text(`${monthName(result.month)} ${result.year}`, pageWidth - 14, 18, {
    align: "right",
  });

  doc.setDrawColor(36, 94, 79);
  doc.setLineWidth(0.5);
  doc.line(14, 24, pageWidth - 14, 24);

  autoTable(doc, {
    body: [
      ["Employee", formatEmployeeName(result.employee.name)],
      ["Employee ID", result.employee.id],
      ["Employee Code", employeeCode],
      ["Department", result.employee.department || "-"],
      ["Designation", result.employee.designation || "-"],
      ["State", result.state],
      ["Payable Days", String(result.payableDays)],
      ["LOP Days", String(result.lopDays)],
    ],
    startY: 32,
    theme: "grid",
    margin: { left: 14, right: 14 },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 48, fillColor: [246, 248, 250] },
      1: { cellWidth: 134 },
    },
  });

  let y = ((doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? 32) + 10;
  y = addAmountTable({
    doc,
    title: "Earnings",
    rows: amountRows(result.earnings, earningLabels),
    startY: y,
  });
  y = addAmountTable({
    doc,
    title: "Deductions",
    rows: amountRows(result.deductions, deductionLabels),
    startY: y,
  });
  y = addAmountTable({
    doc,
    title: "Employer Contributions",
    rows: amountRows(
      result.employerContributions,
      employerContributionLabels
    ),
    startY: y,
  });

  if (y > pageHeight - 30) {
    doc.addPage();
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Net Salary: Rs. ${money(result.netSalary)}`, 14, y + 4);
  doc.text(`CTC: Rs. ${money(result.ctc)}`, pageWidth - 14, y + 4, {
    align: "right",
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(
    "This is a computer-generated salary slip.",
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );

  return doc;
};

export const getPayslipPdfFileName = (result: PayrollCalculationResult) =>
  [
    "Salary_Slip",
    safeFilePart(result.employee.empCode || result.employee.id),
    result.year,
    String(result.month).padStart(2, "0"),
  ].join("_") + ".pdf";

export const downloadPayslipPdf = (
  result: PayrollCalculationResult,
  options: PayslipPdfOptions = {}
) => {
  const fileName = getPayslipPdfFileName(result);
  createPayslipPdf(result, options).save(fileName);
  return fileName;
};
