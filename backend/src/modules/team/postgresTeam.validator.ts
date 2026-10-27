import { z } from "zod";
import { POSTGRES_TEAM_DEPARTMENTS, POSTGRES_TEAM_ROLES } from "./team.types.js";

const uuid = z.string().uuid();
const zones = z.array(z.string().trim().min(1).max(100)).max(50).default([])
  .transform((items) => [...new Set(items.map((item) => item.toUpperCase()))]);

export const postgresTeamListSchema = z.object({
  outletId: uuid,
  department: z.enum(POSTGRES_TEAM_DEPARTMENTS).optional(),
  zone: z.string().trim().min(1).max(100).optional(),
  active: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  search: z.string().trim().min(1).max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: uuid.optional(),
}).strict();

export const postgresTeamUserParamsSchema = z.object({ userId: uuid }).strict();
export const postgresTeamDetailQuerySchema = z.object({ outletId: uuid }).strict();

export const postgresTeamCreateSchema = z.object({
  outletId: uuid,
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()).optional(),
  phoneNumber: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  password: z.string().min(10).max(200),
  department: z.enum(POSTGRES_TEAM_DEPARTMENTS),
  roleInZone: z.enum(POSTGRES_TEAM_ROLES),
  zoneList: zones,
  managerUserId: uuid.optional(),
  teamHeadProfileId: uuid.optional(),
  zoneHeadProfileId: uuid.optional(),
  empCode: z.string().trim().min(1).max(50),
  isOnPayRoll: z.boolean(),
  isActive: z.boolean().default(true),
}).strict().refine((value) => value.email || value.phoneNumber, {
  message: "Email or phone number is required",
  path: ["email"],
});

export const postgresTeamUpdateSchema = z.object({
  outletId: uuid,
  department: z.enum(POSTGRES_TEAM_DEPARTMENTS),
  currentDepartment: z.enum(POSTGRES_TEAM_DEPARTMENTS).optional(),
  roleInZone: z.enum(POSTGRES_TEAM_ROLES).optional(),
  zoneList: zones.optional(),
  managerUserId: uuid.nullable().optional(),
  teamHeadProfileId: uuid.nullable().optional(),
  empCode: z.string().trim().min(1).max(50).optional(),
  isOnPayRoll: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const postgresTeamMembershipCreateSchema = z.object({
  outletId: uuid,
  department: z.enum(POSTGRES_TEAM_DEPARTMENTS),
  roleInZone: z.enum(POSTGRES_TEAM_ROLES),
  zoneList: zones,
  managerUserId: uuid.optional(),
  teamHeadProfileId: uuid.optional(),
  zoneHeadProfileId: uuid.optional(),
  empCode: z.string().trim().min(1).max(50),
  isOnPayRoll: z.boolean(),
  isActive: z.boolean().default(true),
}).strict();
