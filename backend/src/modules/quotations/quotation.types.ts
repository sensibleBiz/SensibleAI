export const QUOTATION_CURRENCIES = ["USD", "EUR", "INR"] as const;
export const QUOTATION_INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"] as const;

export type QuotationCurrency = typeof QUOTATION_CURRENCIES[number];
export type QuotationIncoterm = typeof QUOTATION_INCOTERMS[number];

export interface QuotationItemInput {
  productId?: string;
  productName: string;
  quantity: number;
  mrpUnitPrice: number;
  unitPrice: number;
}

export interface QuotationCreateInput {
  outletId: string;
  leadId?: string;
  customerName: string;
  customerMobile?: string;
  currencyCode: QuotationCurrency;
  incoterm?: QuotationIncoterm;
  terms?: string;
  taxPercent?: number;
  items: QuotationItemInput[];
}

export interface CalculatedQuotationItem extends QuotationItemInput {
  lineNumber: number;
  lineSubtotal: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface QuotationTotals {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface QuotationRecord extends QuotationTotals {
  id: string;
  outletId: string;
  leadId: string | null;
  quotationNumber: string;
  customerName: string;
  customerMobile: string;
  currencyCode: QuotationCurrency;
  incoterm: QuotationIncoterm | null;
  terms: string;
  taxPercent: number;
  createdByUserId: string;
  createdAt: number;
  items: CalculatedQuotationItem[];
}
