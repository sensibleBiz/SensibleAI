import { z } from "zod";

const identifier = z.string().trim().min(1).max(1_500).regex(/^[^/]+$/);
const cellValue = z.union([
  z.string().max(100_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const contact = z.object({
  rowNumber: z.number().int().positive(),
  values: z.record(z.string().min(1).max(1_500), cellValue),
  assignedUserId: identifier,
  assignedUserName: z.string().trim().min(1).max(500),
  assignedEmployeeCode: z.string().trim().max(100).optional(),
}).strict();

const eventImage = z.object({
  id: z.string().trim().min(1).max(1_500),
  name: z.string().trim().min(1).max(500),
  businessType: z.string().trim().max(500),
  url: z.string().max(100_000),
  originalFileName: z.string().max(500).optional(),
  uploadedAt: z.string().max(100).optional(),
}).strict();

const eventDetails = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(500),
  description: z.string().max(100_000),
  terms: z.string().max(100_000),
  location: z.string().max(5_000),
  address: z.string().max(5_000),
  city: z.string().max(500).optional(),
  eventDateTime: z.string().trim().min(1).max(100),
  registrationExpiryDate: z.string().max(100),
  registrationType: z.enum(["paid", "free"]).optional(),
  fees: z.number().finite().nonnegative(),
  offerAmount: z.number().finite().nonnegative().optional(),
  imageUrl: z.string().max(100_000),
  eventImages: z.array(eventImage).max(100).optional(),
  status: z.enum(["Active", "Inactive", "Expired"]),
  totalRegistrations: z.number().int().nonnegative(),
  registrationLink: z.string().max(10_000),
}).strict();

export const generatedContactImportSchema = z.object({
  outletId: identifier,
  importId: identifier,
  fileName: z.string().trim().min(1).max(500),
  worksheetName: z.string().trim().min(1).max(200),
  uploadedAt: z.number().int().positive(),
  uploadType: z.enum(["EVENT", "OTHER"]),
  uploadName: z.string().trim().min(1).max(500),
  event: eventDetails.optional(),
  contacts: z.array(contact).min(1).max(100),
}).strict().superRefine((value, context) => {
  if (value.uploadType === "EVENT" && !value.event) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["event"],
      message: "Select an event for an Event upload",
    });
  }
  if (value.uploadType === "OTHER" && value.event) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["event"],
      message: "Other uploads cannot include event details",
    });
  }
});

export const generatedContactImportListSchema = z.object({
  outletId: identifier,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
}).strict();

export const generatedContactImportParamsSchema = z.object({
  importId: identifier,
}).strict();

export const generatedContactReassignParamsSchema = z.object({
  contactId: identifier,
}).strict();

export const generatedContactReassignSchema = z.object({
  outletId: identifier,
  assignedUserId: identifier,
  reason: z.string().trim().max(1_000).optional(),
}).strict();
