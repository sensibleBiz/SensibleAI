import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
}).strict();

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).max(8192),
}).strict();
