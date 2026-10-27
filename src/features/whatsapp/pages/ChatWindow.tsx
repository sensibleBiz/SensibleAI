import React, { useEffect, useRef, useState, useMemo } from "react";
import dayjs from "dayjs";
import {
  SendOutlined,
  PaperClipOutlined,
  CheckOutlined,
  CheckCircleOutlined,
  MoreOutlined,
  PhoneOutlined,
  VideoCameraOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
} from "@ant-design/icons";
import type { WhatsAppContent, WhatsAppMessageLog } from "../types/types";
import relativeTime from "dayjs/plugin/relativeTime";
import { Input, Button, Upload, Dropdown, MenuProps } from "antd";
import { useMessageApi } from "@/shared/hooks";
import { toTitleCase } from "@/shared/utils/helperFunctions";
import { getErrorMessage } from "@/shared/utils/errorUtils";
import { getTemplateMessageText } from "./whatsappTemplateMessage";
import { whatsappChatApi } from "../api/whatsappChatApi";

dayjs.extend(relativeTime);

interface ChatWindowProps {
  chat?: WhatsAppMessageLog;
  outletId: string;
  onBack?: () => void;
  onConversationUpdated?: (chat: WhatsAppMessageLog) => void;
}

interface MessageItem {
  id: string;
  direction: "inbound" | "outbound";
  content_type?: string;
  message_type?: string;
  text?: string;
  request_id?: string;
  originalMsg?: string;
  origialMsg?: string;
  url?: string;
  template_name?: string;
  createdDateTimeMili?: number;
  originalTime?: number;
  sent_at?: number;
  status?: string; // Status for outbound messages (sent, delivered, read, failed)
  customer_name?: string;
  sender?: string;
  timestamp?: number;
  content?: TemplateMessageContent; // Template content structure
  message_uuid?: string;
  button?: {
    text?: string;
  };
}

interface TemplateBodyField {
  text?: string;
}

type DynamicTemplateContent = Partial<WhatsAppContent> & {
  text?: string;
} & Partial<Record<`body_${number}`, TemplateBodyField>>;

type TemplateMessageContent = WhatsAppContent | DynamicTemplateContent;

// WhatsApp history contains legacy seconds, milliseconds, date strings, and
// Firestore Timestamp objects. Normalize every supported shape before sorting.
const NORMALIZE_THRESHOLD = 946684800000; // Jan 1, 2000 in milliseconds

const normalizeTimestamp = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value < NORMALIZE_THRESHOLD ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return numericValue < NORMALIZE_THRESHOLD
        ? numericValue * 1000
        : numericValue;
    }

    const parsedDate = dayjs(value);
    return parsedDate.isValid() ? parsedDate.valueOf() : 0;
  }

  if (typeof value === "object" && value !== null) {
    const timestamp = value as {
      seconds?: number;
      _seconds?: number;
      toMillis?: () => number;
    };
    if (typeof timestamp.toMillis === "function") {
      const milliseconds = timestamp.toMillis();
      return Number.isFinite(milliseconds) ? milliseconds : 0;
    }

    const seconds = timestamp.seconds ?? timestamp._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }

  return 0;
};

const getMessageTimestamp = (...values: unknown[]): number => {
  for (const value of values) {
    const timestamp = normalizeTimestamp(value);
    if (timestamp > 0) return timestamp;
  }
  return 0;
};
const ChatWindow: React.FC<ChatWindowProps> = ({ chat, outletId, onBack, onConversationUpdated }) => {
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [messageText, setMessageText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingMessages, setSendingMessages] = useState<Set<string>>(new Set());
  const messageApi = useMessageApi();
  const chatMobile = chat?.mobile;

  const chatCreatedTimestamp = chat?.createdDateTimeMili;
  const sentMsgList = chat?.sentMsgList;
  const replyMsgList = chat?.replyMsgList;
  const hasActiveChat = Boolean(chat);

  // Combine and sort messages - MUST be before any conditional returns
  // Filter messages to ensure they belong to the current chat's mobile number
  const messages: MessageItem[] = useMemo(() => {
    if (!chatMobile) return [];
    
    // replyMsgList already belongs to this customer chat. Older webhook rows can
    // omit `sender` or store it in a different format, so keep every reply.
    const inbound = (replyMsgList || []).map((msg, index): MessageItem => {
      const timestamp = getMessageTimestamp(
        msg.createdDateTimeMili,
        msg.received_at,
        chatCreatedTimestamp
      );

      return {
        ...msg,
        direction: "inbound" as const,
        id: msg.message_uuid || `inbound-${timestamp}-${index}`,
        timestamp,
        request_id: undefined,
        status: undefined,
      };
    });
    // Filter outbound messages: messages in sentMsgList should belong to this chat
    // Since messages are already in the chat's sentMsgList, we include all of them
    const outbound = (sentMsgList || []).map((msg, index): MessageItem => {
      const timestamp = getMessageTimestamp(
        msg.createdDateTimeMili,
        msg.sent_at,
        msg.submitted_at,
        msg.delivered_at,
        msg.originalTime,
        chatCreatedTimestamp
      );

      return {
        ...msg,
        direction: "outbound" as const,
        id:
          msg.message_uuid ||
          msg.request_id ||
          `outbound-${timestamp}-${index}`,
        timestamp,
        status: msg.status,
        request_id: msg.request_id,
      };
    });
    // Combine all messages
    const allMessages = [...inbound, ...outbound];

    // Deduplicate messages by message_uuid - keep only the latest status
    // Status priority: read > delivered > sent > others
    const statusPriority: { [key: string]: number } = {
      read: 3,
      delivered: 2,
      sent: 1,
      failed: 0,
    };

    const messageMap = new Map<string, MessageItem>();
    allMessages.forEach((msg) => {
      // Use message_uuid, request_id, or id as unique identifier
      const uuid = msg.message_uuid || msg.request_id || msg.id;
      
      // If no UUID at all, use a combination of timestamp and direction as fallback
      if (!uuid) {
        const fallbackId = `${msg.direction}-${msg.timestamp || Date.now()}-${Math.random()}`;
        messageMap.set(fallbackId, msg);
        return;
      }

      const existing = messageMap.get(uuid);
      if (!existing) {
        messageMap.set(uuid, msg);
      } else {
        // Compare status priority - keep the one with higher priority
        // Status only exists on outbound messages, inbound messages won't have it
        const existingStatus = existing.status || "";
        const currentStatus = msg.status || "";
        const existingPriority = statusPriority[existingStatus] ?? -1;
        const currentPriority = statusPriority[currentStatus] ?? -1;
        
        if (currentPriority > existingPriority) {
          messageMap.set(uuid, msg);
        } else if (currentPriority === existingPriority) {
          // If same priority, keep the one with latest timestamp
          const existingTime = existing.timestamp || existing.createdDateTimeMili || 0;
          const currentTime = msg.timestamp || msg.createdDateTimeMili || 0;
          if (currentTime > existingTime) {
            messageMap.set(uuid, msg);
          }
        }
      }
    });

    // Convert map back to array and sort by timestamp
    const finalMessages = Array.from(messageMap.values()).sort(
      (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
    );
    
    // Debug logging (can be removed in production)
    if (finalMessages.length > 0) {
      console.log("Chat messages:", {
        total: finalMessages.length,
        inbound: finalMessages.filter(m => m.direction === "inbound").length,
        outbound: finalMessages.filter(m => m.direction === "outbound").length,
        chatMobile,
        sentMsgListCount: sentMsgList?.length || 0,
        replyMsgListCount: replyMsgList?.length || 0,
      });
    }
    
    return finalMessages;
  }, [chatCreatedTimestamp, chatMobile, replyMsgList, sentMsgList]);

  // The PostgreSQL conversation contains the complete migrated message history.
  // Render it all so older sent messages and customer replies remain
  // visible instead of silently clipping them to a recent date window.
  const visibleMessages = messages;
  // Group messages by date - MUST be before any conditional returns
  const groupedMessages = useMemo(() => {
    const groups: { [key: string]: MessageItem[] } = {};
    visibleMessages.forEach((msg) => {
      // Use normalized timestamp
      const timestamp = msg.timestamp || Date.now();
      const date = dayjs(timestamp).format("YYYY-MM-DD");
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(msg);
    });
    return groups;
  }, [visibleMessages]);

  // Auto scroll to bottom when chat changes or new messages arrive
  useEffect(() => {
    if (hasActiveChat && messagesEndRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [chat?.id, hasActiveChat, messages.length]);

  // Auto scroll on new messages
  useEffect(() => {
    if (messagesEndRef.current && hasActiveChat) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [hasActiveChat, sentMsgList, replyMsgList]);

  if (!chat) {
    return (
      <div className="flex h-full items-center justify-center bg-[#efeae2]">
        <div className="text-center">
          <div className="text-6xl mb-4">💬</div>
          <p className="text-gray-500 text-lg">Select a chat to start messaging</p>
        </div>
      </div>
    );
  }

  // Get customer name
  const customerNameRaw =
    chat.replyMsgList?.[0]?.customer_name || chat.mobile || "Unknown";
  const customerName = /^\d[\d\s+-]*$/.test(customerNameRaw.trim())
    ? customerNameRaw
    : toTitleCase(customerNameRaw, "Unknown");

  // Handle file upload
  const handleFileUpload = (file: File) => {
    if (file.size > 64 * 1024 * 1024) {
      messageApi.error("File size should be less than 64MB");
      return false;
    }
    setFile(file);
    messageApi.info(`File attached: ${file.name}`);
    return false; // Prevent auto-upload
  };

  // Handle sending message
  const handleSendMessage = async () => {
    if (!messageText.trim() && !file) {
      messageApi.warning("Please enter a message or attach a file.");
      return;
    }

    const tempId = `temp-${Date.now()}`;
    setSendingMessages((prev) => new Set(prev).add(tempId));
    setLoading(true);

    try {
      const updatedConversation = await whatsappChatApi.sendMessage({
        outletId,
        conversationId: chat.id,
        text: messageText.trim() || file?.name || "",
        contentType: file ? "document" : "text",
      });
      onConversationUpdated?.(updatedConversation);
      messageApi.success("Message sent successfully!");
      setMessageText("");
      setFile(null);
    } catch (error: unknown) {
      console.error("Message send error:", error);
      messageApi.error(getErrorMessage(error, "Failed to send message. Please try again."));
    } finally {
      setLoading(false);
      setSendingMessages((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  };

  // Render message status
  const renderMessageStatus = (msg: MessageItem) => {
    if (msg.direction === "inbound") return null;

    const status = msg.status;
    if (status === "read" || status === "delivered") {
      return <CheckCircleOutlined className="text-blue-500 ml-1" style={{color:"blue"}}/>;
    } else if (status === "sent") {
      return <CheckOutlined className="text-gray-400 ml-1" />;
    }
    return <CheckOutlined className="text-gray-300 ml-1" />;
  };

  // Render date separator
  const renderDateSeparator = (date: string) => {
    const today = dayjs().format("YYYY-MM-DD");
    const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");

    let label = "";
    if (date === today) {
      label = "Today";
    } else if (date === yesterday) {
      label = "Yesterday";
    } else {
      label = dayjs(date).format("MMMM DD, YYYY");
    }

    return (
      <div className="flex items-center justify-center my-4">
        <div className="bg-[#e9edef] px-3 py-1 rounded-full">
          <span className="text-xs text-gray-600 font-medium">{label}</span>
        </div>
      </div>
    );
  };

  // Render inbound message content
  const renderInboundContent = (msg: MessageItem) => {
    switch (msg.content_type) {
      case "text":
        return <p className="text-[15px] whitespace-pre-wrap break-words">{msg.text || "No message content"}</p>;

      case "image":
        return (
          <div>
            <img
              src={msg.url}
              alt="Received media"
              className="rounded-lg max-w-[300px] max-h-[300px] object-cover cursor-pointer"
              onClick={() => window.open(msg.url, "_blank")}
            />
            {msg.text && (
              <p className="mt-2 text-[15px] whitespace-pre-wrap break-words">{msg.text}</p>
            )}
          </div>
        );

      case "video":
        return (
          <div>
            <video
              src={msg.url}
              controls
              className="rounded-lg max-w-[300px] max-h-[300px]"
            />
            {msg.text && (
              <p className="mt-2 text-[15px] whitespace-pre-wrap break-words">{msg.text}</p>
            )}
          </div>
        );

      case "audio":
        return (
          <div className="flex flex-col">
            <audio controls src={msg.url} className="w-full max-w-[250px]" />
            {msg.text && (
              <p className="mt-2 text-[15px] whitespace-pre-wrap break-words">{msg.text}</p>
            )}
          </div>
        );

      case "button":
        return (
          <div className="flex flex-col">
            {msg?.button?.text && (
              <p className="text-[15px] whitespace-pre-wrap break-words">{msg.button.text}</p>
            )}
          </div>
        );

      case "document":
      case "file":
        return (
          <a
            href={msg.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 p-2 bg-blue-50 rounded-lg"
          >
            <PaperClipOutlined />
            <span className="text-[15px]">{msg.text || "Download file"}</span>
          </a>
        );

      default:
        return (
          <p className="italic text-gray-400 text-[15px]">
            Unsupported type: {msg.content_type}
          </p>
        );
    }
  };

  // Template formatter function - supports both Firestore template payload shapes.
  const formatTemplateMessage = (msg: MessageItem): React.ReactNode => {
    const messageText = getTemplateMessageText(msg);

    // Fallback: try to extract from template.components structure
    const components = msg.content?.template?.components ?? [];
    const hasDoc =
      components.some((component) =>
        component.parameters?.some((parameter) => parameter.document)
      );
    const doc =
      hasDoc &&
      components
        .flatMap((component) => component.parameters ?? [])
        .find((parameter) => parameter.document)?.document;

    // Extract text from template components
    const templateTexts: string[] = [];
    if (components.length > 0) {
      components.forEach((component) => {
        component.parameters?.forEach((parameter) => {
          if (parameter.text) {
            templateTexts.push(parameter.text);
          }
        });
      });
    }

    return (
      <>
        {messageText ? (
          <p className="text-[15px] whitespace-pre-wrap break-words">
            {messageText}
          </p>
        ) : templateTexts.length > 0 ? (
          <div className="space-y-1">
            {templateTexts.map((text, idx) => (
              <p key={idx} className="text-[15px] whitespace-pre-wrap break-words">
                {text}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[15px] whitespace-pre-wrap break-words">
            {msg.text || msg.template_name || "No content"}
          </p>
        )}
        {doc && (
          <a
            href={doc.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-300 hover:text-blue-200 mt-2 text-sm"
          >
            <PaperClipOutlined />
            {doc?.filename}
          </a>
        )}
      </>
    );
  };

  // Render outbound message content
  const renderOutboundContent = (msg: MessageItem) => {
    // If it's a template message, use the formatter
    if (msg.message_type === "template" || msg.template_name) {
      return formatTemplateMessage(msg);
    }

    // Regular text message
    return (
      <p className="text-[15px] whitespace-pre-wrap break-words">
        {msg?.text || "No content"}
      </p>
    );
  };

  // Header menu items
  const headerMenuItems: MenuProps["items"] = [
    {
      key: "search",
      label: "Search",
      icon: <SearchOutlined />,
    },
    {
      key: "info",
      label: "Contact Info",
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#efeae2] relative">
      {/* Header */}
      <div className="bg-[#008069] px-4 py-3 flex items-center justify-between shadow-md z-10">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {onBack && (
            <button
              aria-label="Back to conversations"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 md:hidden"
              onClick={onBack}
              type="button"
            >
              <ArrowLeftOutlined />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
            <span className="text-[#008069] font-semibold text-lg">
              {customerName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-white text-base truncate">
              {customerName}
            </h2>
            <p className="text-xs text-green-100 truncate">
              {chat.mobile}
            </p>
          </div>
        </div>
       <div className="flex items-center gap-2">
          <button className="text-white hover:bg-white/20 p-2 rounded-full transition-colors">
            <VideoCameraOutlined className="text-lg" />
          </button>
          <button className="text-white hover:bg-white/20 p-2 rounded-full transition-colors">
            <PhoneOutlined className="text-lg" />
          </button>
          <Dropdown menu={{ items: headerMenuItems }} trigger={["click"]}>
            <button className="text-white hover:bg-white/20 p-2 rounded-full transition-colors">
              <MoreOutlined className="text-lg" />
            </button>
          </Dropdown>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <React.Fragment key={date}>
            {renderDateSeparator(date)}
            {dateMessages.map((msg) => {
              const isSent = msg.direction === "outbound";
              const isSending = sendingMessages.has(msg.id);

              return (
                <div
                  key={msg.id}
                  className={`flex mb-2 ${isSent ? "justify-end" : "justify-start"}`}
                >
                  <div
                  className={`max-w-[88%] px-3 py-2 rounded-lg shadow-sm sm:max-w-[75%] lg:max-w-[65%] ${
                      isSent
                        ? "bg-[#d9fdd3] rounded-tr-none"
                        : "bg-white rounded-tl-none"
                    } ${isSending ? "opacity-60" : ""}`}
                  >
                    {isSent ? renderOutboundContent(msg) : renderInboundContent(msg)}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[11px] text-gray-500">
                        {dayjs(msg.timestamp || Date.now()).format("hh:mm A")}
                      </span>
                      {renderMessageStatus(msg)}
                    </div>
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Area */}
      <div className="bg-[#f0f2f5] px-4 py-3 border-t border-gray-300">
        {file && (
          <div className="mb-2 flex items-center gap-2 bg-white px-3 py-2 rounded-lg">
            <PaperClipOutlined className="text-gray-500" />
            <span className="text-sm text-gray-700 flex-1 truncate">{file.name}</span>
            <button
              onClick={() => setFile(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Upload
            beforeUpload={handleFileUpload}
            showUploadList={false}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.mp4,.mp3,.txt"
          >
            <Button
              type="text"
              icon={<PaperClipOutlined />}
              className="text-gray-600 hover:text-gray-800"
              size="large"
            />
          </Upload>

          <Input.TextArea
            placeholder="Type a message"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={loading}
            autoSize={{ minRows: 1, maxRows: 4 }}
            className="flex-1 rounded-lg"
            style={{ resize: "none" }}
          />

          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={handleSendMessage}
            loading={loading}
            disabled={!messageText.trim() && !file}
            className="bg-[#008069] hover:bg-[#006b57] border-none rounded-full h-10 w-10 flex items-center justify-center"
          />
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
