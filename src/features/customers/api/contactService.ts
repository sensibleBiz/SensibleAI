import { apiRequest } from "@/shared/api/apiClient";
type ServiceResponse<T> = { data: T | null; loading: false; error: string | null };

export type ContactKeywordMap = Record<string, string>;

export interface OutletContactKeyword {
  id?: string;
  /** Primary keyword string (comma-separated if multiple) */
  keyword: string;
  /** Lowercase keyword string */
  keywordLower: string;
  /** Array of keywords */
  keywordList?: string[];
  /** Array of keywords (alias) */
  keywordsList?: string[];
  /** Map of safeKey -> keyword string */
  keywords: ContactKeywordMap;
  category?: string;
  city?: string;
  contactLimit?: number;
  outletId?: string;
  outletName?: string;
  /** Status indicating scraper/sync state: "pending" | "processing" | "completed" | "failed" */
  status: "pending" | "processing" | "completed" | "failed" | string;
  /** Number of scraped contacts received */
  contactsCount: number;
  /** Number of contacts received */
  receivedCount?: number;
  /** Number of contacts sent (e.g. to CRM / messaging) */
  sentCount?: number;
  lastRunAt?: number | null;
  errorDetails?: string | null;
  source?: string;
  createdAt: number;
  updatedAt: number;
  [key: string]: unknown;
}

export interface SaveContactKeywordResult {
  saved: string[];
  savedIds: string[];
  duplicates: string[];
  errors: string[];
  documentId?: string;
}

/**
 * Normalizes keyword string for comparison (trim + lower case)
 */
export const normalizeKeyword = (keyword: string): string =>
  (keyword || "").trim().toLowerCase();

/** Firestore map keys cannot contain . [ ] * / */
export const toKeywordMapKey = (keyword: string): string => {
  const lower = normalizeKeyword(keyword);
  const safe = lower.replace(/[.[\]*/]/g, "_").slice(0, 1500);
  return safe || "keyword";
};

export const buildKeywordsMap = (keywords: string[]): ContactKeywordMap => {
  const map: ContactKeywordMap = {};
  for (const raw of keywords) {
    const trimmed = (raw || "").trim();
    if (!trimmed) continue;
    map[toKeywordMapKey(trimmed)] = trimmed;
  }
  return map;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const extractKeywordsMap = (
  doc: Record<string, unknown> | OutletContactKeyword
): ContactKeywordMap => {
  const rawKeywords = doc.keywords;
  if (isPlainObject(rawKeywords)) {
    const map: ContactKeywordMap = {};
    for (const [key, value] of Object.entries(rawKeywords)) {
      if (typeof value === "string" && value.trim()) {
        map[key] = value.trim();
      } else if (isPlainObject(value) && typeof value.keyword === "string") {
        map[key] = value.keyword.trim();
      }
    }
    if (Object.keys(map).length > 0) return map;
  }

  if (typeof doc.keyword === "string" && doc.keyword.trim()) {
    const trimmed = doc.keyword.trim();
    return { [toKeywordMapKey(trimmed)]: trimmed };
  }

  return {};
};

export const extractKeywordsList = (
  doc: Record<string, unknown> | OutletContactKeyword
): string[] => {
  if (Array.isArray(doc.keywordList) && doc.keywordList.length > 0) {
    return doc.keywordList.map((k) => String(k).trim()).filter(Boolean);
  }
  if (Array.isArray(doc.keywordsList) && doc.keywordsList.length > 0) {
    return doc.keywordsList.map((k) => String(k).trim()).filter(Boolean);
  }
  if (Array.isArray(doc.keywordsArray) && doc.keywordsArray.length > 0) {
    return doc.keywordsArray.map((k) => String(k).trim()).filter(Boolean);
  }
  const map = extractKeywordsMap(doc);
  const fromMap = Object.values(map);
  if (fromMap.length > 0) {
    return fromMap;
  }
  if (typeof doc.keyword === "string" && doc.keyword.trim()) {
    return doc.keyword
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter(Boolean);
  }
  return [];
};

const toOutletContactKeyword = (
  doc: Record<string, unknown> & { id?: string }
): OutletContactKeyword => {
  const keywordList = extractKeywordsList(doc);
  const keywordsMap =
    Object.keys(extractKeywordsMap(doc)).length > 0
      ? extractKeywordsMap(doc)
      : buildKeywordsMap(keywordList);

  const keyword =
    typeof doc.keyword === "string" && doc.keyword.trim()
      ? doc.keyword.trim()
      : keywordList.join(", ");

  const keywordLower =
    typeof doc.keywordLower === "string" && doc.keywordLower
      ? doc.keywordLower
      : keyword.toLowerCase();

  const createdAt = Number(doc.createdAt) || 0;
  const updatedAt = Number(doc.updatedAt) || createdAt;

  return {
    ...doc,
    id: typeof doc.id === "string" ? doc.id : undefined,
    keyword,
    keywordLower,
    keywordList,
    keywordsList: keywordList,
    keywords: keywordsMap,
    category: typeof doc.category === "string" ? doc.category : "",
    city: typeof doc.city === "string" ? doc.city : "",
    contactLimit:
      typeof doc.contactLimit === "number" && doc.contactLimit > 0
        ? doc.contactLimit
        : 100,
    outletId: typeof doc.outletId === "string" ? doc.outletId : "",
    outletName: typeof doc.outletName === "string" ? doc.outletName : "",
    status:
      typeof doc.status === "string" && doc.status ? doc.status : "pending",
    contactsCount:
      typeof doc.contactsCount === "number" ? doc.contactsCount : 0,
    receivedCount:
      typeof doc.receivedCount === "number"
        ? doc.receivedCount
        : typeof doc.contactsCount === "number"
        ? doc.contactsCount
        : 0,
    sentCount: typeof doc.sentCount === "number" ? doc.sentCount : 0,
    createdAt,
    updatedAt,
  };
};

interface PostgresAiContactJob {
  id: string;
  outletId: string;
  keywordList: string[];
  category: string;
  city: string;
  contactLimit: number;
  status: "pending" | "processing" | "completed" | "failed";
  contactsCount: number;
  receivedCount: number;
  sentCount: number;
  lastRunAt: number | null;
  errorDetails: string | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

const fromPostgresJob = (job: PostgresAiContactJob): OutletContactKeyword =>
  toOutletContactKeyword({
    ...job,
    keyword: job.keywordList.join(", "),
    keywordLower: job.keywordList.join(", ").toLowerCase(),
    keywords: buildKeywordsMap(job.keywordList),
    keywordsList: job.keywordList,
  });

const getPostgresJobs = async (outletId: string) => {
  const query = new URLSearchParams({ outletId });
  const jobs = await apiRequest<PostgresAiContactJob[]>("/api/v1/ai-contacts/jobs?" + query, {
    authMode: "postgres",
  });
  return jobs.map(fromPostgresJob);
};

/**
 * Service for managing outlet-specific AI contact keywords in Firestore
 * Collection path: OUTLET/{outletId}/ContactKeyword/{docId}
 */
export const contactService = {
  async getOutletKeywords(outletId: string): Promise<OutletContactKeyword[]> {
    if (!outletId) return [];

    return getPostgresJobs(outletId);
  },

  subscribeToOutletKeywords(
    outletId: string,
    onData: (keywords: OutletContactKeyword[]) => void,
    onError?: (error: string) => void
  ) {
    if (!outletId) {
      onData([]);
      return () => {};
    }

    let active = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const refresh = async () => {
        try {
          const data = await getPostgresJobs(outletId);
          if (active) onData(data);
        } catch (error) {
          if (active) {
            onError?.(error instanceof Error ? error.message : "Unable to load AI contacts");
          }
        } finally {
          if (active) timer = setTimeout(refresh, 5_000);
        }
      };
      void refresh();
    return () => {
        active = false;
        if (timer) clearTimeout(timer);
    };
  },

  async addKeyword(
    outletId: string,
    keyword: string,
    meta?: {
      city?: string;
      category?: string;
      contactLimit?: number;
      outletName?: string;
    }
  ): Promise<ServiceResponse<string>> {
    const result = await this.addKeywordsInLoop(outletId, [keyword], meta);
    if (result.errors.length > 0) {
      return { data: null, loading: false, error: result.errors[0] };
    }
    if (result.savedIds.length > 0) {
      return { data: result.savedIds[0], loading: false, error: null };
    }
    return { data: null, loading: false, error: "Keyword cannot be empty" };
  },

  /**
   * Stores all submitted keywords in ONE document under OUTLET/{outletId}/ContactKeyword.
   * Stored in both array (`keywordList`, `keywordsList`) and map (`keywords`) format.
   * Does NOT reject previously or already added keywords.
   */
  async addKeywordsInLoop(
    outletId: string,
    keywords: string[],
    meta?: {
      city?: string;
      category?: string;
      contactLimit?: number;
      outletName?: string;
    }
  ): Promise<SaveContactKeywordResult> {
    const result: SaveContactKeywordResult = {
      saved: [],
      savedIds: [],
      duplicates: [],
      errors: [],
    };

    if (!outletId) {
      result.errors.push("Outlet ID is required");
      return result;
    }

    const cleanKeywords = keywords
      .map((k) => (k || "").trim())
      .filter((k) => k.length > 0);

    if (cleanKeywords.length === 0) {
      result.errors.push("Please enter at least one keyword");
      return result;
    }

    const contactLimit =
      meta?.contactLimit && meta.contactLimit > 0 ? meta.contactLimit : 100;
    const city = meta?.city?.trim() || "";
    const category = meta?.category?.trim() || "";
    try {
        const job = await apiRequest<PostgresAiContactJob>("/api/v1/ai-contacts/jobs", {
          method: "POST",
          authMode: "postgres",
          body: { outletId, keywords: cleanKeywords, category, city, contactLimit },
        });
        result.saved = cleanKeywords;
        result.savedIds = [job.id];
        result.documentId = job.id;
      } catch (error) {
        result.errors.push(
          "Failed to save keywords: " + (error instanceof Error ? error.message : "Unknown error"),
        );
    }
    return result;
  },

  async updateKeyword(
    outletId: string,
    contactId: string,
    newKeyword: string,
    meta?: {
      city?: string;
      category?: string;
      contactLimit?: number;
      status?: string;
    }
  ): Promise<ServiceResponse<boolean>> {
    const cleanKeywords = (newKeyword || "")
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (cleanKeywords.length === 0) {
      return { data: null, loading: false, error: "Keyword cannot be empty" };
    }
    if (!outletId || !contactId) {
      return {
        data: null,
        loading: false,
        error: "Invalid outlet or contact ID",
      };
    }

    try {
        const query = new URLSearchParams({ outletId });
        await apiRequest<PostgresAiContactJob>(
          "/api/v1/ai-contacts/jobs/" + encodeURIComponent(contactId) + "?" + query,
          {
            method: "PATCH",
            authMode: "postgres",
            body: {
              keywords: cleanKeywords,
              ...(meta?.city !== undefined ? { city: meta.city.trim() } : {}),
              ...(meta?.category !== undefined ? { category: meta.category.trim() } : {}),
              ...(meta?.contactLimit !== undefined ? { contactLimit: meta.contactLimit } : {}),
              ...(meta?.status !== undefined ? { status: meta.status } : {}),
            },
          },
        );
        return { data: true, loading: false, error: null };
      } catch (error) {
        return {
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Update failed",
        };
      }
  },

  async deleteKeyword(
    outletId: string,
    contactId: string
  ): Promise<ServiceResponse<boolean>> {
    if (!outletId || !contactId) {
      return {
        data: null,
        loading: false,
        error: "Invalid outlet or contact ID",
      };
    }

    try {
        const query = new URLSearchParams({ outletId });
        await apiRequest<{ id: string; deleted: true }>(
          "/api/v1/ai-contacts/jobs/" + encodeURIComponent(contactId) + "?" + query,
          { method: "DELETE", authMode: "postgres" },
        );
        return { data: true, loading: false, error: null };
      } catch (error) {
        return {
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Delete failed",
        };
      }
  },
};
