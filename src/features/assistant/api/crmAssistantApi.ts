import { apiRequest } from "@/shared/api/apiClient";

export interface CrmAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export const sendCrmAssistantMessage = (
  outletId: string,
  message: string,
  history: CrmAssistantMessage[],
  signal?: AbortSignal,
) =>
  apiRequest<{ answer: string }>("/api/v1/assistant/chat", {
    method: "POST",
    body: { outletId, message, history },
    signal,
  });
