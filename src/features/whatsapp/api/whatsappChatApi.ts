import { apiRequest } from "@/shared/api/apiClient";
import type { WhatsAppMessageLog } from "../types/types";

export interface WhatsAppConversationPage {
  items: WhatsAppMessageLog[];
  nextCursor: string | null;
}

export const whatsappChatApi = {
  list(input: { outletId: string; startDate?: number; limit?: number; cursor?: string }, signal?: AbortSignal) {
    const searchParams = new URLSearchParams({ outletId: input.outletId });
    if (input.startDate !== undefined) searchParams.set("startDate", String(input.startDate));
    if (input.limit !== undefined) searchParams.set("limit", String(input.limit));
    if (input.cursor) searchParams.set("cursor", input.cursor);
    return apiRequest<WhatsAppConversationPage>(`/api/v1/whatsapp/chats?${searchParams}`, { signal, authMode: "postgres" });
  },

  markRead(outletId: string, conversationId: string) {
    return apiRequest<WhatsAppMessageLog>(`/api/v1/whatsapp/chats/${encodeURIComponent(conversationId)}/read`, {
      method: "PATCH",
      body: { outletId },
      authMode: "postgres",
    });
  },

  sendMessage(input: { outletId: string; conversationId: string; text: string; contentType?: "text" | "document" }) {
    return apiRequest<WhatsAppMessageLog>(`/api/v1/whatsapp/chats/${encodeURIComponent(input.conversationId)}/messages`, {
      method: "POST",
      body: {
        outletId: input.outletId,
        text: input.text,
        contentType: input.contentType ?? "text",
      },
      authMode: "postgres",
    });
  },
};
