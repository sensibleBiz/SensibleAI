import { z } from "zod";

const optionalString = z.union([z.string(), z.number()]).transform(String).optional();
const memberSchema = z.object({
  name: optionalString,
  mobile: optionalString,
  paymentStatus: optionalString,
  businessType: optionalString,
  email: optionalString,
  companyName: optionalString,
  city: optionalString,
  paymentDate: z.union([z.string(), z.number(), z.date(), z.null()]).optional(),
  isAgreed: z.boolean().optional(),
  isAttended: z.boolean().optional(),
  amount: z.coerce.number().optional(),
  transactionId: optionalString,
  transactionTitle: optionalString,
  transactionType: optionalString,
}).passthrough();

export const eventCreateBodySchema = z.object({
  eventId: z.string().trim().min(1),
  outletId: z.string().trim().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  terms: z.string().optional(),
  dateTime: z.union([z.string(), z.number(), z.date()]).optional(),
  expiryDate: z.union([z.string(), z.number(), z.date()]).optional(),
  address: z.string().optional(),
  location: z.unknown().optional(),
  postLink: z.string().optional(),
  fees: z.coerce.number().optional(),
  isActive: z.boolean().optional(),
  members: z.array(memberSchema).optional(),
  imageUrl: z.unknown().optional(),
  offer: z.coerce.number().optional(),
  imageList: z.array(z.unknown()).optional(),
}).passthrough();

export const eventGetQuerySchema = z.object({
  outletId: z.string().trim().min(1),
  eventId: z.string().trim().optional(),
  isActive: z.enum(["true", "false"]).optional(),
  fromDate: z.string().trim().optional(),
  toDate: z.string().trim().optional(),
});

export const eventTransactionsGetQuerySchema = z.object({
  outletId: z.string().trim().min(1),
  eventId: z.string().trim().optional(),
});

export const eventPayAndRegisterBodySchema = z.object({
  outletId: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  transactionId: z.string().trim().min(1),
  merchantOrderId: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  isProd: z.boolean(),
  customerPhoneNumber: z.string().trim().min(1),
  mobile: z.string().trim().optional(),
}).passthrough();

export const eventPaymentStatusBodySchema = z.object({
  eventId: z.string().trim().min(1),
  transactionId: z.string().trim().min(1),
  amount: z.coerce.number(),
  outletId: z.string().trim().min(1),
  isProd: z.boolean(),
  mobile: z.string().trim().min(1),
  transactionType: z.string().optional(),
  transactionTitle: z.string().optional(),
}).passthrough();
