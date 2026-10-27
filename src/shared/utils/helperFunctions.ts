import { LEAD_SOURCE } from "@/shared/lib/constants";

export function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export const sanitizeData = <T extends Record<string, unknown>>(obj: T) => {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) {
        // set default based on expected data type
        sanitized[key] = ""; // most fields are strings
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };



  export const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};



export const normalizeNumberVariants = (num: string = ""): string[] => {
  if (!num) return [];

  let digits = num.replace(/\D/g, "");

  if (digits.length > 10) {
    digits = digits.slice(-10);
  }

  return [`+91${digits}`, digits];
};
 


export const playNewLeadSound = () => {
  const audio = new Audio("/sounds/new-lead.mp3");
  audio.volume = 0.5;
  // const audio = new Audio("/sounds/Title Track Saiyaara 128 Kbps.mp3");
  audio.play().catch(() => {});
};


export const formatIndianAmount = (value?: number | string) =>
  Number(value || 0).toLocaleString("en-IN");

const DISPLAY_LABEL_OVERRIDES: Record<string, string> = {
  followup: "Follow Up",
  followups: "Follow Ups",
  whatsapp: "WhatsApp",
  justdail: "Justdial",
  justdial: "Justdial",
  walkin: "Walk-in",
  indiamart: "Indiamart",
  linkedin: "LinkedIn",
  googleads: "Google Ads",
  selfgenerated: "Self Generated",
  selfgenrated: "Self Generated",
  coldcall: "Cold Call",
  calllogs: "Call Logs",
  citystate: "City State",
  sourcewise: "Source Wise",
  employeewise: "Employee Wise",
};

const normalizeLabelKey = (value: string) =>
  value.replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Converts any stored/display word to Title Case (Camel Case words)
 * without changing the original stored value.
 * Examples: "FOLLOWUP" → "Follow Up", "KANISHK CHANDHOK" → "Kanishk Chandhok"
 */
export const toTitleCase = (
  value?: string | null,
  fallback = "-"
): string => {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  const override = DISPLAY_LABEL_OVERRIDES[normalizeLabelKey(trimmed)];
  if (override) return override;

  return trimmed
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_/-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const wordOverride = DISPLAY_LABEL_OVERRIDES[normalizeLabelKey(word)];
      if (wordOverride) return wordOverride;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

/**
 * Displays a person name in Title Case (Camel Case words)
 * without changing the stored value.
 * Example: "KANISHK CHANDHOK" → "Kanishk Chandhok"
 */
export const formatEmployeeName = (
  name?: string | null,
  fallback = "-"
): string => toTitleCase(name, fallback);

/** Display labels for stored lead-source values. Stored values are left unchanged. */
export const formatLeadSourceLabel = (
  source?: string | null,
  fallback = "-"
): string => toTitleCase(source, fallback);

/** Display labels for lead stages. Stored values (NEW, FOLLOWUP, …) stay unchanged. */
export const formatLeadStageLabel = (
  stage?: string | null,
  fallback = "-"
): string => toTitleCase(stage, fallback);

/** Display labels for lead status values such as RINGING. */
export const formatLeadStatusLabel = (
  status?: string | null,
  fallback = "-"
): string => toTitleCase(status, fallback);

export const getLeadSourceSelectOptions = () =>
  Object.values(LEAD_SOURCE).map((value) => ({
    label: formatLeadSourceLabel(value),
    value,
  }));
