import { z } from "zod";

export const currentUserProfileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .max(320)
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  .strict()
  .refine(
    (value) => value.displayName !== undefined || value.email !== undefined,
    "At least one profile field is required",
  );

export type CurrentUserProfileUpdateInput = z.infer<
  typeof currentUserProfileUpdateSchema
>;
