export const FUNNEL_SOURCE_KEYS = [
  "indiamart",
  "justdial",
  "facebook",
  "instagram",
  "google",
  "website",
  "reference",
  "self-generated",
  "cold-call",
  "linkedin",
  "whatsapp",
  "email",
  "walk-in",
  "other",
] as const;

export type FunnelSourceKey = (typeof FUNNEL_SOURCE_KEYS)[number];

export const FUNNEL_SOURCE_MATCHERS: Record<FunnelSourceKey, string[]> = {
  indiamart: ["indiamart", "indiamartlead"],
  justdial: ["justdial", "justdail", "jd"],
  facebook: ["facebook", "fb", "meta"],
  instagram: ["instagram", "insta"],
  google: ["googleads", "google"],
  website: ["website", "web"],
  reference: ["reference", "referral", "refer"],
  "self-generated": ["selfgenerated", "selfgenrated"],
  "cold-call": ["coldcall", "calling"],
  linkedin: ["linkedin"],
  whatsapp: ["whatsapp"],
  email: ["email", "mail"],
  "walk-in": ["walkin", "walk"],
  other: ["other", "na", "n/a"],
};

const normalizeSourceValue = (source?: string) =>
  (source ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export const resolveFunnelSourceKey = (source?: string): FunnelSourceKey => {
  const normalizedSource = normalizeSourceValue(source);
  if (!normalizedSource) return "other";

  const matchedKey = FUNNEL_SOURCE_KEYS.find((key) =>
    FUNNEL_SOURCE_MATCHERS[key].some((matcher) =>
      normalizedSource.includes(normalizeSourceValue(matcher)),
    ),
  );

  return matchedKey ?? "other";
};
