import { z } from "zod";
import { QUOTATION_CURRENCIES, QUOTATION_INCOTERMS } from "./quotation.types.js";

const money = z.coerce.number().finite().min(0).max(999_999_999_999.99);

export const quotationWhatsAppPdfSchema = z.object({
  outletId: z.string().uuid(),
  userMobileNumber: z.string().regex(/^\d{10,15}$/),
  link: z.string().url().refine((value) => new URL(value).protocol === "https:", "HTTPS is required"),
  filename: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(500),
  outletName: z.string().trim().min(1).max(500),
}).strict();

export const postgresQuotationCreateSchema = z.object({
  outletId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
  customerName: z.string().trim().min(1).max(500),
  customerMobile: z.string().trim().max(32).optional().default(""),
  currencyCode: z.enum(QUOTATION_CURRENCIES).default("INR"),
  incoterm: z.enum(QUOTATION_INCOTERMS).optional(),
  terms: z.string().trim().max(10_000).optional().default(""),
  taxPercent: z.coerce.number().finite().min(0).max(100).optional().default(18),
  items: z.array(z.object({
    productId: z.string().uuid().optional(),
    productName: z.string().trim().min(1).max(500),
    quantity: z.coerce.number().finite().positive().max(999_999).default(1),
    mrpUnitPrice: money,
    unitPrice: money,
  }).strict().refine((item) => item.unitPrice <= item.mrpUnitPrice, {
    message: "unitPrice cannot exceed mrpUnitPrice", path: ["unitPrice"],
  })).min(1).max(250),
}).strict();
