export interface WhatsAppMessageLog {
  id: string;

  // 🔹 Contact Info
  mobile: string;
  integrated_number: string;

  // 🔹 Timestamps
  createdDateTime: string; // Firestore timestamp as string
  createdDateTimeMili: number;
  updatedDateTime?: string;
  updatedDateTimeMili?: number;
  isRead?: boolean;
  unreadCount?: number;
  lastReadAt?: string;
  lastReadAtMili?: number;
  readAt?: string;
  readDateTimeMili?: number;

  // 🔹 Messages
  sentMsgList: WhatsAppMessage[];
  replyMsgList: WhatsAppReplyMessage[];

  // 🔹 Meta Fields
  pluginsource?: string | null;
  request_id?: string;
  failure_reason?: string | null;
}

export interface WhatsAppReplyMessage {
  company_id: number; // Company or account identifier
  content_type:
    | "text"
    | "image"
    | "document"
    | "video"
    | "audio"
    | "sticker"
    | string; // Message type
  createdDateTimeMili?: number; // Milliseconds timestamp
  customer_name: string; // Name of the customer (e.g. "Ravi Dhamne")
  integrated_number: string; // WhatsApp Business API number (e.g. "918669966793")
  message_uuid: string; // Unique message identifier from WhatsApp
  received_at: string; // Human-readable received date (e.g. "2025-11-07 08:56:55")
  replied_message_id: string | null; // ID of the message this replies to (if any)
  sender: string; // The number of the message sender (e.g. "919158724772")
  text: string; // Text content (if any)
  url?: string;
  template_name?: string; // Optional media URL
}

/**
 * Represents a single message event in WhatsApp flow
 */
export interface WhatsAppMessage {
  // Unique identifiers
  message_uuid: string;
  request_id?: string;
  content_type:
    | "text"
    | "image"
    | "document"
    | "video"
    | "audio"
    | "sticker"
    | string; 

  // Status Info
  status: "sent" | "delivered" | "read" | "failed" | string;
  message_type: "template" | "text" | string;
  direction: "inbound" | "outbound";
  failure_reason: string | null;

  // Timestamps
  sent_at: number;
  submitted_at: number;
  delivered_at: number;
  createdDateTimeMili?: number;
  conversation_expiration_timestamp?: string | null;

  // Template Metadata
  template_name?: string;
  text?: string;
  originalMsg?: string;
  origialMsg?: string;
  originalTime?: number;
  template_language?: string;

  // Content
  content: WhatsAppContent;

  // Recipient
  to: string;

  // Misc
  integrated_number: string;
  pluginsource?: string | null;
}

/**
 * Represents the main content of a WhatsApp message
 */
export interface WhatsAppContent {
  messaging_product: "whatsapp";
  template: WhatsAppTemplate;
}

/**
 * Represents the WhatsApp message template payload
 */
export interface WhatsAppTemplate {
  name: string;
  language: {
    code: string;
    policy: "deterministic" | string;
  };
  components: WhatsAppComponent[];
}

/**
 * Represents components within a WhatsApp template
 * (header, body, etc.)
 */
export interface WhatsAppComponent {
  type: "header" | "body" | string;
  parameters: WhatsAppParameter[];
}

/**
 * Represents individual parameters used in template components
 */
export interface WhatsAppParameter {
  type: "text" | "document" | string;
  text?: string;
  document?: {
    filename: string;
    link: string;
  };
}
