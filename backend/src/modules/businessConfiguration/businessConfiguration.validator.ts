import { z } from "zod";

export const businessConfigurationParamsSchema = z.object({
  outletId: z.string().uuid(),
}).strict();

const stageKey = z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/)
  .transform((value) => value.toUpperCase());
export const pipelineStageSchema = z.object({
  stageKey,
  displayName: z.string().trim().min(1).max(120),
  stageOrder: z.number().int().min(0).max(1000),
  stageCategory: z.enum(["OPEN", "WON", "LOST", "DISQUALIFIED"]),
  tabColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
}).strict();
export const customFieldSchema = z.object({
  entityType: z.enum(["lead", "product"]).default("lead"),
  fieldKey: z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  fieldName: z.string().trim().min(1).max(120),
  dataType: z.enum(["text", "number", "boolean", "date", "select", "multi_select"]),
  fieldGroup: z.string().trim().min(1).max(64).default("General"),
  options: z.array(z.union([z.string(), z.number(), z.object({ label: z.string(), value: z.union([z.string(), z.number()]) }).strict()])).max(200).default([]),
  isRequired: z.boolean().default(false),
  displayOrder: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
}).strict();

export const saveBusinessConfigurationSchema = z.object({
  businessModel: z.string().trim().min(1).max(64),
  vertical: z.string().trim().min(1).max(64),
  templateVersion: z.string().trim().min(1).max(32),
  currency: z.string().trim().min(3).max(10).transform((c) => c.toUpperCase()),
  terminologyOverrides: z.record(z.string(), z.string().max(120)).default({}),
  settings: z.record(z.string(), z.unknown()).default({}),
  pipelineStages: z.array(pipelineStageSchema).max(100).optional(),
  customFields: z.array(customFieldSchema).max(200).optional(),
}).strict().superRefine((input, context) => {
  const stages = input.pipelineStages ?? [];
  if (new Set(stages.map((stage) => stage.stageKey)).size !== stages.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["pipelineStages"], message: "Stage keys must be unique" });
  }
  for (const stage of stages) {
    const category = ["WON", "LOST", "DISQUALIFIED"].includes(stage.stageKey) ? stage.stageKey : "OPEN";
    if (["NEW", "ASSIGNED", "FOLLOWUP", "WON", "LOST", "DISQUALIFIED"].includes(stage.stageKey) && stage.stageCategory !== category) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["pipelineStages"], message: "Core stage categories cannot change" });
    }
  }
  const fields = input.customFields ?? [];
  if (new Set(fields.map((field) => `${field.entityType}:${field.fieldKey}`)).size !== fields.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["customFields"], message: "Custom field keys must be unique per entity" });
  }
});
