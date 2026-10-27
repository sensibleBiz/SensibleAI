import dayjs from "dayjs";
import type { WhatsAppMessage, WhatsAppMessageLog, WhatsAppReplyMessage } from "../types/types";

const NORMALIZE_THRESHOLD = 946684800000; // Jan 1, 2000 in milliseconds

const STATUS_PRIORITY: Record<string, number> = {
  read: 4,
  viewed: 4,
  seen: 4,
  delivered: 3,
  sent: 2,
  pending: 1,
  failed: 0,
};

interface ReadableMessage {
  timestamp: number;
  isRead?: boolean;
}

export interface MessageStatusCounts {
  all: number;
  read: number;
  unread: number;
}

export const normalizeTimestamp = (timestamp: number | undefined): number => {
  if (!timestamp || timestamp === 0) return Date.now();

  if (timestamp < NORMALIZE_THRESHOLD) {
    return timestamp * 1000;
  }

  return timestamp;
};

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== "" && value !== 0;

const getNumberValue = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getExplicitUnreadCount = (
  chat: WhatsAppMessageLog
): number | undefined => {
  const record = chat as unknown as Record<string, unknown>;
  const count =
    getNumberValue(record.unreadCount) ??
    getNumberValue(record.unread_count) ??
    getNumberValue(record.unreadMessages) ??
    getNumberValue(record.unread_msg_count);

  return count === undefined ? undefined : Math.max(0, count);
};

const getTimestampFromValue = (value: unknown): number | undefined => {
  const numericValue = getNumberValue(value);
  if (numericValue !== undefined) return normalizeTimestamp(numericValue);

  if (typeof value === "string" && value.trim()) {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.valueOf() : undefined;
  }

  return undefined;
};

const getChatReadTimestamp = (chat: WhatsAppMessageLog): number | undefined => {
  const record = chat as unknown as Record<string, unknown>;
  const readTimestampKeys = [
    "lastReadAtMili",
    "lastReadAtMillis",
    "lastReadAt",
    "readDateTimeMili",
    "readAtMili",
    "readAtMillis",
    "readAt",
    "seenAt",
    "viewedAt",
  ];

  for (const key of readTimestampKeys) {
    const timestamp = getTimestampFromValue(record[key]);
    if (timestamp !== undefined) return timestamp;
  }

  return undefined;
};

const getReadFlag = (record: Record<string, unknown>): boolean | undefined => {
  const readKeys = ["isRead", "read", "seen", "viewed"];
  for (const key of readKeys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }

  const unreadKeys = ["isUnread", "unread"];
  for (const key of unreadKeys) {
    if (typeof record[key] === "boolean") return !(record[key] as boolean);
  }

  const status =
    typeof record.readStatus === "string" ? record.readStatus.toLowerCase() : "";
  if (["read", "seen", "viewed"].includes(status)) return true;
  if (["unread", "new", "pending"].includes(status)) return false;

  const readAtKeys = [
    "readAt",
    "read_at",
    "seenAt",
    "seen_at",
    "viewedAt",
    "viewed_at",
  ];
  if (readAtKeys.some((key) => hasValue(record[key]))) return true;

  return undefined;
};

const getInboundUnreadCount = (
  replies: WhatsAppReplyMessage[]
): number | undefined => {
  let hasReadMetadata = false;
  const unreadCount = replies.reduce((count, message) => {
    const flag = getReadFlag(message as unknown as Record<string, unknown>);
    if (flag === undefined) return count;

    hasReadMetadata = true;
    return flag ? count : count + 1;
  }, 0);

  return hasReadMetadata ? unreadCount : undefined;
};

const getMessageTimestamp = (
  message: WhatsAppMessage | WhatsAppReplyMessage
): number =>
  normalizeTimestamp(
    message.createdDateTimeMili ||
      ("submitted_at" in message ? message.submitted_at : undefined) ||
      ("sent_at" in message ? message.sent_at : undefined)
  );

const getStatusPriority = (status?: string): number =>
  status ? STATUS_PRIORITY[status.toLowerCase()] ?? -1 : -1;

const getMessageKey = (message: WhatsAppMessage): string =>
  message.message_uuid ||
  message.request_id ||
  `${message.to}-${getMessageTimestamp(message)}-${message.template_name || message.text || ""}`;

const getLatestOutboundMessages = (
  messages: WhatsAppMessage[]
): WhatsAppMessage[] => {
  const messageMap = new Map<string, WhatsAppMessage>();

  messages.forEach((message) => {
    const key = getMessageKey(message);
    const existing = messageMap.get(key);

    if (!existing) {
      messageMap.set(key, message);
      return;
    }

    const currentPriority = getStatusPriority(message.status);
    const existingPriority = getStatusPriority(existing.status);
    const currentTime = getMessageTimestamp(message);
    const existingTime = getMessageTimestamp(existing);

    if (
      currentPriority > existingPriority ||
      (currentPriority === existingPriority && currentTime > existingTime)
    ) {
      messageMap.set(key, message);
    }
  });

  return Array.from(messageMap.values());
};

const getReadableMessages = (chat: WhatsAppMessageLog): ReadableMessage[] => {
  const sentMessages = Array.isArray(chat.sentMsgList) ? chat.sentMsgList : [];
  const replies = Array.isArray(chat.replyMsgList) ? chat.replyMsgList : [];

  return [
    ...getLatestOutboundMessages(sentMessages).map((message) => ({
      timestamp: getMessageTimestamp(message),
      isRead: getReadFlag(message as unknown as Record<string, unknown>),
    })),
    ...replies.map((message) => ({
      timestamp: getMessageTimestamp(message),
      isRead: getReadFlag(message as unknown as Record<string, unknown>),
    })),
  ].filter((message) => message.timestamp > 0);
};

export const getUnreadCount = (chat: WhatsAppMessageLog): number => {
  const readableMessages = getReadableMessages(chat);
  const readTimestamp = getChatReadTimestamp(chat);

  if (readTimestamp !== undefined) {
    return readableMessages.filter((message) => message.timestamp > readTimestamp)
      .length;
  }

  const explicitUnreadCount = getExplicitUnreadCount(chat);
  if (explicitUnreadCount !== undefined) return explicitUnreadCount;

  const chatReadFlag = getReadFlag(chat as unknown as Record<string, unknown>);
  if (chatReadFlag !== undefined) {
    return chatReadFlag ? 0 : readableMessages.length;
  }

  const replies = Array.isArray(chat.replyMsgList) ? chat.replyMsgList : [];
  const inboundUnreadCount = getInboundUnreadCount(replies);
  if (inboundUnreadCount !== undefined) return inboundUnreadCount;

  const messagesWithReadFlags = readableMessages.filter(
    (message) => message.isRead !== undefined
  );
  if (messagesWithReadFlags.length > 0) {
    return messagesWithReadFlags.filter((message) => !message.isRead).length;
  }

  return readableMessages.length;
};

export const hasUnreadMessages = (chat: WhatsAppMessageLog): boolean =>
  getUnreadCount(chat) > 0;

export const getMessageStatusCounts = (
  chat: WhatsAppMessageLog
): MessageStatusCounts => {
  const readableMessageCount = getReadableMessages(chat).length;
  const unread = getUnreadCount(chat);
  const all = Math.max(readableMessageCount, unread);

  return {
    all,
    read: Math.max(0, all - unread),
    unread,
  };
};
