import { createHash } from "node:crypto";
import type { CustomerIdentity } from "../types/customer.types.js";

export const normalizeMobile = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const normalizeBusinessName = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const normalizeLocation = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export const buildCustomerIdentities = (data: {
  businessName: string;
  city: string;
  email: string;
  mobile: string;
  state: string;
}): CustomerIdentity[] => {
  const mobile = normalizeMobile(data.mobile);
  const email = normalizeEmail(data.email);
  const businessName = normalizeBusinessName(data.businessName);
  const city = normalizeLocation(data.city);
  const state = normalizeLocation(data.state);
  const location = [city, state].filter(Boolean).join("|");

  return [
    ...(mobile ? [{ type: "mobile" as const, value: mobile }] : []),
    ...(email ? [{ type: "email" as const, value: email }] : []),
    ...(businessName && location
      ? [{
          type: "businessLocation" as const,
          value: `${businessName}|${location}`,
        }]
      : []),
  ];
};

export const customerIdentityId = (identity: CustomerIdentity) =>
  createHash("sha256")
    .update(`${identity.type}:${identity.value}`)
    .digest("hex");

export const deterministicCustomerId = (identity: CustomerIdentity) =>
  `customer_${customerIdentityId(identity).slice(0, 32)}`;

export const buildCustomerCode = (customerId: string) => {
  const clean = customerId.replace(/^customer_/, "").replace(/-/g, "");
  if (customerId.includes("-") && clean.length >= 32) {
    return `CUS-${(clean.slice(0, 6) + clean.slice(-6)).toUpperCase()}`;
  }
  return `CUS-${clean.slice(0, 10).toUpperCase()}`;
};
