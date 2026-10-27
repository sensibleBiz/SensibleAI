const MAX_DOCUMENT_LENGTH = 1_200;
const INJECTION_TEXT = /\b(ignore|disregard|override)\b[^.\n]{0,80}\b(instructions?|rules?|prompt|system)\b/gi;
const PRIVATE_DATA = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /(?:\+?\d[\d\s().-]{8,}\d)/g,
] as const;

export const sanitizeRetrievalText = (value: string): string => {
  let sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(INJECTION_TEXT, "[removed]")
    .replace(/<\/?(?:system|assistant|developer|instruction)[^>]*>/gi, "[removed]");
  for (const pattern of PRIVATE_DATA) sanitized = sanitized.replace(pattern, "[redacted]");
  return sanitized.replace(/\s+/g, " ").trim();
};

export interface LeadDocumentFields {
  businessName: string | null;
  requirement: string | null;
  source: string | null;
  city: string | null;
  state: string | null;
  stage: string | null;
}

export const buildLeadDocument = (lead: LeadDocumentFields): string => {
  const fields = [
    ["Business", lead.businessName],
    ["Requirement", lead.requirement],
    ["Source", lead.source],
    ["City", lead.city],
    ["State", lead.state],
    ["Stage", lead.stage],
  ] as const;
  return fields
    .flatMap(([label, value]) => {
      const safe = value ? sanitizeRetrievalText(value).slice(0, 320) : "";
      return safe ? [`${label}: ${safe}`] : [];
    })
    .join(" | ")
    .slice(0, MAX_DOCUMENT_LENGTH);
};

const SAFE_TIMELINE_KEYS = [
  "fromStage",
  "toStage",
  "activityType",
  "direction",
  "durationSeconds",
  "mode",
] as const;

export const buildTimelineDocument = (
  eventType: string,
  payload: Record<string, unknown>,
  eventTime?: string,
): string => {
  const safeEventTime = eventTime && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(eventTime)
    ? eventTime
    : "";
  const values = SAFE_TIMELINE_KEYS.flatMap((key) => {
    const value = payload[key];
    if ((typeof value !== "string" && typeof value !== "number") || String(value).length > 80) return [];
    return [`${key}: ${sanitizeRetrievalText(String(value))}`];
  });
  return [
    `Event: ${sanitizeRetrievalText(eventType)}`,
    ...(safeEventTime ? [`At: ${safeEventTime}`] : []),
    ...values,
  ]
    .join(" | ")
    .slice(0, MAX_DOCUMENT_LENGTH);
};

export const safeEmbeddingQuery = (query: string): string =>
  sanitizeRetrievalText(query).slice(0, 1_000);
