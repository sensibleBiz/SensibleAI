import { useEffect, useState } from "react";
import {
  Select,
  InputNumber,
  Button,
  Table,
  Typography,
  Spin,
  Input,
} from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import jsPDF from "jspdf";
import "jspdf-autotable";
import { RootState } from "@/app/store";
import { productApi } from "@/features/products";
import { DeleteIcon } from "lucide-react";
import { LeadsManagement } from "../types/types";
import { ProductItem } from "@/features/products";
import autoTable from "jspdf-autotable";
import { useMessageApi } from "@/shared/hooks";
import { FaWhatsapp } from "react-icons/fa";
import { uploadBase64FileToStorage } from "@/shared/utils/storageService";
import { toTitleCase } from "@/shared/utils/helperFunctions";
import { apiRequest } from "@/shared/api/apiClient";

const { Text } = Typography;

export interface QuotationRow {
  id: string;
  name: string;
  customer: number; // MRP Price (disabled)
  discountedPrice: number; // Editable discounted price
  dealer: number;
}

const QUOTATION_GST_PERCENT = 18;
const CURRENCY_OPTIONS = ["INR", "USD", "EUR"] as const;
const INCOTERM_OPTIONS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"] as const;
type QuotationCurrency = typeof CURRENCY_OPTIONS[number];

interface SavedQuotation {
  id: string;
  quotationNumber: string;
  currencyCode: QuotationCurrency;
  incoterm: string | null;
  subtotal: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  totalAmount: number;
}

interface JsPdfWithAutoTable extends jsPDF {
  lastAutoTable?: {
    finalY: number;
  };
}

type QuotaionPagePros = {
  lead?: LeadsManagement;
};

export default function QuotationPage({ lead }: QuotaionPagePros) {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendLoading, setSendLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<ProductItem[]>([]);
  const [pdfRows, setPdfRows] = useState<QuotationRow[]>([]);
  const outletId = useSelector((s: RootState) => s.appState.outletInfo.id);
  const outletName = useSelector((s: RootState) => s.appState.outletInfo.name);
  const prepedBy = useSelector((state: RootState) => state?.auth?.user?.name);
  const [showTerms, setShowTerms] = useState(true);
  const leadCurrency = lead?.customFields?.currency;
  const leadIncoterm = lead?.customFields?.incoterm;
  const leadPort = lead?.customFields?.portOfDischarge || lead?.customFields?.destination_port || lead?.customFields?.port_of_discharge;
  const [documentType, setDocumentType] = useState<"QUOTATION" | "PROFORMA_INVOICE">(
    leadIncoterm || (leadCurrency && leadCurrency !== "INR") ? "PROFORMA_INVOICE" : "QUOTATION"
  );
  const [currencyCode, setCurrencyCode] = useState<QuotationCurrency>(
    CURRENCY_OPTIONS.includes(leadCurrency as QuotationCurrency) ? leadCurrency as QuotationCurrency : "INR"
  );
  const [exchangeRate, setExchangeRate] = useState<number>(
    leadCurrency === "USD" ? 86.5 : leadCurrency === "EUR" ? 94.0 : 1.0
  );
  const [destinationPort, setDestinationPort] = useState<string>(
    typeof leadPort === "string" ? leadPort : ""
  );
  const [incoterm, setIncoterm] = useState<string | undefined>(
    INCOTERM_OPTIONS.includes(leadIncoterm as typeof INCOTERM_OPTIONS[number]) ? leadIncoterm as string : undefined
  );
  const [terms, setTerms] = useState(
    "1. This quotation is valid for 30 days from the date of issue.\n" +
      "2. Payment terms: 50% advance, balance on delivery.\n" +
      "3. Prices are subject to change without prior notice."
  );
  const messgaeApi = useMessageApi();

  const handleCurrencyChange = (newCurrency: QuotationCurrency) => {
    setCurrencyCode(newCurrency);
    if (newCurrency === "USD") {
      setExchangeRate(86.5);
      setDocumentType("PROFORMA_INVOICE");
    } else if (newCurrency === "EUR") {
      setExchangeRate(94.0);
      setDocumentType("PROFORMA_INVOICE");
    } else {
      setExchangeRate(1.0);
    }
  };

  const applyCurrencyConversion = () => {
    if (exchangeRate <= 0) return;
    setPdfRows((prevRows) =>
      prevRows.map((r) => ({
        ...r,
        customer: Math.round((r.customer / exchangeRate) * 100) / 100,
        discountedPrice: Math.round((r.discountedPrice / exchangeRate) * 100) / 100,
      }))
    );
    messgaeApi.success(`Prices converted to ${currencyCode} at 1 ${currencyCode} = ${exchangeRate} INR`);
  };

  // ---- FETCH PRODUCTS ON LOAD ----
  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      const response = await productApi.listProducts({ outletId });
      setProducts(response.items.filter((item) => item.active).map((item) => ({ id: item.id, name: item.name, mrpPrice: item.mrpPrice, price: item.price, isAddOn: item.isAddOn, isDeleted: false })));
      setLoading(false);
    };
    loadProducts();
  }, [outletId]);

  // ---- ADD PRODUCT TO QUOTATION ----
  const handleAddProduct = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    // Check if already added
    if (pdfRows.some((row) => row.id === productId)) return;

    const newRow: QuotationRow = {
      id: product.id,
      name: product.name,
      customer: product.mrpPrice,
      discountedPrice: product.mrpPrice, // Default to MRP
      dealer: product.price,
    };

    setPdfRows([...pdfRows, newRow]);
    setSelectedProducts([...selectedProducts, product]);
  };

  // ---- UPDATE DISCOUNTED PRICE ----
  const handleUpdateDiscountedPrice = (productId: string, newPrice: number) => {
    setPdfRows(
      pdfRows.map((row) =>
        row.id === productId ? { ...row, discountedPrice: newPrice } : row
      )
    );
  };

  // ---- REMOVE PRODUCT FROM QUOTATION ----
  const handleRemoveProduct = (productId: string) => {
    setPdfRows(pdfRows.filter((row) => row.id !== productId));
    setSelectedProducts(selectedProducts.filter((p) => p.id !== productId));
  };

  // const getPdfBase64 = async (doc: jsPDF): Promise<string> => {
  //   const blob = doc.output("blob");
  //   return new Promise((resolve, reject) => {
  //     const reader = new FileReader();
  //     reader.readAsDataURL(blob);
  //     reader.onload = () => resolve(reader.result as string);
  //     reader.onerror = (err) => reject(err);
  //   });
  // };
  // ---- EXPORT PDF ----
  const generatePDFDoc = (quotation: SavedQuotation) => {
    if (pdfRows.length === 0) return;

    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    const pageHeight = doc.internal.pageSize.getHeight(); // A4 page height
    const footerY = pageHeight - 5; // 15 units from bottom (adjust if needed)
    const companyName = "Sensible Connect Solution Pvt Ltd";
    const companyAddress =
      "4, Anand Complex, Paud Rd, opposite Kinara Hotel, near Vanaz Factory, Vrindavan Colony, Alkapuri Society, Kothrud, Pune, Maharashtra 411038";
    const gstinNo = "27AAAAA0000A1Z5";
    const phoneNo = "+91 98765 43210";
    const email = "info@sensibleconnect.com";

    // Calculate totals using discounted price
    const subtotal = quotation.subtotal;
    const totalMRP = pdfRows.reduce(
      (sum, r) => sum + parseFloat(r?.customer?.toString() || "0"),
      0
    );
    const totalDiscount = quotation.discountAmount;
    const discountPercent = totalMRP > 0 ? (totalDiscount / totalMRP) * 100 : 0;
    const gstPercent = quotation.taxPercent;
    const gstAmount = quotation.taxAmount;
    const finalAmount = quotation.totalAmount;

    let yPos = 20;

    const isProforma = documentType === "PROFORMA_INVOICE" || currencyCode !== "INR" || Boolean(incoterm);
    const documentTitle = isProforma ? "PROFORMA INVOICE" : "QUOTATION";
    const documentNumberLabel = isProforma ? "PI No" : "Quotation No";

    // Quotation Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(documentTitle, 105, yPos, { align: "center" });
    yPos += 5;

    // Horizontal line
    doc.setDrawColor(0, 0, 0);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Header - Company Name
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(companyName, 105, yPos, { align: "center" });
    yPos += 8;

    // Company Address with text wrapping
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const maxWidth = 150;
    const wrappedAddress = doc.splitTextToSize(companyAddress, maxWidth);
    doc.text(wrappedAddress, 105, yPos, { align: "center" });
    yPos += wrappedAddress.length * 5;

    // Contact Details
    doc.text(`Phone: ${phoneNo} | Email: ${email}`, 105, yPos, {
      align: "center",
    });
    yPos += 5;

    // GSTIN
    doc.setFont("helvetica", "bold");
    doc.text(`GSTIN: ${gstinNo}`, 105, yPos, { align: "center" });
    yPos += 10;

    // Horizontal line
    doc.setDrawColor(0, 0, 0);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Quotation Details
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const quotationDate = dayjs().format("DD MMM YYYY hh:mm A");

    doc.text(`${documentNumberLabel}: ${quotation.quotationNumber}`, 20, yPos);
    doc.text(`Date: ${quotationDate}`, 150, yPos);
    yPos += 5;
    doc.text(`Created By: ${prepedBy}`, 20, yPos);
    if (incoterm) {
      const incotermText = destinationPort ? `Incoterm: ${incoterm} (${destinationPort})` : `Incoterm: ${incoterm}`;
      doc.text(incotermText, 150, yPos);
    }
    yPos += 8;

    // Customer Details
    doc.setFont("helvetica", "bold");
    doc.text("Bill To:", 20, yPos);
    yPos += 5;
    doc.setFont("helvetica", "normal");
    doc.text(`${toTitleCase(lead?.username, "")}`, 20, yPos);
    yPos += 5;
    doc.text(`${lead?.city || ""} ${lead?.state || ""}`, 20, yPos);
    yPos += 10;

    // Product Table
    const head = [["Sr.", "Product Name", `MRP (${currencyCode})`, `Price (${currencyCode})`]];
    const body = pdfRows.map((r, index) => [
      (index + 1).toString(),
      r.name,
      parseFloat(r.customer?.toString() || "0").toFixed(2),
      parseFloat(r.discountedPrice?.toString() || "0").toFixed(2),
    ]);

    autoTable(doc, {
      head,
      body,
      startY: yPos,
      margin: { left: 20, right: 20 },
      styles: {
        fontSize: 10,
        cellPadding: 5,
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: {
        0: { halign: "center", cellWidth: 20 },
        1: { halign: "left", cellWidth: 90 },
        2: { halign: "right", cellWidth: 30 },
        3: { halign: "right", cellWidth: 30 },
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
    });

    yPos = ((doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? yPos) + 10;

    // Summary Box
    const summaryX = 120;
    const summaryWidth = 70;

    // Total MRP
    doc.setFont("helvetica", "normal");
    doc.text("Total MRP:", summaryX + 5, yPos + 8);
    doc.text(`${totalMRP.toFixed(2)}`, summaryX + summaryWidth - 5, yPos + 8, {
      align: "right",
    });

    // Discount
    doc.text(
      `Discount (${discountPercent.toFixed(1)}%):`,
      summaryX + 5,
      yPos + 16
    );
    doc.text(
      `- ${totalDiscount.toFixed(2)}`,
      summaryX + summaryWidth - 5,
      yPos + 16,
      { align: "right" }
    );

    // Subtotal
    doc.text("Subtotal:", summaryX + 5, yPos + 24);
    doc.text(`${subtotal.toFixed(2)}`, summaryX + summaryWidth - 5, yPos + 24, {
      align: "right",
    });

    // GST
    doc.text(`GST (${gstPercent}%):`, summaryX + 5, yPos + 32);
    doc.text(
      `${gstAmount.toFixed(2)}`,
      summaryX + summaryWidth - 5,
      yPos + 32,
      { align: "right" }
    );

    // Horizontal line before total
    doc.line(summaryX + 5, yPos + 36, summaryX + summaryWidth - 5, yPos + 36);

    // Final Amount
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Total Amount:", summaryX + 5, yPos + 45);
    doc.text(
      `${currencyCode} ${finalAmount.toFixed(2)}`,
      summaryX + summaryWidth - 5,
      yPos + 45,
      { align: "right" }
    );

    yPos += 65;

    // Terms & Conditions
    // New dynamic terms
    if (showTerms) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Terms & Conditions:", 20, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");

      const wrappedTerms = doc.splitTextToSize(terms, 170);
      doc.text(wrappedTerms, 20, yPos);
      yPos += wrappedTerms.length * 4;
    }

    yPos += 15;

    // Footer
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(128, 128, 128);
    doc.text(
      "* This is a computer-generated quotation and does not require a signature.",
      105,
      footerY,
      { align: "center" }
    );
    return doc;
    // doc.save(`Quotation_${quotationNo}_${dayjs().format("DD_MMM_YYYY")}.pdf`);
  };

  // ---- EXPORT PDF ----
  const saveQuotation = () => apiRequest<SavedQuotation>("/api/v1/quotations", {
    method: "POST",
    body: {
      outletId,
      ...(lead?.id ? { leadId: lead.id } : {}),
      customerName: lead?.username || "Customer",
      customerMobile: lead?.mobile || "",
      currencyCode,
      ...(incoterm ? { incoterm } : {}),
      terms: showTerms ? terms : "",
      taxPercent: QUOTATION_GST_PERCENT,
      items: pdfRows.map((row) => ({
        productId: row.id,
        productName: row.name,
        quantity: 1,
        mrpUnitPrice: Number(row.customer),
        unitPrice: Number(row.discountedPrice),
      })),
    },
  });

  const handleExportPDF = async () => {
    if (pdfRows.length === 0) return;
    setExportLoading(true);
    try {
      const quotation = await saveQuotation();
      const doc = generatePDFDoc(quotation);
      if (doc) doc.save(`${quotation.quotationNumber}.pdf`);
      messgaeApi.success(`Quotation ${quotation.quotationNumber} saved`);
    } catch (error) {
      console.error("Quotation save failed:", error);
      messgaeApi.error("Could not save quotation. PDF was not exported.");
    } finally {
      setExportLoading(false);
    }
  };

  // ---- SEND WHATSAPP ----
  const handleSendWhatsApp = async () => {
    if (pdfRows.length === 0) return;

    setSendLoading(true);
    // const base64 = await getPdfBase64(doc);
    // console.log("PDF Base64:", base64);

    const cleanMobile = normalizeLeadMobile(lead?.mobile || "");

    // const quotationNo = `QT-${dayjs().format("YYYYMMDD")}-${Math.floor(
    //   Math.random() * 1000
    // )}`;
    try {
      const quotation = await saveQuotation();
      const doc = generatePDFDoc(quotation);
      if (!doc) return;
      const pdfName = `Quotation_${quotation.quotationNumber}.pdf`;
      const base64Pdf = doc.output("datauristring").split(",")[1];
      const { url, error } = await uploadBase64FileToStorage(outletName, pdfName, base64Pdf);
      if (error || !url) throw new Error(error || "Quotation upload did not return a URL");
      messgaeApi.success("✅ Quotation uploaded successfully!");
      const payload = {
        userMobileNumber: "91" + cleanMobile,
        link: url,
        filename: `Quotation_${quotation.quotationNumber}_${dayjs().format("DD_MMM_YYYY")}`,
        name: lead?.username,
        outletId,
        outletName,
      };
      // Route through backend so the MSG91 auth key stays server-side only.
      // The backend forwards the request to the Cloud Function using the
      // WHATSAPP_MSG91_AUTH_KEY environment variable (never exposed in the bundle).
      await apiRequest("/api/v1/quotations/whatsapp-pdf", { method: "POST", body: payload });
      messgaeApi.success("WhatsApp PDF sent successfully!");
    } catch (err) {
      console.error("Network error:", err);
      messgaeApi.error("WhatsApp PDF not sent.");
    } finally {
      setSendLoading(false);
    }

    // const message = `Hello ${lead?.username},\n\nYour quotation (${quotationNo}) has been generated.\n\nTotal Products: ${pdfRows.length}\n\nThank you for your interest!\n\n- ${prepedBy}`;

    // const whatsappUrl = `https://wa.me/91${cleanMobile}?text=${encodeURIComponent(
    //   message
    // )}`;
    // window.open(whatsappUrl, "_blank");
  };

  const normalizeLeadMobile = (phone: string) =>
    phone.replace(/\D/g, "").slice(-10);

  return (
    <div style={{ padding: 5 }}>
      <div>
        {loading ? (
          <div className="flex justify-center p-5">
            <Spin />
          </div>
        ) : (
          <>
            {/* Product Selector */}
            <div style={{ marginBottom: 24 }}>
              {/* <Text strong>Add Products:</Text> */}
              <Select
                showSearch
                placeholder="Search and select products to add"
                style={{ width: "80%", marginTop: 8 }}
                optionFilterProp="name"
                onChange={handleAddProduct}
                value={null}
                options={products
                  .filter((p) => !pdfRows.some((row) => row.id === p.id))
                  .map((p) => ({
                    name: p.name, // ✅ used for search filter
                    label: (
                      <div className="flex items-center gap-2">
                        <span>
                          {p.name} - MRP: <b>Rs.{p.mrpPrice}</b>
                        </span>
                        {p.isAddOn && (
                          <span
                            className="px-2 py-[2px] text-[10px] font-semibold rounded-md"
                            style={{
                              background: "#ff4d4f20", // light red highlight
                              color: "#ff4d4f",
                              border: "1px solid #ff4d4f40",
                            }}
                          >
                            Add-On
                          </span>
                        )}
                      </div>
                    ),
                    value: p.id,
                  }))}
              />
            </div>

            {/* Quotation Preview Table (Always Visible) */}
            <Table
              bordered
              dataSource={pdfRows}
              pagination={false}
              locale={{
                emptyText:
                  "No products added yet. Select products above to start.",
              }}
              columns={[
                {
                  title: "Sr.",
                  key: "sr",
                  width: 60,
                  render: (_, __, index) => index + 1,
                },
                {
                  title: "Product Name",
                  dataIndex: "name",
                  key: "name",
                  render: (name) => <Text strong>{name}</Text>,
                },
                {
                  title: "MRP Price (Rs.)",
                  dataIndex: "customer",
                  key: "customer",
                  width: 150,
                  render: (v) => (
                    <InputNumber
                      value={v}
                      disabled
                      style={{ width: "100%" }}
                      prefix="Rs."
                    />
                  ),
                },
                {
                  title: "Discounted Price (Rs.)",
                  dataIndex: "discountedPrice",
                  key: "discountedPrice",
                  width: 180,
                  render: (v, record) => (
                    <InputNumber
                      value={v}
                      min={0}
                      max={record.customer}
                      style={{ width: "100%" }}
                      prefix="Rs."
                      onChange={(value) =>
                        handleUpdateDiscountedPrice(record.id, value || 0)
                      }
                    />
                  ),
                },
                {
                  title: "Action",
                  key: "action",
                  width: 80,
                  render: (_, record) => (
                    <Button
                      danger
                      type="text"
                      size="small"
                      icon={<DeleteIcon size={16} />}
                      onClick={() => handleRemoveProduct(record.id)}
                    />
                  ),
                },
              ]}
              rowKey="id"
            />

            {/* TERMS INPUT + TOGGLE */}
            <div style={{ marginTop: 20 }}>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <Text strong>Document Type</Text>
                <Select
                  value={documentType}
                  style={{ width: 210 }}
                  onChange={setDocumentType}
                  options={[
                    { label: "Standard Quotation", value: "QUOTATION" },
                    { label: "Proforma Invoice (Exports)", value: "PROFORMA_INVOICE" },
                  ]}
                />

                <Text strong>Currency</Text>
                <Select
                  value={currencyCode}
                  style={{ width: 90 }}
                  onChange={handleCurrencyChange}
                  options={CURRENCY_OPTIONS.map((value) => ({ label: value, value }))}
                />

                {currencyCode !== "INR" && (
                  <div className="flex items-center gap-2">
                    <Text type="secondary">1 {currencyCode} =</Text>
                    <InputNumber
                      min={0.1}
                      step={0.1}
                      value={exchangeRate}
                      onChange={(v) => setExchangeRate(v || 1)}
                      style={{ width: 90 }}
                    />
                    <Text type="secondary">INR</Text>
                    <Button size="small" onClick={applyCurrencyConversion}>
                      Convert Prices
                    </Button>
                  </div>
                )}

                <Text strong>Incoterm</Text>
                <Select
                  allowClear
                  placeholder="Optional"
                  value={incoterm}
                  style={{ width: 110 }}
                  onChange={setIncoterm}
                  options={INCOTERM_OPTIONS.map((value) => ({ label: value, value }))}
                />

                {incoterm && (
                  <Input
                    placeholder="Destination Port (e.g. Rotterdam)"
                    value={destinationPort}
                    onChange={(e) => setDestinationPort(e.target.value)}
                    style={{ width: 190 }}
                  />
                )}
              </div>
              <div className="flex items-center gap-3 mb-3">
                <Text strong>Terms & Conditions</Text>
                <Select
                  value={showTerms ? "show" : "hide"}
                  style={{ width: 120 }}
                  onChange={(v) => setShowTerms(v === "show")}
                  options={[
                    { label: "Show", value: "show" },
                    { label: "Hide", value: "hide" },
                  ]}
                />
              </div>

              {showTerms && (
                <Input.TextArea
                  rows={4}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  placeholder="Enter / Update Terms and Conditions"
                />
              )}
            </div>

            {/* Action Buttons */}
            {pdfRows.length > 0 && (
              <div className="flex justify-center gap-4 mt-6">
                <Button type="primary" size="large" loading={exportLoading} disabled={exportLoading || sendLoading} onClick={handleExportPDF}>
                  📥 Download PDF
                </Button>

                <Button
                  loading={sendLoading}
                  disabled={sendLoading}
                  type="primary"
                  style={{ background: "#52c41a" }}
                  size="large"
                  icon={<FaWhatsapp />}
                  onClick={handleSendWhatsApp}
                >
                  Send Quotation
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
