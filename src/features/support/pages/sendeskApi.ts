import { SendeskTicket, TicketPriority, TicketStatus } from "./sendeskAdminData";

const SENDESK_TICKETS_URL =
  "https://sendesk-401022448274.asia-south1.run.app/issue/getWithFilters";
const SENDESK_UPDATE_TICKET_URL =
  "https://sendesk-401022448274.asia-south1.run.app/issue/updateTicket";

type SendeskTicketFilters = {
  multiple?: boolean;
  ticket?: string | null;
  outletId?: string | null;
  softwareType?: string | null;
  status?: string | null;
  assignedTo?: string | null;
  monthId?: string | null;
  dayId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type SendeskTicketUpdateData = Partial<{
  status: TicketStatus;
  assignedTo: string | null;
  assignedBy: string;
  assignedByName: string;
  comment: string;
  updateMessage: string;
  lastUpdateMessage: string;
}>;

const statusMap: Record<string, TicketStatus> = {
  NEW: "New",
  PENDING: "Pending",
  IN_PROGRESS: "Pending",
  "IN PROGRESS": "Pending",
  RESOLVED: "Resolved",
};

const priorityMap: Record<string, TicketPriority> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

type ApiRecord = Record<string, unknown>;

export async function getSendeskTickets(
  filters: SendeskTicketFilters = {}
): Promise<SendeskTicket[]> {
  const url = buildTicketsUrl({
    multiple: null,
    ticket: null,
    outletId: null,
    softwareType: null,
    status: null,
    assignedTo: null,
    monthId: null,
    dayId: null,
    startDate: null,
    endDate: null,
    ...filters,
  });

  const response = await fetch(url);

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      String(getProperty(payload, "message") || "Failed to fetch Sendesk tickets")
    );
  }

  return extractTickets(payload).map(mapTicket);
}

export async function updateSendeskTicket(
  ticket: string,
  updateData: SendeskTicketUpdateData
): Promise<void> {
  const requestData = Object.fromEntries(
    Object.entries(updateData).filter(([, value]) => value !== null && value !== "")
  );

  const response = await fetch(SENDESK_UPDATE_TICKET_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ticket,
      ...requestData,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      String(getProperty(payload, "message") || "Failed to update Sendesk ticket")
    );
  }
}

function buildTicketsUrl(filters: SendeskTicketFilters) {
  const url = new URL(SENDESK_TICKETS_URL);

  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
}

function extractTickets(payload: unknown): unknown[] {
  const candidates = [
    payload,
    getPath(payload, "data"),
    getPath(payload, "data", "data"),
    getPath(payload, "tickets"),
    getPath(payload, "issues"),
    getPath(payload, "issue"),
    getPath(payload, "result"),
    getPath(payload, "data", "tickets"),
    getPath(payload, "data", "issues"),
    getPath(payload, "data", "issue"),
    getPath(payload, "data", "result"),
  ];

  const ticketList = candidates.find((candidate) => Array.isArray(candidate));
  if (ticketList) return ticketList;

  const objectList = candidates.find(
    (candidate) =>
      isRecord(candidate) &&
      !isTicketLike(candidate) &&
      Object.values(candidate).every(
        (value) => value && typeof value === "object"
      )
  );
  if (objectList) return Object.values(objectList);

  const singleTicket = candidates.find(
    (candidate) => isRecord(candidate)
  );
  return singleTicket ? [singleTicket] : [];
}

function isTicketLike(value: unknown) {
  const item = asRecord(value);

  return Boolean(
    item.ticket ||
      item.ticketNo ||
      item.id ||
      item.issueTitle ||
      item.customerNumber ||
      item.customerName
  );
}

function mapTicket(ticket: unknown): SendeskTicket {
  const item = asRecord(ticket);
  const outlet = asRecord(item.outlet);
  const customer = asRecord(item.customer);
  const customerDetails = asRecord(item.customerDetails || item.customerDetail);
  const file = asRecord(item.file);
  const firstAttachment = Array.isArray(item.attachments)
    ? asRecord(item.attachments[0])
    : {};
  const id = String(item.id || item._id || item.issueId || item.ticketId || "");
  const ticketNo = String(
    item.ticketNo ||
      item.ticket ||
      item.ticketNumber ||
      item.issueNo ||
      item.issueNumber ||
      id ||
      "-"
  );
  const createdAtValue =
    item.createdDateInMili ||
    item.createdAt ||
    item.createdDate ||
    item.createdDateTime ||
    item.createdDateTimeMili ||
    item.createdOn ||
    item.date;
  const resolvedAtValue =
    item.updatedDateInMili ||
    item.modifiedDate ||
    item.resolvedAt ||
    item.resolvedDate ||
    item.resolvedDateTime ||
    item.resolvedDateTimeMili ||
    item.updatedAt ||
    item.updatedDate ||
    item.updatedDateTime ||
    item.updatedDateTimeMili;
  const attachmentName =
    item.attachmentName ||
    item.attachment ||
    item.fileName ||
    file.name ||
    firstAttachment.name ||
    firstAttachment.url ||
    undefined;

  return {
    id: id || ticketNo,
    ticketNo,
    customerName: String(
      item.customerName || item.name || item.userName || item.createdBy || "-"
    ),
    customerMobile: String(
      item.customerNumber ||
        item.customerMobile ||
        item.mobile ||
        item.phone ||
        item.phoneNumber ||
        "-"
    ),
    customerEmail: String(item.customerEmail || item.email || ""),
    deviceId: String(
      item.deviceId ||
        item.deviceID ||
        item.device_id ||
        customer.deviceId ||
        customer.deviceID ||
        customer.device_id ||
        customerDetails.deviceId ||
        customerDetails.deviceID ||
        customerDetails.device_id ||
        item.device ||
        item.machineId ||
        item.machineID ||
        item.hardwareId ||
        item.hardwareID ||
        ""
    ),
    outletId: String(item.outletId || item.outletID || outlet.id || ""),
    outletNameId:
      String(
        item.outletNameId ||
          item.outletName ||
          outlet.name ||
          item.businessName ||
          ""
      ),
    issueTitle: String(
      item.issueTitle || item.title || item.subject || item.issue || "-"
    ),
    issueDescription: String(
      item.issueDescription ||
        item.description ||
        item.message ||
        item.details ||
        "-"
    ),
    issueCategory: String(
      item.issueType ||
        item.issueCategory ||
        item.category ||
        item.softwareType ||
        "-"
    ),
    priority: normalizePriority(item.priority),
    status: normalizeStatus(item.status),
    source: String(item.source || item.createdFrom || "Sendesk"),
    assignedTo: item.assignedTo || item.assignee ? String(item.assignedTo || item.assignee) : null,
    attachmentName: attachmentName ? String(attachmentName) : undefined,
    attachments: normalizeAttachments(
      item.attachments ||
        item.attachment ||
        item.attachmentUrl ||
        item.attachmentPath ||
        item.attachmentLink ||
        item.downloadUrl ||
        item.image ||
        item.imageUrl ||
        item.imagePath ||
        item.uploadedImage ||
        item.screenshot ||
        item.file ||
        item.files ||
        attachmentName
    ),
    lastUpdateMessage: String(
      item.lastUpdateMessage ||
        item.lastComment ||
        item.updateMessage ||
        item.solution ||
        item.message ||
        "-"
    ),
    createdAt: formatDate(createdAtValue),
    createdAtTimestamp: parseDateMs(createdAtValue),
    resolvedAtTimestamp: parseDateMs(resolvedAtValue),
    comments: normalizeComments(item.comments || item.commentList || item.updates),
  };
}

function normalizeAttachments(attachments: unknown): SendeskTicket["attachments"] {
  if (!attachments) return [];

  const attachmentList = Array.isArray(attachments) ? attachments : [attachments];

  return attachmentList
    .map((attachment, index) => {
      const item = asRecord(attachment);
      const url =
        typeof attachment === "string"
          ? attachment
          : item.url ||
            item.downloadUrl ||
            item.attachmentUrl ||
            item.imageUrl ||
            item.imagePath ||
            item.fileUrl ||
            item.downloadUrl ||
            item.link ||
            item.path ||
            item.base64Url ||
            item.base64 ||
            item.base64String ||
            item.fileBase64 ||
            item.imageBase64 ||
            item.data ||
            item.content ||
            "";

      if (!url) return null;

      const name =
        typeof attachment === "string"
          ? attachment.split("/").pop() || `Attachment ${index + 1}`
          : item.name ||
            item.fileName ||
            item.originalName ||
            `Attachment ${index + 1}`;

      const normalizedUrl = normalizeAttachmentUrl(
        String(url),
        String(name),
        typeof item.type === "string" ? item.type : undefined
      );

      return {
        name: String(name),
        url: normalizedUrl,
        isImage: isImageAttachment(
          normalizedUrl,
          String(name),
          typeof item.type === "string" ? item.type : undefined
        ),
      };
    })
    .filter(Boolean) as SendeskTicket["attachments"];
}

function normalizeAttachmentUrl(url: string, name: string, type?: string) {
  if (!url) return "";
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (!looksLikeBase64(url)) return url;

  const mimeType = getImageMimeType(name, type);
  return `data:${mimeType};base64,${url}`;
}

function looksLikeBase64(value: string) {
  const cleanValue = value.trim();
  if (cleanValue.length < 40 || cleanValue.includes(" ")) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(cleanValue);
}

function isImageAttachment(url: string, name: string, type?: string) {
  return (
    String(type || "").toLowerCase().startsWith("image/") ||
    /^data:image\//i.test(url) ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(url) ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name)
  );
}

function getImageMimeType(name: string, type?: string) {
  if (String(type || "").toLowerCase().startsWith("image/")) return String(type);
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.gif$/i.test(name)) return "image/gif";
  if (/\.bmp$/i.test(name)) return "image/bmp";
  if (/\.svg$/i.test(name)) return "image/svg+xml";
  return "image/jpeg";
}

function normalizeStatus(status: unknown): TicketStatus {
  const value = String(status || "New");
  return statusMap[value.toUpperCase()] || (value as TicketStatus);
}

function normalizePriority(priority: unknown): TicketPriority {
  const value = String(priority || "Medium");
  return priorityMap[value.toUpperCase()] || (value as TicketPriority);
}

function normalizeComments(comments: unknown): SendeskTicket["comments"] {
  if (!Array.isArray(comments)) return [];

  return comments.map((comment, index) => {
    const item = asRecord(comment);

    return {
      id: String(item.id || item._id || `${Date.now()}-${index}`),
      by: String(item.by || item.createdBy || item.userName || "Admin"),
      message: String(item.message || item.comment || item.text || ""),
      createdAt: formatDate(
        item.createdAt ||
          item.createdDate ||
          item.createdDateTime ||
          item.createdDateTimeMili
      ),
    };
  });
}

function formatDate(value: unknown) {
  if (!value) return "-";

  const timestamp = parseDateMs(value);
  if (!timestamp) return String(value);

  return new Date(timestamp).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function parseDateMs(value: unknown) {
  if (!value) return undefined;

  if (typeof value === "object") {
    const timestamp = value as {
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
      toDate?: () => Date;
    };

    if (typeof timestamp.toDate === "function") {
      const date = timestamp.toDate();
      return Number.isNaN(date.getTime()) ? undefined : date.getTime();
    }

    const seconds = timestamp.seconds ?? timestamp._seconds;
    if (typeof seconds === "number") return seconds * 1000;
  }

  const timestamp =
    typeof value === "number" && value < 946684800000 ? value * 1000 : value;
  const date = new Date(timestamp as string | number);

  if (Number.isNaN(date.getTime())) return undefined;

  return date.getTime();
}

function getProperty(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}

function getPath(value: unknown, ...keys: string[]) {
  return keys.reduce<unknown>(
    (current, key) => getProperty(current, key),
    value
  );
}

function asRecord(value: unknown): ApiRecord {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
