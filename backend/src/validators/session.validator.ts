import { z } from "zod";

export const createSessionSchema = z
  .object({
    username: z.string().trim().min(1, "Username is required").max(320),
    password: z.string().min(1, "Password is required").max(256),
  })
  .strict();
