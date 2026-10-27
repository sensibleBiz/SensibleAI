import React, { useEffect, useState, useMemo } from "react";
import { Input, Empty, Badge, Avatar, Segmented, Button } from "antd";
import {
  ArrowLeftOutlined,
  SearchOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
} from "@ant-design/icons";
import type { WhatsAppMessageLog } from "../types/types";
import { getTemplateMessageText } from "./whatsappTemplateMessage";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { toTitleCase } from "@/shared/utils/helperFunctions";
import {
  getUnreadCount,
  hasUnreadMessages,
  normalizeTimestamp,
} from "./whatsappMessageStatus";

dayjs.extend(relativeTime);

type MessageReadFilter = "all" | "read" | "unread";
const INITIAL_RENDERED_CHAT_COUNT = 60;
const CHAT_RENDER_BATCH_SIZE = 60;

interface ChatListProps {
  chats: WhatsAppMessageLog[];
  onSelectChat: (chat: WhatsAppMessageLog) => void;
  selectedChatId?: string;
  categoryLabel?: string;
  hasMoreChats?: boolean;
  loadingMoreChats?: boolean;
  onLoadMoreChats?: () => void;
  onBackToCategories?: () => void;
}

const ChatList: React.FC<ChatListProps> = ({
  chats,
  onSelectChat,
  selectedChatId,
  categoryLabel,
  hasMoreChats = false,
  loadingMoreChats = false,
  onLoadMoreChats,
  onBackToCategories,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [readFilter, setReadFilter] = useState<MessageReadFilter>("all");
  const [visibleChatCount, setVisibleChatCount] = useState(
    INITIAL_RENDERED_CHAT_COUNT
  );

  // Filter chats by number or customer name
  const searchFilteredChats = useMemo(() => {
    if (!searchTerm.trim()) return chats;

    const lowerSearch = searchTerm.toLowerCase();

    return chats.filter(
      (chat) =>
        chat.mobile?.toLowerCase().includes(lowerSearch) ||
        chat.replyMsgList?.some((msg) =>
          msg.customer_name?.toLowerCase().includes(lowerSearch)
        )
    );
  }, [searchTerm, chats]);

  const filterCounts = useMemo(() => {
    const unread = searchFilteredChats.filter(hasUnreadMessages).length;
    return {
      all: searchFilteredChats.length,
      read: searchFilteredChats.length - unread,
      unread,
    };
  }, [searchFilteredChats]);

  const filteredChats = useMemo(() => {
    if (readFilter === "all") return searchFilteredChats;

    return searchFilteredChats.filter((chat) =>
      readFilter === "unread" ? hasUnreadMessages(chat) : !hasUnreadMessages(chat)
    );
  }, [readFilter, searchFilteredChats]);

  useEffect(() => {
    setVisibleChatCount(INITIAL_RENDERED_CHAT_COUNT);
  }, [filteredChats]);

  const visibleChats = useMemo(
    () => filteredChats.slice(0, visibleChatCount),
    [filteredChats, visibleChatCount]
  );

  const hasMoreRenderedChats = visibleChatCount < filteredChats.length;

  const renderFilterLabel = (label: string, count: number) => (
    <span className="inline-flex items-center gap-1.5 px-1">
      <span>{label}</span>
      <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] leading-none text-gray-600">
        {count}
      </span>
    </span>
  );

  const emptyDescription =
    readFilter === "all"
      ? searchTerm
        ? "No chats found"
        : "No conversations yet"
      : `No ${readFilter} messages found`;

  const canLoadMoreChats = hasMoreChats && Boolean(onLoadMoreChats);

  const handleChatListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (loadingMoreChats) return;

    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;

    if (!isNearBottom) return;

    if (hasMoreRenderedChats) {
      setVisibleChatCount((currentCount) =>
        Math.min(currentCount + CHAT_RENDER_BATCH_SIZE, filteredChats.length)
      );
      return;
    }

    if (canLoadMoreChats) {
      onLoadMoreChats?.();
    }
  };

  const handleShowMoreChats = () => {
    if (hasMoreRenderedChats) {
      setVisibleChatCount((currentCount) =>
        Math.min(currentCount + CHAT_RENDER_BATCH_SIZE, filteredChats.length)
      );
      return;
    }

    onLoadMoreChats?.();
  };

  // Get last message preview
  const getLastMessage = (chat: WhatsAppMessageLog) => {
    const sentList = Array.isArray(chat?.sentMsgList) ? chat.sentMsgList : [];
    const replyList = Array.isArray(chat?.replyMsgList) ? chat.replyMsgList : [];

    // Combine and sort all messages with normalized timestamps
    const allMessages = [
      ...sentList.map((msg) => ({ 
        ...msg, 
        timestamp: normalizeTimestamp(msg.createdDateTimeMili || msg.sent_at) 
      })),
      ...replyList.map((msg) => ({ 
        ...msg, 
        timestamp: normalizeTimestamp(msg.createdDateTimeMili) 
      })),
    ].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const lastMsg = allMessages[0];
    if (!lastMsg) return { text: "No messages", time: null };

    let preview = "";
    if (lastMsg.text) {
      preview = lastMsg.text;
    } else if (lastMsg.template_name) {
      preview = getTemplateMessageText(lastMsg) || lastMsg.template_name;
    } else if (lastMsg.content_type === "image") {
      preview = "📷 Image";
    } else if (lastMsg.content_type === "video") {
      preview = "🎥 Video";
    } else if (lastMsg.content_type === "audio") {
      preview = "🎤 Audio";
    } else if (lastMsg.content_type === "document") {
      preview = "📄 Document";
    } else {
      preview = "Message";
    }

    return {
      text: preview.length > 50 ? preview.substring(0, 50) + "..." : preview,
      time: lastMsg.timestamp ? dayjs(lastMsg.timestamp).fromNow() : null,
    };
  };

  // Get customer name
  const getCustomerName = (chat: WhatsAppMessageLog): string => {
    const firstReply = chat.replyMsgList?.[0];
    const rawName = firstReply?.customer_name || chat.mobile || "Unknown";
    // Keep phone numbers as-is; title-case actual names.
    if (/^\d[\d\s+-]*$/.test(rawName.trim())) return rawName;
    return toTitleCase(rawName, "Unknown");
  };

  // Get avatar URL
  const getAvatarUrl = (chat: WhatsAppMessageLog): string => {
    const name = getCustomerName(chat);
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
  };

  return (
    <div className="h-full flex flex-col bg-[#f0f2f5]">
      {/* Header */}
      <div className="bg-[#008069] px-4 py-4 flex items-center justify-between shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          {onBackToCategories && (
            <button
              type="button"
              aria-label="Back to WhatsApp options"
              onClick={onBackToCategories}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
            >
              <ArrowLeftOutlined className="text-base" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-white">WhatsApp</h2>
            {categoryLabel && (
              <p className="truncate text-xs font-medium text-green-100">
                {categoryLabel}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="text-white hover:text-gray-200 transition-colors"
          >
            <VideoCameraOutlined className="text-lg" />
          </button>
          <button
            type="button"
            className="text-white hover:text-gray-200 transition-colors"
          >
            <PhoneOutlined className="text-lg" />
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="px-3 py-3 bg-white border-b border-gray-200">
        <div className="relative">
          <Input
            placeholder="Search or start new chat"
            allowClear
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            prefix={<SearchOutlined className="text-gray-400" />}
            className="w-full"
            size="large"
            style={{
              borderRadius: "8px",
            }}
          />
        </div>
        <Segmented
          block
          value={readFilter}
          onChange={(value) => setReadFilter(value as MessageReadFilter)}
          options={[
            { label: renderFilterLabel("All", filterCounts.all), value: "all" },
            {
              label: renderFilterLabel("Unread", filterCounts.unread),
              value: "unread",
            },
            { label: renderFilterLabel("Read", filterCounts.read), value: "read" },
          ]}
          className="mt-3 w-full"
        />
      </div>

      {/* Chat List */}
      <div
        className="flex-1 overflow-y-auto bg-white"
        onScroll={handleChatListScroll}
      >
        {filteredChats.length > 0 ? (
          <>
            <div className="divide-y divide-gray-100">
              {visibleChats.map((chat) => {
                const isSelected = selectedChatId === chat.id;
                const lastMessage = getLastMessage(chat);
                const unreadCount = getUnreadCount(chat);
                const customerName = getCustomerName(chat);

                return (
                  <div
                    key={chat.id}
                    onClick={() => onSelectChat(chat)}
                    className={`
                      px-4 py-3 cursor-pointer transition-all duration-150
                      ${isSelected ? "bg-[#e9edef]" : "hover:bg-[#f5f6f6]"}
                      ${isSelected ? "border-l-4 border-[#008069]" : ""}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <Avatar
                          src={getAvatarUrl(chat)}
                          size={50}
                          className="bg-[#008069]"
                        >
                          {customerName.charAt(0).toUpperCase()}
                        </Avatar>
                        {unreadCount > 0 && (
                          <Badge
                            count={unreadCount}
                            className="absolute -top-1 -right-1"
                            style={{
                              backgroundColor: "#25d366",
                            }}
                          />
                        )}
                      </div>

                      {/* Chat Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-semibold text-gray-900 text-[15px] truncate">
                            {customerName}
                          </h3>
                          {lastMessage.time && (
                            <span className="text-xs text-gray-500 flex-shrink-0 ml-2">
                              {lastMessage.time}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <p
                            className={`text-sm truncate ${
                              unreadCount > 0
                                ? "text-gray-900 font-medium"
                                : "text-gray-600"
                            }`}
                          >
                            {lastMessage.text}
                          </p>
                          {unreadCount > 0 && (
                            <Badge
                              count={unreadCount}
                              className="ml-2 flex-shrink-0"
                              style={{
                                backgroundColor: "#25d366",
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Empty
              description={
                <span className="text-gray-500">
                  {emptyDescription}
                </span>
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        )}
        {(hasMoreRenderedChats || canLoadMoreChats) && (
          <div className="px-4 py-3 border-t border-gray-100 bg-white">
            <Button
              block
              loading={!hasMoreRenderedChats && loadingMoreChats}
              onClick={handleShowMoreChats}
              className="border-[#008069] text-[#008069] hover:!border-[#006b57] hover:!text-[#006b57]"
            >
              {hasMoreRenderedChats ? "Show more conversations" : "Load more conversations"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatList;
