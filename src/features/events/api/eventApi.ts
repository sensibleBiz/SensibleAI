import { mockEvents, mockParticipants } from "./mockEvents";
import {
  EventFormValues,
  EventImageAsset,
  EventItem,
  EventParticipant,
  EventPaymentRequest,
  EventRegistrationType,
  EventRegistrationValues,
} from "../types/eventTypes";
import { getEventRegistrationDate } from "../utils/eventRegistrationDate";
import { mergeEventRegistrationIdentity } from "./eventMemberPersistence";
import { apiRequest } from "@/shared/api/apiClient";

const wait = <T,>(data: T, delay = 500): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => resolve(data), delay);
  });

const DEFAULT_OUTLET_ID = "OUT001";

export const normalizeEventMobileNumber = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const findEventMemberByMobile = (
  members: EventParticipant[] | undefined,
  mobile: unknown
): EventParticipant | undefined => {
  const normalizedMobile = normalizeEventMobileNumber(mobile);
  if (!normalizedMobile) return undefined;

  return members?.find(
    (member) =>
      normalizeEventMobileNumber(member.mobile) === normalizedMobile
  );
};

export const buildRegistrationLink = (
  eventId: string,
  outletId = DEFAULT_OUTLET_ID,
  businessType?: string
) => {
  const params = new URLSearchParams({ outletId });
  const selectedBusinessType = String(businessType ?? "").trim();

  if (selectedBusinessType) {
    params.set("businessType", selectedBusinessType);
  }

  return `${window.location.origin}/event-register/${eventId}?${params.toString()}`;
};

const PRODUCTION_API_BASE_URL =
  "https://sensible-crm-api-700529442570.asia-south1.run.app";
const configuredApiBaseUrl = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.trim();
const eventApiBaseUrl = (
  import.meta.env.DEV
    ? ""
    : configuredApiBaseUrl && /^https?:\/\//i.test(configuredApiBaseUrl)
      ? configuredApiBaseUrl
      : PRODUCTION_API_BASE_URL
).replace(/\/$/, "");
const EVENT_GATEWAY_ROOT = `${eventApiBaseUrl}/api/v1/event`;

const CREATE_EVENT_URL = `${EVENT_GATEWAY_ROOT}/create`;
const GET_EVENT_URL = `${EVENT_GATEWAY_ROOT}/get`;
const PAY_AND_REGISTER_URL = `${EVENT_GATEWAY_ROOT}/payAndRegister`;
const PAYMENT_STATUS_URL = `${EVENT_GATEWAY_ROOT}/status`;

const DEFAULT_OFFER_AMOUNT = 9999;
 
interface EventGetFilters {
  outletId?: string;
  eventId?: string;
  isActive?: boolean;
  fromDate?: string;
  toDate?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const matchesGetFilters = (event: EventItem, filters: EventGetFilters = {}) => {
  if (filters.eventId && event.id !== filters.eventId) return false;
  if (filters.isActive !== undefined) {
    const matchesActiveStatus = filters.isActive
      ? event.status === "Active"
      : event.status !== "Active";
    if (!matchesActiveStatus) return false;
  }

  const eventTime = Date.parse(event.eventDateTime);
  if ((filters.fromDate || filters.toDate) && Number.isNaN(eventTime)) return false;

  if (filters.fromDate) {
    const fromTime = Date.parse(filters.fromDate);
    if (!Number.isNaN(fromTime) && eventTime < fromTime) return false;
  }

  if (filters.toDate) {
    const toTime = Date.parse(filters.toDate);
    if (!Number.isNaN(toTime) && eventTime > toTime) return false;
  }

  return true;
};

const readJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const getErrorMessage = (response: unknown, fallback: string) => {
  if (!isRecord(response)) return fallback;
  const message = response.message ?? response.error;
  if (typeof message === "string" && message.trim()) return message;
  return `${fallback}: ${JSON.stringify(response)}`;
};

export type PaymentStatusResult = "pending" | "success" | "failed";

export interface EventInvoiceDetails {
  amount?: number;
  customerDetails?: {
    customerName?: string;
    city?: string;
    mobile?: string;
    companyName?: string;
  };
  description?: string;
  extra?: unknown[];
  invoiceDate?: string;
  invoiceNo?: string;
  invoiceUrl?: string;
  fileLink?: string;
}

export interface PaymentInitiationResult {
  success: boolean;
  intentString?: string;
  paymentLink?: string;
  invoiceDetails?: EventInvoiceDetails;
}

const getInvoiceUrlFromRecord = (...records: Array<Record<string, unknown> | null | undefined>) => {
  for (const record of records) {
    if (!isRecord(record)) continue;

    const candidates = [
      record.invoiceUrl,
      record.fileLink,
      record.receiptUrl,
      record.downloadUrl,
      record.file_url,
      record.invoice_file_url,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return undefined;
};

const getPaymentStatusFromPayload = (
  response: unknown
): { status: PaymentStatusResult; invoiceUrl?: string } => {
  if (!isRecord(response)) return { status: "pending" };

  const wrappedBody = isRecord(response.body) ? response.body : null;
  const payload = wrappedBody ?? response;

  const success = payload.success;
  const failed = payload.failed;
  const code = typeof payload.code === "string" ? payload.code.toLowerCase() : "";
  const message = typeof payload.message === "string" ? payload.message.toLowerCase() : "";
  const dataPayload = isRecord(payload.data) ? payload.data : null;
  const dataInvoicePayload = isRecord(dataPayload?.invoiceDetails)
    ? dataPayload.invoiceDetails
    : null;
  const payloadInvoicePayload = isRecord(payload.invoiceDetails)
    ? payload.invoiceDetails
    : null;
  const dataSuccess = dataPayload?.success;
  const dataFailed = dataPayload?.failed;
  const invoiceUrl = getInvoiceUrlFromRecord(
    dataInvoicePayload,
    payloadInvoicePayload,
    dataPayload,
    payload
  );
  const paymentState =
    typeof (dataPayload?.paymentState ?? payload.paymentState) === "string"
      ? String(dataPayload?.paymentState ?? payload.paymentState).toLowerCase()
      : "";
  const payResponseCode =
    typeof (dataPayload?.payResponseCode ?? payload.payResponseCode) === "string"
      ? String(dataPayload?.payResponseCode ?? payload.payResponseCode).toLowerCase()
      : "";

  if (
    paymentState === "pending" ||
    paymentState === "in_progress" ||
    paymentState === "processing" ||
    paymentState === "initiated" ||
    code.includes("pending") ||
    message.includes("pending")
  ) {
    return { status: "pending", invoiceUrl };
  }

  if (
    paymentState === "completed" ||
    paymentState === "complete" ||
    paymentState === "success" ||
    payResponseCode === "success" ||
    payResponseCode === "completed" ||
    code === "payment_success" ||
    code === "success" ||
    message.includes("successful") ||
    message.includes("completed")
  ) {
    return { status: "success", invoiceUrl };
  }

  if (
    paymentState === "failed" ||
    paymentState === "failure" ||
    paymentState === "fail" ||
    paymentState === "cancelled" ||
    paymentState === "rejected" ||
    code.includes("fail") ||
    code.includes("error") ||
    message.includes("failed") ||
    message.includes("fail") ||
    message.includes("cancel")
  ) {
    return { status: "failed", invoiceUrl };
  }

  if (dataSuccess === true || success === true) {
    return { status: "success", invoiceUrl };
  }

  if (dataFailed === true || failed === true || dataSuccess === false || success === false) {
    return { status: "failed", invoiceUrl };
  }

  if (typeof success === "boolean") {
    return success ? { status: "success", invoiceUrl } : { status: "failed", invoiceUrl };
  }

  return { status: "pending", invoiceUrl };
};

const getPaymentInitiationFromPayload = (
  response: unknown
): PaymentInitiationResult => {
  if (!isRecord(response)) return { success: false };

  const wrappedBody = isRecord(response.body) ? response.body : null;
  const payload = wrappedBody ?? response;
  const dataPayload = isRecord(payload.data) ? payload.data : {};
  const invoicePayload = isRecord(dataPayload.invoiceDetails)
    ? dataPayload.invoiceDetails
    : isRecord(payload.invoiceDetails)
    ? payload.invoiceDetails
    : null;
  const invoiceUrl = getInvoiceUrlFromRecord(invoicePayload, dataPayload, payload);
  const statusCode = Number(response.statusCode ?? payload.statusCode);
  const success =
    payload.success === true ||
    String(payload.code ?? "").toLowerCase() === "success" ||
    statusCode === 200;

  return {
    success,
    intentString:
      typeof dataPayload.intentString === "string" ? dataPayload.intentString : "",
    paymentLink:
      typeof dataPayload.paymentLink === "string" ? dataPayload.paymentLink : "",
    invoiceDetails: invoicePayload
      ? {
          amount: Number(invoicePayload.amount),
          customerDetails: isRecord(invoicePayload.customerDetails)
            ? {
                customerName:
                  typeof invoicePayload.customerDetails.customerName ===
                  "string"
                    ? invoicePayload.customerDetails.customerName
                    : "",
                city:
                  typeof invoicePayload.customerDetails.city === "string"
                    ? invoicePayload.customerDetails.city
                    : "",
                mobile:
                  typeof invoicePayload.customerDetails.mobile === "string"
                    ? invoicePayload.customerDetails.mobile
                    : "",
                companyName:
                  typeof invoicePayload.customerDetails.companyName ===
                  "string"
                    ? invoicePayload.customerDetails.companyName
                    : "",
              }
            : undefined,
          description:
            typeof invoicePayload.description === "string"
              ? invoicePayload.description
              : "",
          extra: Array.isArray(invoicePayload.extra)
            ? invoicePayload.extra
            : [],
          invoiceDate:
            typeof invoicePayload.invoiceDate === "string"
              ? invoicePayload.invoiceDate
              : "",
          invoiceNo:
            typeof invoicePayload.invoiceNo === "string"
              ? invoicePayload.invoiceNo
              : "",
          invoiceUrl: invoiceUrl ?? "",
          fileLink: invoiceUrl ?? "",
        }
      : undefined,
  };
};

const hasEventShape = (value: Record<string, unknown>) =>
  "eventId" in value ||
  "id" in value ||
  "title" in value ||
  "name" in value ||
  "dateTime" in value ||
  "eventDateTime" in value;

const parseJsonString = (value: string): unknown | undefined => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const extractEventList = (response: unknown): unknown[] => {
  if (typeof response === "string") {
    const parsed = parseJsonString(response);
    return parsed === undefined ? [] : extractEventList(parsed);
  }

  if (Array.isArray(response)) {
    return response.flatMap((item) => {
      if (!isRecord(item)) return [];
      if (hasEventShape(item)) return [item];
      return extractEventList(item);
    });
  }

  if (!isRecord(response)) return [];

  for (const key of ["body", "data", "events", "event", "result", "items", "list"]) {
    const value = response[key];
    if (typeof value === "string") {
      const parsed = parseJsonString(value);
      if (parsed !== undefined) {
        const nested = extractEventList(parsed);
        if (nested.length) return nested;
      }
    }
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
      const nested = extractEventList(value);
      if (nested.length) return nested;
    }
  }

  if (hasEventShape(response)) {
    return [response];
  }

  return Object.entries(response).flatMap(([key, value]) => {
    if (!isRecord(value)) return [];

    if (hasEventShape(value)) {
      return [
        {
          eventId: key,
          ...value,
        },
      ];
    }

    return extractEventList(value);
  });
};

const extractEventPayload = (
  response: unknown
): Record<string, unknown> | null => {
  if (!isRecord(response)) return null;

  for (const key of ["data", "event", "result"]) {
    const value = response[key];
    if (isRecord(value)) return value;
  }

  return response;
};

const stringValue = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value : fallback;

const imageSourceValue = (value: unknown, fallback = "") => {
  const imageSource = stringValue(value, fallback).trim();

  if (!imageSource) return "";
  if (
    imageSource.startsWith("data:image/") ||
    imageSource.startsWith("http://") ||
    imageSource.startsWith("https://") ||
    imageSource.startsWith("blob:") ||
    imageSource.startsWith("/")
  ) {
    return imageSource;
  }

  const normalized = imageSource.replace(/\s/g, "");
  const isBase64Like = /^[A-Za-z0-9+/]+={0,2}$/.test(normalized);

  if (!isBase64Like) return imageSource;

  const mimeType = normalized.startsWith("/9j/")
    ? "image/jpeg"
    : normalized.startsWith("iVBOR")
    ? "image/png"
    : normalized.startsWith("R0lG")
    ? "image/gif"
    : normalized.startsWith("UklGR")
    ? "image/webp"
    : "image/jpeg";

  return `data:${mimeType};base64,${normalized}`;
};

const getImageUrlFromMap = (value: unknown) => {
  if (!isRecord(value)) return "";

  return imageSourceValue(
    value.primaryUrl ??
      value.url ??
      value.imageUrl ??
      value.postLink ??
      value.eventImageUrl
  );
};

const serializeEventImages = (images: EventImageAsset[]) =>
  images
    .filter((image) => image.url)
    .map((image, index) => ({
      id: image.id || `event-image-${index}`,
      name: image.name || `Event Image ${index + 1}`,
      businessType: image.businessType || "Other",
      url: image.url,
      originalFileName: image.originalFileName || "",
      uploadedAt: image.uploadedAt || new Date().toISOString(),
    }));

const toEventImageAsset = (
  value: unknown,
  index: number
): EventImageAsset | undefined => {
  if (typeof value === "string") {
    const url = imageSourceValue(value);
    return url
      ? {
          id: `event-image-${index}`,
          name: `Event Image ${index + 1}`,
          businessType: "Other",
          url,
        }
      : undefined;
  }

  if (!isRecord(value)) return undefined;

  const url = imageSourceValue(
    value.url ??
      value.imageUrl ??
      value.postLink ??
      value.eventImageUrl ??
      value.primaryUrl
  );

  if (!url) return undefined;

  return {
    id: stringValue(value.id, `event-image-${index}`),
    name: stringValue(value.name ?? value.title ?? value.fileName, `Event Image ${index + 1}`),
    businessType: stringValue(value.businessType, "Other"),
    url,
    originalFileName: stringValue(value.originalFileName ?? value.fileName),
    uploadedAt: stringValue(value.uploadedAt),
  };
};

const eventImagesValue = (
  payload: Record<string, unknown>,
  fallback?: EventImageAsset[],
  fallbackImageUrl = ""
): EventImageAsset[] => {
  const imageUrlMap = isRecord(payload.imageUrl) ? payload.imageUrl : null;
  const rawImages =
    payload.eventImages ??
    payload.images ??
    payload.imageList ??
    payload.imageUrls ??
    imageUrlMap?.imageList ??
    imageUrlMap?.eventImages ??
    imageUrlMap?.images ??
    imageUrlMap?.imageUrls;
  const images = Array.isArray(rawImages)
    ? rawImages
        .map((image, index) => toEventImageAsset(image, index))
        .filter((image): image is EventImageAsset => Boolean(image))
    : [];

  if (images.length) return images;

  if (fallback?.length) return fallback;

  const mappedPrimaryImageUrl = getImageUrlFromMap(payload.imageUrl);
  const primaryImageCandidate =
    payload.postLink ||
    payload.eventImageUrl ||
    payload.primaryUrl ||
    mappedPrimaryImageUrl ||
    payload.imageUrl;
  const url = imageSourceValue(
    primaryImageCandidate,
    fallbackImageUrl
  );

  return url
    ? [
        {
          id: "primary-event-image",
          name: "Primary Event Image",
          businessType: "Other",
          url,
        },
      ]
    : [];
};

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dateValue = (value: unknown, fallback = new Date().toISOString()) => {
  if (typeof value === "string" && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  if (isRecord(value)) {
    const seconds = Number(value._seconds ?? value.seconds);
    const nanoseconds = Number(value._nanoseconds ?? value.nanoseconds ?? 0);

    if (Number.isFinite(seconds)) {
      const date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000));
      return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
    }
  }

  return fallback;
};

const statusValue = (value: unknown, fallback: EventItem["status"] = "Active") => {
  if (typeof value === "boolean") {
    return value ? "Active" : "Inactive";
  }

  if (value === "Active" || value === "Inactive" || value === "Expired") {
    return value;
  }

  return fallback;
};

const locationText = (value: unknown, fallback = "") => {
  if (typeof value === "string") return value;

  if (isRecord(value)) {
    const lat = value.lat;
    const lng = value.lng;
    if (typeof lat === "number" && typeof lng === "number") {
      return `${lat}, ${lng}`;
    }
  }

  return fallback;
};

const offerAmountValue = (value: unknown, fallback = DEFAULT_OFFER_AMOUNT) => {
  const parsed = numberValue(value, fallback);
  return parsed > 0 ? parsed : fallback;
};

const registrationTypeValue = (
  value: unknown,
  fallback: EventRegistrationType = "paid"
): EventRegistrationType => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "free" || normalized === "free registration") {
    return "free";
  }

  if (normalized === "paid") {
    return "paid";
  }

  return fallback;
};

const eventRegistrationTypeValue = (
  payload: Record<string, unknown>,
  fallback?: EventRegistrationType,
  fees = 0
): EventRegistrationType => {
  if (payload.isFree === true || payload.isPaid === false) return "free";
  if (payload.isPaid === true || payload.isFree === false) return "paid";

  return registrationTypeValue(
    payload.registrationType ??
      payload.eventRegistrationType ??
      payload.paymentType ??
      payload.eventType,
    fallback ?? (fees > 0 ? "paid" : "free")
  );
};

const withDefaultOutlet = (filters: EventGetFilters = {}) => ({
  ...filters,
  outletId: filters.outletId || DEFAULT_OUTLET_ID,
});

const buildGetUrl = (filters: EventGetFilters = {}) => {
  const params = new URLSearchParams();
  const requestData = withDefaultOutlet(filters);

  Object.entries(requestData).forEach(([key, value]) => {
    if (key === "isActive") return;

    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  const query = params.toString();
  return query ? `${GET_EVENT_URL}?${query}` : GET_EVENT_URL;
};

const fetchEventsBody = async (filters: EventGetFilters = {}) => {
  const response = await fetch(buildGetUrl(filters));
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to fetch events"));
  }

  return body;
};

const toApiPayload = (
  data: EventFormValues,
  eventId?: string,
  outletId = DEFAULT_OUTLET_ID,
  members: EventParticipant[] = [],
  includeImage = true
) => {
  const eventImages = Array.isArray(data.eventImages)
    ? data.eventImages.filter((image) => image.url)
    : [];
  const imageList = serializeEventImages(eventImages);
  const eventImage = String(data.imageUrl ?? eventImages[0]?.url ?? "");
  const offerAmount = offerAmountValue(data.offerAmount);
  const registrationType = registrationTypeValue(
    data.registrationType,
    Number(data.fees ?? 0) > 0 ? "paid" : "free"
  );
  const fees = registrationType === "free" ? 0 : numberValue(data.fees);

  const payload: Record<string, unknown> = {
    outletId,
    eventId: eventId ?? `EVT${Date.now()}`,
    title: data.name,
    description: data.description,
    terms: data.terms,
    termsAndConditions: data.terms,
    dateTime: data.eventDateTime,
    expiryDate: data.registrationExpiryDate,
    address: data.address,
    city: data.city,
    location: data.location,
    registrationType,
    eventRegistrationType: registrationType,
    isPaid: registrationType === "paid",
    isFree: registrationType === "free",
    fees,
    offerAmount,
    offerFees: offerAmount,
    offerPrice: offerAmount,
    offer_amount: offerAmount,
    offer: offerAmount,
    isActive: data.status === "Active",
    members,
  };

  if (includeImage) {
    payload.postLink = eventImage;
    payload.eventImageUrl = eventImage;
    payload.primaryUrl = eventImage;
    payload.imageList = imageList;
    payload.eventImages = imageList;
    payload.images = imageList;
    payload.imageUrls = imageList.map((image) => image.url);
  }

  return payload;
};

const getMemberTransactionTitle = (member: EventParticipant) => {
  const transactionTitle = String(member.transactionTitle ?? "").trim();
  if (transactionTitle) return transactionTitle;

  if (
    member.registrationType === "free" ||
    member.paymentStatus === "Free Registration"
  ) {
    return "Free Registration";
  }

  if (member.businessType === "Admin Registration") {
    return "Admin Registration";
  }

  return "Event Registration";
};

const persistEventCity = (
  eventId: string,
  outletId: string,
  city: string,
  method: "POST" | "PATCH"
) =>
  apiRequest<{ eventId: string; city: string }>(
    `/api/v1/events/${encodeURIComponent(eventId)}/city`,
    {
      method,
      body: { outletId, city },
    }
  );

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value ?? "").trim();
    if (candidate) return candidate;
  }

  return "";
};

const longestString = (...values: unknown[]) =>
  values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .reduce((longest, value) => (value.length > longest.length ? value : longest), "");

const getParticipantFullName = (member: Partial<EventParticipant>) =>
  longestString(member.fullName, member.customerName, member.name);

const participantPaymentStatusValue = (
  value: unknown
): EventParticipant["paymentStatus"] => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "paid" || normalized === "success" || normalized === "completed") {
    return "Paid";
  }

  if (normalized === "failed" || normalized === "failure") {
    return "Failed";
  }

  if (normalized === "free registration" || normalized === "free") {
    return "Free Registration";
  }

  return "Pending";
};

const participantRegistrationTypeValue = (
  value: unknown
): EventParticipant["registrationType"] => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (normalized === "free" || normalized === "free registration") {
    return "free";
  }

  if (normalized === "paid") {
    return "paid";
  }

  return undefined;
};

const toEventMemberPayload = (member: EventParticipant) => {
  const fullName = getParticipantFullName(member);

  return {
    id: member.id,
    eventId: member.eventId,
    outletId: member.outletId,
    name: fullName,
    fullName,
    customerName: fullName,
    mobile: normalizeEventMobileNumber(member.mobile),
    amount: Number(member.amount ?? 0),
    paymentStatus: member.paymentStatus ?? "Pending",
    registrationDate: member.registrationDate,
    paymentDate: member.paymentDate ?? null,
    businessType: String(member.businessType ?? "").trim(),
    email: String(member.email ?? "").trim(),
    companyName: String(member.companyName ?? "").trim(),
    city: String(member.city ?? "").trim(),
    transactionId: String(member.transactionId ?? "").trim(),
    merchantOrderId: String(member.merchantOrderId ?? "").trim(),
    transactionType: member.transactionType ?? "EVENT",
    transactionTitle: getMemberTransactionTitle(member),
    registrationType: member.registrationType,
    isAgreed: member.isAgreed === true || member.acceptedTerms === true,
    isAttended: member.isAttended === true,
  };
};

const toEventParticipant = (
  value: unknown,
  eventId: string
): EventParticipant | undefined => {
  if (!isRecord(value)) return undefined;

  const fullName = longestString(
    value.fullName,
    value.customerName,
    value.name
  );
  const mobile = normalizeEventMobileNumber(value.mobile);

  return {
    id: firstString(value.id, mobile ? `${eventId}-${mobile}` : ""),
    eventId: firstString(value.eventId, eventId),
    outletId: firstString(value.outletId),
    name: fullName,
    fullName,
    customerName: fullName,
    mobile,
    businessType: firstString(value.businessType),
    email: firstString(value.email),
    companyName: firstString(value.companyName),
    city: firstString(value.city),
    amount: numberValue(value.amount),
    paymentStatus: participantPaymentStatusValue(value.paymentStatus),
    registrationDate: getEventRegistrationDate(value),
    paymentDate:
      value.paymentDate === null ? null : dateValue(value.paymentDate, ""),
    transactionId: firstString(value.transactionId),
    merchantOrderId: firstString(value.merchantOrderId),
    transactionType: value.transactionType === "OFFER" ? "OFFER" : "EVENT",
    transactionTitle: firstString(value.transactionTitle),
    registrationType: participantRegistrationTypeValue(value.registrationType),
    isAgreed: value.isAgreed === true || value.acceptedTerms === true,
    acceptedTerms: value.acceptedTerms === true || value.isAgreed === true,
    isAttended: value.isAttended === true,
  };
};

const hasValidMemberIdentity = (member: EventParticipant) =>
  Boolean(normalizeEventMobileNumber(member.mobile));

const toEventMemberSavePayload = (
  event: EventItem,
  outletId = DEFAULT_OUTLET_ID,
  members: EventParticipant[] = event.members ?? [],
  eventId = event.id
) => {
  const memberPayloads = members.map(toEventMemberPayload);
  const primaryMember = memberPayloads[0];
  const offerAmount = offerAmountValue(event.offerAmount);
  const registrationType = registrationTypeValue(
    event.registrationType,
    Number(event.fees ?? 0) > 0 ? "paid" : "free"
  );
  const fees = registrationType === "free" ? 0 : numberValue(event.fees);
  const eventImages = event.eventImages ?? [];
  const imageList = serializeEventImages(eventImages);
  const primaryImageUrl = event.imageUrl || eventImages[0]?.url || "";

  return {
    outletId,
    eventId,
    title: event.name,
    description: event.description,
    terms: event.terms,
    dateTime: event.eventDateTime,
    expiryDate: event.registrationExpiryDate,
    address: event.address,
    city: event.city ?? "",
    location: event.location,
    registrationType,
    eventRegistrationType: registrationType,
    isPaid: registrationType === "paid",
    isFree: registrationType === "free",
    fees,
    offerAmount,
    offerFees: offerAmount,
    offerPrice: offerAmount,
    offer_amount: offerAmount,
    offer: offerAmount,
    transactionType: primaryMember?.transactionType ?? "EVENT",
    transactionTitle: primaryMember?.transactionTitle ?? "Event Registration",
    isActive: event.status === "Active",
    postLink: primaryImageUrl,
    eventImageUrl: primaryImageUrl,
    primaryUrl: primaryImageUrl,
    imageList,
    eventImages: imageList,
    images: imageList,
    imageUrls: imageList.map((image) => image.url),
    members: memberPayloads,
  };
};

const getEventWithUpdatedMember = ({
  event,
  eventId = event.id,
  data,
  outletId = DEFAULT_OUTLET_ID,
  transactionId,
  merchantOrderId,
  transactionType,
  transactionTitle,
  amountOverride,
  paymentStatus = "Pending",
  registrationType,
}: {
  event: EventItem;
  eventId?: string;
  data: EventRegistrationValues;
  outletId?: string;
  transactionId?: string;
  merchantOrderId?: string;
  transactionType?: EventParticipant["transactionType"];
  transactionTitle?: string;
  amountOverride?: number;
  paymentStatus?: EventParticipant["paymentStatus"];
  registrationType?: EventParticipant["registrationType"];
}) => {
  const mobile = normalizeEventMobileNumber(data.mobile);
  const existingMembers = event.members ?? [];
  const existingMember = findEventMemberByMobile(existingMembers, mobile);
  const identity = mergeEventRegistrationIdentity(data, {
    fullName: existingMember ? getParticipantFullName(existingMember) : "",
    businessType: existingMember?.businessType,
    email: existingMember?.email,
    companyName: existingMember?.companyName,
    city: existingMember?.city,
  });
  const name = identity.fullName;
  const resolvedRegistrationType =
    registrationType ??
    existingMember?.registrationType ??
    event.registrationType ??
    (Number(event.fees ?? 0) > 0 ? "paid" : "free");
  const registrationDate =
    existingMember?.registrationDate || new Date().toISOString();
  const memberTransactionType = transactionType ?? "EVENT";
  const memberTransactionTitle =
    transactionTitle ??
    (resolvedRegistrationType === "free" ||
    paymentStatus === "Free Registration"
      ? "Free Registration"
      : data.businessType === "Admin Registration"
      ? "Admin Registration"
      : "Event Registration");
  const completedPaymentDate =
    paymentStatus === "Paid" || paymentStatus === "Free Registration"
      ? registrationDate
      : null;
  // The upstream event service historically drops registrationDate from free
  // member drafts, but preserves paymentDate. Free events have no payment, so
  // mirroring the registration timestamp there provides a durable legacy-safe
  // fallback without changing paid draft semantics.
  const persistedPaymentDate =
    resolvedRegistrationType === "free"
      ? registrationDate
      : completedPaymentDate;
  const member: EventParticipant = {
    id: existingMember?.id || `reg-${Date.now()}`,
    eventId,
    outletId,
    name,
    fullName: name,
    customerName: name,
    mobile,
    businessType: identity.businessType,
    email: identity.email,
    companyName: identity.companyName,
    city: identity.city,
    amount: amountOverride ?? event.fees,
    paymentStatus,
    paymentDate: existingMember?.paymentDate || persistedPaymentDate || null,
    registrationDate,
    transactionId: transactionId ?? existingMember?.transactionId,
    merchantOrderId: merchantOrderId ?? existingMember?.merchantOrderId,
    transactionType: memberTransactionType,
    transactionTitle: memberTransactionTitle,
    registrationType: resolvedRegistrationType,
    isAttended: existingMember?.isAttended === true,
    isAgreed: data.acceptedTerms === true,
    acceptedTerms: data.acceptedTerms,
  };
  const members = [
    member,
    ...existingMembers.filter((existingMember) => {
      if (!hasValidMemberIdentity(existingMember)) return false;

      const existingMobile = normalizeEventMobileNumber(existingMember.mobile);
      return existingMobile !== mobile;
    }),
  ];

  return {
    member,
    members,
    requestPayload: toEventMemberSavePayload(event, outletId, members, eventId),
  };
};

const toEventItem = (
  rawEvent: unknown,
  fallback?: Partial<EventFormValues> & {
    id?: string;
    outletId?: string;
    members?: EventParticipant[];
    eventImages?: EventImageAsset[];
  }
): EventItem => {
  const payload = isRecord(rawEvent) ? rawEvent : {};
  const id = stringValue(
    payload.id ?? payload._id ?? payload.eventId,
    fallback?.id ?? `evt-${Date.now()}`
  );
  const name = stringValue(
    payload.name ?? payload.eventName ?? payload.title,
    fallback?.name ?? "Untitled Event"
  );
  const fees = numberValue(payload.fees ?? payload.amount, fallback?.fees ?? 0);
  const registrationType = eventRegistrationTypeValue(
    payload,
    fallback?.registrationType,
    fees
  );
  const eventImages = eventImagesValue(
    payload,
    fallback?.eventImages,
    fallback?.imageUrl
  );
  const mappedPrimaryImageUrl = getImageUrlFromMap(payload.imageUrl);
  const imageUrl = imageSourceValue(
    payload.postLink ||
      payload.eventImageUrl ||
      payload.primaryUrl ||
      mappedPrimaryImageUrl ||
      payload.imageUrl,
    fallback?.imageUrl ?? eventImages[0]?.url ?? ""
  );
  const payloadMembers = Array.isArray(payload.members)
    ? payload.members
        .map((member) => toEventParticipant(member, id))
        .filter((member): member is EventParticipant => Boolean(member))
    : undefined;
  const membersFromResponse =
    payloadMembers && payloadMembers.length > 0
      ? payloadMembers
      : fallback?.members;
  const members = membersFromResponse?.map((member) => {
    const fallbackMember = findEventMemberByMobile(
      fallback?.members,
      member.mobile
    );

    if (!fallbackMember) return member;

    return {
      ...member,
      registrationDate:
        member.registrationDate || fallbackMember.registrationDate,
      paymentDate: member.paymentDate || fallbackMember.paymentDate || null,
    };
  });

  return {
    id,
    name,
    description: stringValue(
      payload.description ?? payload.eventDescription,
      fallback?.description ?? ""
    ),
    terms: stringValue(
      payload.terms ?? payload.termsAndConditions,
      fallback?.terms ?? ""
    ),
    location: locationText(payload.location, fallback?.location ?? ""),
    address: stringValue(payload.address, fallback?.address ?? ""),
    city: stringValue(
      payload.city ?? payload.eventCity,
      fallback?.city ?? ""
    ),
    eventDateTime: dateValue(
      payload.dateTime ?? payload.eventDateTime ?? payload.eventDate,
      fallback?.eventDateTime ?? new Date().toISOString()
    ),
    registrationExpiryDate: dateValue(
      payload.expiryDate ?? payload.registrationExpiryDate,
      fallback?.registrationExpiryDate ?? new Date().toISOString()
    ),
    registrationType,
    fees: registrationType === "free" ? 0 : fees,
    offerAmount: offerAmountValue(
      payload.offerAmount ??
        payload.offerFees ??
        payload.offerPrice ??
        payload.offer_amount ??
        payload.offer,
      fallback?.offerAmount ?? DEFAULT_OFFER_AMOUNT
    ),
    imageUrl,
    eventImages,
    status: statusValue(payload.isActive ?? payload.status, fallback?.status ?? "Active"),
    totalRegistrations: numberValue(
      payload.totalRegistrations,
      members?.length ?? 0
    ),
    registrationLink: stringValue(
      payload.registrationLink ?? payload.registrationUrl ?? payload.link,
      buildRegistrationLink(id, fallback?.outletId)
    ),
    members,
  };
};

export const getEvents = async (
  filters: EventGetFilters = {}
): Promise<EventItem[]> => {
  const outletId = filters.outletId || DEFAULT_OUTLET_ID;

  const eventPayloads = extractEventList(await fetchEventsBody(filters));

  const apiEvents = eventPayloads.map((event) =>
    toEventItem(event, { outletId })
  );

  return apiEvents.filter((event) => matchesGetFilters(event, filters));
};

export const getEventById = async (
  eventId: string,
  outletId = DEFAULT_OUTLET_ID
): Promise<EventItem | undefined> => {
  const events = await getEvents({ outletId });
  return events.find((event) => event.id === eventId);
};

export const createEvent = async (
  data: EventFormValues,
  outletId = DEFAULT_OUTLET_ID
): Promise<EventItem> => {
  const eventId = `EVT${Date.now()}`;
  const response = await fetch(CREATE_EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toApiPayload(data, eventId, outletId)),
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to create event"));
  }

  await persistEventCity(eventId, outletId, data.city, "POST");

  const event = toEventItem(extractEventPayload(body), {
    ...data,
    id: eventId,
    outletId,
  });

  return event;
};

export const updateEvent = async (
  eventId: string,
  data: EventFormValues,
  outletId = DEFAULT_OUTLET_ID
): Promise<EventItem> => {
  const response = await fetch(CREATE_EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toApiPayload(data, eventId, outletId)),
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to update event"));
  }

  await persistEventCity(eventId, outletId, data.city, "PATCH");

  const event = toEventItem(extractEventPayload(body), {
    ...data,
    id: eventId,
    outletId,
  });

  return event;
};

export const deactivateEvent = async (eventId: string): Promise<EventItem> => {
  const existing = mockEvents.find((event) => event.id === eventId);
  const event: EventItem = {
    ...(existing ?? mockEvents[0]),
    id: eventId,
    status: "Inactive",
    registrationLink: buildRegistrationLink(eventId),
  };

  return wait(event);
};

export const getEventParticipants = async (
  eventId: string
): Promise<EventParticipant[]> =>
  wait(mockParticipants.filter((participant) => participant.eventId === eventId));

export const registerParticipant = async (
  eventId: string,
  data: EventRegistrationValues
): Promise<EventParticipant> => {
  const event = mockEvents.find((item) => item.id === eventId);
  const registrationType = event?.registrationType ?? (Number(event?.fees ?? 0) > 0 ? "paid" : "free");
  const participant: EventParticipant = {
    id: `reg-${Date.now()}`,
    eventId,
    name: data.fullName,
    fullName: data.fullName,
    customerName: data.fullName,
    mobile: data.mobile,
    businessType: data.businessType,
    email: data.email,
    companyName: data.companyName,
    city: data.city,
    amount: registrationType === "free" ? 0 : event?.fees ?? 0,
    paymentStatus: registrationType === "free" ? "Free Registration" : "Pending",
    registrationDate: new Date().toISOString(),
    registrationType,
  };

  return wait(participant);
};

export const saveEventMemberRegistration = async ({
  event,
  eventId = event.id,
  data,
  outletId = DEFAULT_OUTLET_ID,
  transactionId,
  merchantOrderId,
  transactionType,
  transactionTitle,
  amountOverride,
  paymentStatus = "Pending",
  registrationType,
}: {
  event: EventItem;
  eventId?: string;
  data: EventRegistrationValues;
  outletId?: string;
  transactionId?: string;
  merchantOrderId?: string;
  transactionType?: EventParticipant["transactionType"];
  transactionTitle?: string;
  amountOverride?: number;
  paymentStatus?: EventParticipant["paymentStatus"];
  registrationType?: EventParticipant["registrationType"];
}): Promise<EventItem> => {
  const { members, requestPayload } = getEventWithUpdatedMember({
    event,
    eventId,
    outletId,
    data,
    transactionId,
    merchantOrderId,
    transactionType,
    transactionTitle,
    amountOverride,
    paymentStatus,
    registrationType,
  });

  const response = await fetch(CREATE_EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  const body = await readJsonResponse(response);

  console.log("Event member update response:", {
    status: response.status,
    request: requestPayload,
    body,
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to update event member"));
  }

  const updatedEvent = toEventItem(extractEventPayload(body), {
    id: eventId,
    name: event.name,
    description: event.description,
    terms: event.terms,
    location: event.location,
    address: event.address,
    city: event.city,
    eventDateTime: event.eventDateTime,
    registrationExpiryDate: event.registrationExpiryDate,
    registrationType: event.registrationType,
    fees: event.fees,
    offerAmount: event.offerAmount ?? DEFAULT_OFFER_AMOUNT,
    imageUrl: event.imageUrl,
    eventImages: event.eventImages,
    status: event.status,
    outletId,
    members,
  });

  return updatedEvent;
};

export const saveEventMemberRegistrationDraft = async ({
  event,
  eventId = event.id,
  data,
  outletId = DEFAULT_OUTLET_ID,
  amountOverride,
  paymentStatus = "Pending",
  registrationType,
}: {
  event: EventItem;
  eventId?: string;
  data: EventRegistrationValues;
  outletId?: string;
  amountOverride?: number;
  paymentStatus?: EventParticipant["paymentStatus"];
  registrationType?: EventParticipant["registrationType"];
}): Promise<EventItem> => {
  const { members, requestPayload } = getEventWithUpdatedMember({
    event,
    eventId,
    data,
    outletId,
    amountOverride,
    paymentStatus,
    registrationType,
  });

  const response = await fetch(CREATE_EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  const body = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to save event draft"));
  }

  return toEventItem(extractEventPayload(body), {
    id: eventId,
    name: event.name,
    description: event.description,
    terms: event.terms,
    location: event.location,
    address: event.address,
    city: event.city,
    eventDateTime: event.eventDateTime,
    registrationExpiryDate: event.registrationExpiryDate,
    registrationType: event.registrationType,
    fees: event.fees,
    offerAmount: event.offerAmount ?? DEFAULT_OFFER_AMOUNT,
    imageUrl: event.imageUrl,
    eventImages: event.eventImages,
    status: event.status,
    outletId,
    members,
  });
};

export const updateEventMemberAttendance = async ({
  event,
  participant,
  outletId = DEFAULT_OUTLET_ID,
  isAttended,
}: {
  event: EventItem;
  participant: EventParticipant;
  outletId?: string;
  isAttended: boolean;
}): Promise<EventItem> => {
  const participantMobile = normalizeEventMobileNumber(participant.mobile);
  const members = (event.members ?? []).map((member) =>
    member.id === participant.id ||
    normalizeEventMobileNumber(member.mobile) === participantMobile
      ? {
          ...member,
          isAttended,
        }
      : {
          ...member,
          isAttended: member.isAttended === true,
        }
  );
  const requestPayload = toEventMemberSavePayload(
    event,
    outletId,
    members,
    event.id
  );

  const response = await fetch(CREATE_EVENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });
  const body = await readJsonResponse(response);

  console.log("Event attendance update response:", {
    status: response.status,
    request: requestPayload,
    body,
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to update attendance"));
  }

  return toEventItem(extractEventPayload(body), {
    id: event.id,
    name: event.name,
    description: event.description,
    terms: event.terms,
    location: event.location,
    address: event.address,
    city: event.city,
    eventDateTime: event.eventDateTime,
    registrationExpiryDate: event.registrationExpiryDate,
    registrationType: event.registrationType,
    fees: event.fees,
    offerAmount: event.offerAmount ?? DEFAULT_OFFER_AMOUNT,
    imageUrl: event.imageUrl,
    eventImages: event.eventImages,
    status: event.status,
    outletId,
    members,
  });
};

export const payAndRegister = async (
  data: EventPaymentRequest
): Promise<PaymentInitiationResult> => {
  const fullName = String(data.fullName ?? "").trim();
  const registrationDate = new Date().toISOString();
  const paymentPayload = {
    outletId: data.outletId,
    eventId: data.eventId,
    transactionId: data.transactionId,
    merchantOrderId: data.merchantOrderId,
    amount: data.amount,
    isProd: data.isProd,
    transactionType: data.transactionType ?? "EVENT",
    transactionTitle: data.transactionTitle ?? "",
    customerPhoneNumber: data.customerPhoneNumber,
    name: fullName,
    fullName,
    customerName: fullName,
    mobile: data.mobile ?? data.customerPhoneNumber,
    businessType: data.businessType ?? "",
    email: data.email ?? "",
    companyName: data.companyName ?? "",
    city: data.city ?? "",
    isAgreed: data.acceptedTerms === true,
    paymentStatus: "Pending",
    paymentDate: null,
    registrationDate,
  };
  const response = await fetch(PAY_AND_REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(paymentPayload),
  });
  const body = await readJsonResponse(response);

  console.log("Payment registration response:", {
    status: response.status,
    request: paymentPayload,
    body,
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(body, "Failed to initiate payment"));
  }

  if (isRecord(body)) {
    return getPaymentInitiationFromPayload(body);
  }

  return { success: true };
};

export const checkPaymentStatus = async (data: {
  eventId: string;
  transactionId: string;
  amount: number;
  outletId: string;
  isProd: boolean;
  mobile: string;
  transactionType?: EventPaymentRequest["transactionType"];
  transactionTitle?: string;
  fullName?: string;
  businessType?: string;
  email?: string;
  companyName?: string;
  city?: string;
  acceptedTerms?: boolean;
}): Promise<{ status: PaymentStatusResult; invoiceUrl?: string }> => {
  const fullName = String(data.fullName ?? "").trim();
  const businessType = String(data.businessType ?? "").trim();
  const statusPayload = {
    ...data,
    transactionType: data.transactionType ?? "EVENT",
    transactionTitle:
      data.transactionTitle ??
      (data.transactionType === "OFFER" ? "Offer" : "Event Registration"),
    ...(fullName
      ? {
          name: fullName,
          fullName,
          customerName: fullName,
        }
      : {}),
    ...(businessType ? { businessType } : {}),
    ...(data.email ? { email: data.email.trim() } : {}),
    ...(data.companyName ? { companyName: data.companyName.trim() } : {}),
    ...(data.city ? { city: data.city.trim() } : {}),
    ...(typeof data.acceptedTerms === "boolean"
      ? {
          acceptedTerms: data.acceptedTerms,
          isAgreed: data.acceptedTerms,
        }
      : {}),
  };
  const response = await fetch(PAYMENT_STATUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(statusPayload),
  });
  const body = await readJsonResponse(response);

  console.log("Payment status response:", {
    status: response.status,
    request: statusPayload,
    body,
  });

  if (!response.ok) {
    return { status: "pending" };
  }

  return getPaymentStatusFromPayload(body);
};
