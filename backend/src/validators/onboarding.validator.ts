import { z } from "zod";

const requiredText = (label: string, maximum: number) =>
  z.string().trim().min(1, `${label} is required`).max(maximum);

export const onboardingPhoneCheckSchema = z
  .object({
    phoneNumber: z
      .string()
      .trim()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  })
  .strict();

export const businessOnboardingSchema = z
  .object({
    ownerName: requiredText("Owner name", 120),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address")
      .max(320)
      .transform((value) => value.toLowerCase()),
    businessName: requiredText("Business name", 160),
    branch: requiredText("Branch name", 120),
    address: requiredText("Business address", 500),
    city: requiredText("City", 100),
    state: requiredText("State", 100),
  })
  .strict();
