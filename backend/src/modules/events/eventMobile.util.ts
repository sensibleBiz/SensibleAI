export const normalizeEventMobileDigits = (mobile: unknown) => {
  const digits = String(mobile ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const normalizeEventMobileWithCountry = (mobile: unknown) => {
  const digits = String(mobile ?? "").trim().replace(/[\s-+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("91")) return digits;
  const local = normalizeEventMobileDigits(digits);
  return local ? `91${local}` : "";
};

export const eventMobilesMatch = (left: unknown, right: unknown) =>
  normalizeEventMobileDigits(left) === normalizeEventMobileDigits(right);
