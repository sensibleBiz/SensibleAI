import { z } from "zod";

const id = (name: string) =>
  z
    .string()
    .trim()
    .min(1, `${name} is required`)
    .max(1_500)
    .regex(/^[^/]+$/, `Invalid ${name}`);

export const whatsappAutomationOutletQuerySchema = z
  .object({
    outletId: id("outletId"),
  })
  .strict();

export const whatsappAutomationRuleBodySchema = z
  .object({
    id: z.string().trim().max(200).optional(),
    triggerEvent: z.enum([
      "LEAD_CREATED",
      "LEAD_ASSIGNED",
      "STAGE_CHANGED",
      "QUOTATION_SENT",
      "RENEWAL_ALERT",
    ]),
    name: z.string().trim().min(1, "Name is required").max(200),
    isActive: z.boolean().default(true),
    automationConfigured: z.boolean().optional(),
    templateName: z
      .string()
      .trim()
      .min(1, "Template name is required")
      .max(200)
      .regex(/^[a-z0-9_]+$/, "Template name must use lowercase letters, numbers, and underscores"),
    languageCode: z.string().trim().max(10).default("en"),
    recipientType: z.enum(["CUSTOMER", "ASSIGNED_USER", "CUSTOM_NUMBER"]),
    customRecipientNumber: z.string().trim().max(30).optional(),
    messageBody: z
      .string()
      .trim()
      .min(1, "Template body is required")
      .max(4096)
      .optional(),
    headerText: z.string().trim().max(60).optional(),
    footerText: z.string().trim().max(60).optional(),
    buttonText: z.string().trim().max(25).optional(),
    buttonUrl: z.string().trim().url("Enter a valid button URL").max(2000).optional(),
    buttonUrlExample: z.string().trim().url("Enter a valid example URL").max(2000).optional(),
    category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).optional(),
    templateStatus: z.enum(["PENDING", "APPROVED", "REJECTED", "UNKNOWN"]).optional(),
    rejectionReason: z.string().trim().max(500).optional(),
    msg91TemplateId: z.union([z.string(), z.number()]).optional(),
    submitTemplateForApproval: z.boolean().optional(),
    parameterMapping: z.record(z.string().trim()),
    conditions: z
      .object({
        sources: z.array(z.string().trim()).optional(),
        stages: z.array(z.string().trim()).optional(),
      })
      .optional(),
    outletId: z.string().trim().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
  })
  .strict();

export const whatsappAutomationTestBodySchema = z
  .object({
    recipientNumber: z
      .string()
      .trim()
      .min(8, "Recipient number must have at least 8 digits")
      .max(20),
    templateName: z.string().trim().min(1, "Template name is required").max(200),
    languageCode: z.string().trim().max(10).default("en"),
    parameters: z.record(z.string().trim()),
  })
  .strict();
