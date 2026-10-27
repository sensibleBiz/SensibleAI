import type { WhatsAppMessage, WhatsAppMessageLog, WhatsAppReplyMessage } from "../types/types";
import { getMessageStatusCounts } from "./whatsappMessageStatus.ts";

export type WhatsAppMessageCategory = "renewal" | "event" | "crm" | "others";

export interface WhatsAppCategoryOption {
  key: WhatsAppMessageCategory;
  label: string;
  shortLabel: string;
  description: string;
}

export interface WhatsAppCategoryStats {
  all: number;
  read: number;
  unread: number;
}

export type WhatsAppCategorizedChats = Record<
  WhatsAppMessageCategory,
  WhatsAppMessageLog[]
>;

export const WHATSAPP_CATEGORY_PARAM = "category";
export const WHATSAPP_STATS_VERSION = 1;
export const WHATSAPP_STATS_FIELD = "whatsappCategoryStats";
export const WHATSAPP_STATS_VERSION_FIELD = "whatsappStatsVersion";

export const WHATSAPP_CATEGORY_OPTIONS: WhatsAppCategoryOption[] = [
  {
    key: "renewal",
    label: "Renewal",
    shortLabel: "Renewal",
    description: "Subscription and validity messages",
  },
  {
    key: "event",
    label: "Event",
    shortLabel: "Event",
    description: "Event registration and payment messages",
  },
  {
    key: "crm",
    label: "CRM",
    shortLabel: "CRM",
    description: "CRM lead and follow-up messages",
  },
  {
    key: "others",
    label: "Others",
    shortLabel: "Others",
    description: "Messages outside renewal, event, and CRM",
  },
];

const CATEGORY_PARAM_ALIASES: Record<string, WhatsAppMessageCategory> = {
  subscription: "renewal",
  renewal: "renewal",
  renewals: "renewal",
  "subscription renewal": "renewal",
  "subscription-renewal": "renewal",
  subscription_renewal: "renewal",
  event: "event",
  events: "event",
  crm: "crm",
  other: "others",
  others: "others",
};

const CATEGORY_SEARCH_TERMS: Record<WhatsAppMessageCategory, string[]> = {
  renewal: [
    "subscription renewal",
    "renewal template",
    "renewal",
    "subscription",
    "renew",
    "validity",
    "expired",
    "expiry",
    "plan renewal",
  ],
  event: [
    "event registration",
    "event payment",
    "event reminder",
    "event",
    "events",
    "participant",
    "registration link",
    "attendance",
    "venue",
    "webinar",
    "seminar",
    "bootcamp",
  ],
  crm: [
    "crm",
    "lead",
    "leads",
    "follow up",
    "followup",
    "enquiry",
    "inquiry",
    "quotation",
    "pipeline",
    "deal",
    "demo",
  ],
  others: ["other", "others"],
};

const CATEGORY_MATCH_ORDER: WhatsAppMessageCategory[] = [
  "renewal",
  "event",
  "crm",
  "others",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const collectSearchText = (value: unknown, depth = 0): string[] => {
  if (depth > 5 || value === undefined || value === null) return [];

  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSearchText(item, depth + 1));
  }

  if (!isRecord(value)) return [];

  return Object.entries(value).flatMap(([key, item]) => [
    key,
    ...collectSearchText(item, depth + 1),
  ]);
};

const getSearchText = (value: unknown): string =>
  normalizeSearchText(collectSearchText(value).join(" "));

const getDirectCategory = (
  value: unknown
): WhatsAppMessageCategory | undefined => {
  const searchText = getSearchText(value);
  if (!searchText) return undefined;

  return CATEGORY_MATCH_ORDER.find((category) =>
    CATEGORY_SEARCH_TERMS[category].some((term) =>
      searchText.includes(normalizeSearchText(term))
    )
  );
};

const getChatMetadataCategory = (
  chat: WhatsAppMessageLog
): WhatsAppMessageCategory | undefined => {
  const metadata = Object.fromEntries(
    Object.entries(chat).filter(
      ([key]) =>
        key !== "sentMsgList" &&
        key !== "replyMsgList" &&
        key !== WHATSAPP_STATS_FIELD &&
        key !== WHATSAPP_STATS_VERSION_FIELD
    )
  );
  return getDirectCategory(metadata);
};

const getMessageIdentityKeys = (message: WhatsAppMessage): string[] =>
  [message.message_uuid, message.request_id].filter(
    (value): value is string => Boolean(value)
  );

const getSentMessageCategory = (
  message: WhatsAppMessage,
  fallbackCategory?: WhatsAppMessageCategory
): WhatsAppMessageCategory | undefined =>
  getDirectCategory(message) ?? fallbackCategory;

const getReplyMessageCategory = (
  message: WhatsAppReplyMessage,
  sentMessageCategoryById: Map<string, WhatsAppMessageCategory>,
  fallbackCategory?: WhatsAppMessageCategory
): WhatsAppMessageCategory | undefined =>
  getDirectCategory(message) ??
  (message.replied_message_id
    ? sentMessageCategoryById.get(message.replied_message_id)
    : undefined) ??
  fallbackCategory;

export const getWhatsAppCategoryFromParam = (
  value: string | null
): WhatsAppMessageCategory | null => {
  if (!value) return null;

  return CATEGORY_PARAM_ALIASES[normalizeSearchText(value)] ?? null;
};

export const getWhatsAppCategoryLabel = (
  category: WhatsAppMessageCategory
): string =>
  WHATSAPP_CATEGORY_OPTIONS.find((option) => option.key === category)?.label ??
  "WhatsApp";

const createEmptyCategorizedChats = (): WhatsAppCategorizedChats => ({
  renewal: [],
  event: [],
  crm: [],
  others: [],
});

const getCategorizedChatMessageEntries = (
  chat: WhatsAppMessageLog
): Array<[WhatsAppMessageCategory, WhatsAppMessageLog]> => {
  const sentMessages = Array.isArray(chat.sentMsgList) ? chat.sentMsgList : [];
  const replyMessages = Array.isArray(chat.replyMsgList) ? chat.replyMsgList : [];
  const chatMetadataCategory = getChatMetadataCategory(chat);

  if (chatMetadataCategory) {
    return [[chatMetadataCategory, chat]];
  }

  const fallbackCategory: WhatsAppMessageCategory = "others";
  const sentMessageCategoryById = new Map<string, WhatsAppMessageCategory>();

  sentMessages.forEach((message) => {
    const messageCategory = getSentMessageCategory(message, fallbackCategory);
    if (!messageCategory) return;

    getMessageIdentityKeys(message).forEach((key) => {
      sentMessageCategoryById.set(key, messageCategory);
    });
  });

  return WHATSAPP_CATEGORY_OPTIONS.flatMap((option) => {
    const filteredSentMessages = sentMessages.filter(
      (message) => getSentMessageCategory(message, fallbackCategory) === option.key
    );
    const filteredReplyMessages = replyMessages.filter(
      (message) =>
        getReplyMessageCategory(
          message,
          sentMessageCategoryById,
          fallbackCategory
        ) === option.key
    );

    if (filteredSentMessages.length === 0 && filteredReplyMessages.length === 0) {
      return [];
    }

    return [
      [
        option.key,
        {
          ...chat,
          sentMsgList: filteredSentMessages,
          replyMsgList: filteredReplyMessages,
        },
      ],
    ];
  });
};

export const getWhatsAppCategorizedChats = (
  chats: WhatsAppMessageLog[]
): WhatsAppCategorizedChats => {
  const categorizedChats = createEmptyCategorizedChats();

  chats.forEach((chat) => {
    const chatCategories = new Set(
      getCategorizedChatMessageEntries(chat).map(([category]) => category)
    );

    chatCategories.forEach((category) => {
      // A category decides which conversations appear in the list. Once a
      // conversation is opened, keep its complete sent and received history.
      categorizedChats[category].push(chat);
    });
  });

  return categorizedChats;
};

export const getWhatsAppCategoryStats = (
  categorizedChats: WhatsAppCategorizedChats
): Record<WhatsAppMessageCategory, WhatsAppCategoryStats> =>
  WHATSAPP_CATEGORY_OPTIONS.reduce((statsByCategory, option) => {
    const categoryChats = categorizedChats[option.key];
    const stats = categoryChats.reduce<WhatsAppCategoryStats>(
      (categoryTotals, chat) => {
        const chatCounts = getMessageStatusCounts(chat);

        return {
          all: categoryTotals.all + chatCounts.all,
          read: categoryTotals.read + chatCounts.read,
          unread: categoryTotals.unread + chatCounts.unread,
        };
      },
      { all: 0, read: 0, unread: 0 }
    );

    return {
      ...statsByCategory,
      [option.key]: stats,
    };
  }, {} as Record<WhatsAppMessageCategory, WhatsAppCategoryStats>);
/**
 * Calculates category totals from category-specific message fragments while
 * the conversation list itself retains each chat's complete history.
 */
export const getWhatsAppCategoryStatsForChats = (
  chats: WhatsAppMessageLog[]
): Record<WhatsAppMessageCategory, WhatsAppCategoryStats> => {
  const categorizedMessageFragments = createEmptyCategorizedChats();

  chats.forEach((chat) => {
    getCategorizedChatMessageEntries(chat).forEach(
      ([category, categorizedChat]) => {
        categorizedMessageFragments[category].push(categorizedChat);
      }
    );
  });

  return getWhatsAppCategoryStats(categorizedMessageFragments);
};
