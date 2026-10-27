import { z } from "zod";
import {
  TEAM_TREE_DEPARTMENTS,
  TEAM_TREE_ROLES,
} from "../types/teamTree.types.js";

const optionalDocumentId = z
  .string()
  .trim()
  .min(1)
  .max(1_500)
  .refine((value) => !value.includes("/"), "Invalid user profile id")
  .optional();

const documentId = z
  .string()
  .trim()
  .min(1)
  .max(1_500)
  .refine((value) => !value.includes("/"), "Invalid outlet id");

export const createTeamTreeUserSchema = z
  .object({
    outletId: documentId,
    name: z.string().trim().min(2, "Employee name is required").max(120),
    phoneNumber: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
    department: z.enum(TEAM_TREE_DEPARTMENTS),
    roleInZone: z.enum(TEAM_TREE_ROLES),
    zoneList: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    teamHeadProfileId: optionalDocumentId,
    zoneHeadProfileId: optionalDocumentId,
    empCode: z.string().trim().min(1, "Employee code is required").max(50),
    isOnPayRoll: z.boolean(),
    isActive: z.boolean().default(true),
  })
  .strict();
