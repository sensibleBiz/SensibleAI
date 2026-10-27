// File updated marker
export interface EventPamphletLeadPayload {
  outletId: string;
  name: string;
  mobile: string;
  businessType: string;
  sourceType: "event";
  sourceName: string;
  companyName?: string;
}

export interface PublicUrlCreatePayload {
  outletId: string;
  userId: string;
  displayName: string;
  url: string;
  phone?: string;
}

export interface PublicUrlRecord extends PublicUrlCreatePayload {
  id?: string;
  createdAt?: string;
}

import { apiRequest } from "@/shared/api/apiClient";

export const createLocalPublicUrlRecord = async (
  payload: PublicUrlCreatePayload
): Promise<PublicUrlRecord> => createPublicUrlRecord(payload);

export const getLocalPublicUrlsForOutlet = async (
  outletId: string,
  userId: string
) => getPublicUrlsForOutlet(outletId, userId);

const CREATE_PUBLIC_URL_API =
  "/api/v1/public-links";

const GET_PUBLIC_URL_API =
  "/api/v1/public-links";

const DELETE_PUBLIC_URL_API =
  "/api/v1/public-links";

const CREATE_QUICK_CONTACT_API =
  "/api/v1/quick-contacts";

export const DEFAULT_PUBLIC_EVENT_OUTLET_ID = "OUT001";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toCreatedAt = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.trim()) return value;

  const record = asRecord(value);
  if (typeof record?._seconds === "number") {
    return new Date(record._seconds * 1000).toISOString();
  }

  return undefined;
};

const normalizePublicUrlRecord = (
  value: unknown,
  fallback?: Partial<PublicUrlCreatePayload>
): PublicUrlRecord | null => {
  const record = asRecord(value);
  if (!record && !fallback) return null;

  const displayName =
    (typeof record?.displayName === "string" && record.displayName.trim()) ||
    fallback?.displayName?.trim() ||
    "";
  const url =
    (typeof record?.url === "string" && record.url.trim()) ||
    fallback?.url?.trim() ||
    "";

  if (!displayName || !url) return null;

  const outletId =
    (typeof record?.outletId === "string" && record.outletId.trim()) ||
    fallback?.outletId?.trim() ||
    "";
  const userId =
    (typeof record?.userId === "string" && record.userId.trim()) ||
    fallback?.userId?.trim() ||
    "";

  const phone =
    (typeof record?.phone === "string" && record.phone.trim()) ||
    fallback?.phone?.trim() ||
    undefined;

  const id =
    (typeof record?.docId === "string" && record.docId) ||
    (typeof record?.id === "string" && record.id) ||
    undefined;

  return {
    id,
    outletId,
    userId,
    displayName,
    url,
    createdAt: toCreatedAt(record?.createdAt ?? record?.createdDate),
    phone,
  };
};

const postJson = async <TBody extends object>(
  url: string,
  payload: TBody,
  fallbackError: string
) => {
  try {
    return await apiRequest<unknown>(url, { method: "POST", body: payload, ...(url === CREATE_QUICK_CONTACT_API ? { authenticated: false } : {}) });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : fallbackError);
  }
};

export const createPublicUrlRecord = async (
  payload: PublicUrlCreatePayload
): Promise<PublicUrlRecord> => {
  const body = await postJson(
    CREATE_PUBLIC_URL_API,
    payload,
    "Failed to create public URL"
  );
  const record = asRecord(body);
  const normalized = normalizePublicUrlRecord(
    {
      ...payload,
      docId: record?.id,
      id: record?.id,
      createdAt: new Date().toISOString(),
    },
    payload
  );

  if (!normalized) {
    throw new Error("Failed to create public URL");
  }

  return normalized;
};

export const getPublicUrlsForOutlet = async (
  outletId: string,
  userId: string
) => {
  if (!outletId.trim() || !userId.trim()) {
    throw new Error("Outlet or user details are unavailable");
  }

  const rows = await apiRequest<PublicUrlRecord[]>(`${GET_PUBLIC_URL_API}?outletId=${encodeURIComponent(outletId)}`);

  return rows
    .map((item) => normalizePublicUrlRecord(item, { outletId, userId }))
    .filter((item): item is PublicUrlRecord => Boolean(item));
};

export const getPublicUrlRecord = async (userId: string, outletId: string) => {
  const urls = await getPublicUrlsForOutlet(outletId, userId);
  return urls[0] ?? null;
};

export const deletePublicUrlRecord = async (payload: {
  docId: string;
  userId: string;
  outletId: string;
}) => {
  if (!payload.docId.trim()) {
    throw new Error("Public URL id is missing");
  }

  await apiRequest(`${DELETE_PUBLIC_URL_API}/${encodeURIComponent(payload.docId)}?outletId=${encodeURIComponent(payload.outletId)}`, { method: "DELETE" });
};

export const createEventPamphletContact = (
  payload: EventPamphletLeadPayload
) =>
  postJson(
    CREATE_QUICK_CONTACT_API,
    payload,
    "Failed to save contact details"
  );

interface PamphletLinkPayload {
  displayName: string;
  outletId: string;
  nonce: string;
  issuedAt: number;
}

interface PamphletLinkTokenV1 {
  version: 1;
  displayName: string;
  outletId?: string;
  nonce: string;
}

interface PamphletLinkTokenV2 {
  version: 2;
  iv: string;
  data: string;
}

export interface EventPamphletLinkDetails {
  displayName: string;
  outletId: string;
}

const PAMPHLET_LINK_SECRET =
  (import.meta.env.VITE_EVENT_PAMPHLET_SECRET as string | undefined)?.trim() ||
  "sensible-crm-event-pamphlet-v2";

const PAMPHLET_KEY_SALT = "sensible-crm-event-pamphlet-salt-v2";

const encodeBase64Url = (value: string | Uint8Array) => {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const decodeBase64UrlToBytes = (value: string) => {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const decodeBase64Url = (value: string) =>
  new TextDecoder().decode(decodeBase64UrlToBytes(value));

const createNonce = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
};

let pamphletCryptoKeyPromise: Promise<CryptoKey> | null = null;

const getPamphletCryptoKey = () => {
  if (!pamphletCryptoKeyPromise) {
    pamphletCryptoKeyPromise = (async () => {
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(PAMPHLET_LINK_SECRET),
        "PBKDF2",
        false,
        ["deriveKey"]
      );

      return crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: encoder.encode(PAMPHLET_KEY_SALT),
          iterations: 120_000,
          hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    })();
  }

  return pamphletCryptoKeyPromise;
};

const encryptPamphletPayload = async (payload: PamphletLinkPayload) => {
  const key = await getPamphletCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  const ivPart = encodeBase64Url(iv);
  const dataPart = encodeBase64Url(new Uint8Array(encrypted));

  // Use a compact token form: "version.iv.data" instead of JSON+base64.
  // This keeps the token URL-safe and noticeably shorter while remaining
  // reversible by the client-side parser.
  return `2.${ivPart}.${dataPart}`;
};

const decryptPamphletPayload = async (
  token: PamphletLinkTokenV2
): Promise<PamphletLinkPayload | null> => {
  try {
    if (
      typeof token.iv !== "string" ||
      !token.iv ||
      typeof token.data !== "string" ||
      !token.data
    ) {
      return null;
    }

    const key = await getPamphletCryptoKey();
    const iv = decodeBase64UrlToBytes(token.iv);
    const data = decodeBase64UrlToBytes(token.data);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    const value = JSON.parse(
      new TextDecoder().decode(decrypted)
    ) as Partial<PamphletLinkPayload>;

    if (
      typeof value.displayName !== "string" ||
      !value.displayName.trim() ||
      typeof value.outletId !== "string" ||
      !value.outletId.trim() ||
      typeof value.nonce !== "string" ||
      value.nonce.length < 16 ||
      typeof value.issuedAt !== "number"
    ) {
      return null;
    }

    return {
      displayName: value.displayName.trim(),
      outletId: value.outletId.trim(),
      nonce: value.nonce,
      issuedAt: value.issuedAt,
    };
  } catch {
    return null;
  }
};

const parseLegacyPamphletToken = (
  value: Partial<PamphletLinkTokenV1>
): EventPamphletLinkDetails | null => {
  if (
    value.version !== 1 ||
    typeof value.displayName !== "string" ||
    !value.displayName.trim() ||
    typeof value.nonce !== "string" ||
    value.nonce.length < 16
  ) {
    return null;
  }

  return {
    displayName: value.displayName.trim(),
    outletId:
      typeof value.outletId === "string" && value.outletId.trim()
        ? value.outletId.trim()
        : DEFAULT_PUBLIC_EVENT_OUTLET_ID,
  };
};

const getPublicOrigin = () => {
  const { hostname, origin } = window.location;
  const isLocalDevelopment =
    hostname === "localhost" || hostname === "127.0.0.1";

  return isLocalDevelopment ? origin : origin.replace(/^http:/, "https:");
};

export const buildEventPamphletLink = async (
  displayName: string,
  outletId?: string
) => {
  const token = await encryptPamphletPayload({
    displayName: displayName.trim(),
    outletId: outletId?.trim() || DEFAULT_PUBLIC_EVENT_OUTLET_ID,
    nonce: createNonce(),
    issuedAt: Date.now(),
  });

  return `${getPublicOrigin()}/event-pamphlet/${token}`;
};

export const getEventPamphletLinkDetails = async (
  token: string
): Promise<EventPamphletLinkDetails | null> => {
  if (!token.trim()) return null;

  try {
    // Support compact token format produced by `encryptPamphletPayload`:
    // 2.<iv>.<data>
    if (/^2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      const parts = token.split(".");
      const value = {
        version: 2,
        iv: parts[1],
        data: parts[2],
      } as PamphletLinkTokenV2;

      const payload = await decryptPamphletPayload(value);
      if (!payload) return null;

      return {
        displayName: payload.displayName,
        outletId: payload.outletId,
      };
    }

    // Fallback: older token format was base64url(JSON).
    const value = JSON.parse(decodeBase64Url(token)) as {
      version?: number;
    } & Partial<PamphletLinkTokenV1> &
      Partial<PamphletLinkTokenV2>;

    if (value.version === 2) {
      const payload = await decryptPamphletPayload(value as PamphletLinkTokenV2);
      if (!payload) return null;

      return {
        displayName: payload.displayName,
        outletId: payload.outletId,
      };
    }

    // Keep older plain tokens readable so existing shared links still work.
    return parseLegacyPamphletToken(value);
  } catch {
    return null;
  }
};

export const getEventPamphletDisplayName = async (token: string) =>
  (await getEventPamphletLinkDetails(token))?.displayName ?? "";
