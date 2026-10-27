import { z } from "zod";

const uuid = (name: string) => z.string().uuid(`${name} must be a valid UUID`);
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const outletId = uuid("outletId");

export const postgresProductIdParamsSchema = z.object({
  productId: uuid("productId"),
}).strict();

export const postgresProductCategoryIdParamsSchema = z.object({
  categoryId: uuid("categoryId"),
}).strict();

const minUnitSchema = z.object({
  length: z.string().default(""),
  width: z.string().default(""),
  height: z.string().default(""),
  weight: z.string().default(""),
  volume: z.string().default(""),
}).partial();

const uidMapSchema = z.object({
  GTIN: z.string().default(""),
  ISBN: z.string().nullable().default(null),
  BatchId: z.string().default(""),
  QRCode: z.string().default(""),
  IMEI: z.string().nullable().default(null),
  SerialNumber: z.string().nullable().default(null),
  MACAddress: z.string().nullable().default(null),
  VIN: z.string().nullable().default(null),
  RFID: z.string().nullable().default(null),
}).partial();

export const postgresProductCreateSchema = z.object({
  outletId: outletId.optional(),
  outletIds: z.array(uuid("outletIds item")).optional(),
  name: z.string().trim().min(1, "Product name is required").max(500),
  sku: z.string().trim().max(128).default(""),
  brand: z.string().trim().max(500).default(""),
  categoryId: uuid("categoryId").nullable().optional(),
  category: z.string().trim().optional(), // allow category name or id from frontend
  description: z.string().trim().max(5000).default(""),
  mrpPrice: z.coerce.number().min(0, "MRP cannot be negative").default(0),
  price: z.coerce.number().min(0, "Price cannot be negative").default(0),
  purchasePrice: z.coerce.number().min(0, "Purchase price cannot be negative").default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  isAddOn: z.boolean().default(false),
  minUnit: minUnitSchema.optional(),
  uidMap: uidMapSchema.optional(),
  customFields: z.record(z.unknown()).default({}),
}).strict();

export const postgresProductUpdateSchema = z.object({
  outletId: outletId.optional(),
  name: z.string().trim().min(1).max(500).optional(),
  sku: z.string().trim().max(128).optional(),
  brand: z.string().trim().max(500).optional(),
  categoryId: uuid("categoryId").nullable().optional(),
  category: z.string().trim().optional(),
  description: z.string().trim().max(5000).optional(),
  mrpPrice: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0).optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  isAddOn: z.boolean().optional(),
  minUnit: minUnitSchema.optional(),
  uidMap: uidMapSchema.optional(),
  customFields: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
}).strict();

export const postgresProductListQuerySchema = z.object({
  outletId: outletId.optional(),
  categoryId: uuid("categoryId").optional(),
  search: optionalText(200),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: optionalText(2048),
  includeDeleted: z.coerce.boolean().default(false),
}).strict();

export const postgresProductSearchQuerySchema = z.object({
  outletId: outletId.optional(),
  query: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

export const postgresCategoryCreateSchema = z.object({
  outletId: outletId.optional(),
  name: z.string().trim().min(1, "Category name is required").max(500),
  description: z.string().trim().max(2000).default(""),
}).strict();

export const postgresCategoryUpdateSchema = z.object({
  outletId: outletId.optional(),
  name: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(2000).optional(),
  active: z.boolean().optional(),
}).strict();

export const postgresCategoryListQuerySchema = z.object({
  outletId: outletId.optional(),
  includeDeleted: z.coerce.boolean().default(false),
}).strict();

export const postgresProductAiGenerateSchema = z.object({
  outletId: outletId.optional(),
  prompt: z.string().trim().max(4000).optional(),
  name: z.string().trim().max(500).optional(),
  brand: z.string().trim().max(500).optional(),
  category: z.string().trim().max(500).optional(),
  targetPrice: z.coerce.number().min(0).optional(),
}).strict();

export const postgresProductAiImageSchema = z.object({
  outletId: outletId.optional(),
  imageBase64: z.string().min(10, "Image base64 payload is required"),
  mimeType: z.string().trim().default("image/jpeg"),
  prompt: z.string().trim().max(2000).optional(),
}).strict();


