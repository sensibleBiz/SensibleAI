import { useState } from "react";
import {
  sendCrmAssistantMessage,
  type CrmAssistantMessage,
} from "../api/crmAssistantApi";

export interface UseAssistantChatReturn {
  messages: CrmAssistantMessage[];
  loading: boolean;
  error: string;
  draft: string;
  setDraft: (value: string) => void;
  setError: (value: string) => void;
  clearMessages: () => void;
  submitMessage: (value?: string) => Promise<void>;
}

export function useAssistantChat(outletId: string): UseAssistantChatReturn {
  const [messages, setMessages] = useState<CrmAssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");

  const submitMessage = async (value = draft) => {
    const message = value.trim();
    if (!message || loading) return;

    const history = messages
      .slice(-8)
      .map((entry) => ({ ...entry, content: entry.content.slice(0, 2_000) }));

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setDraft("");
    setError("");
    setLoading(true);

    try {
      const result = await sendCrmAssistantMessage(outletId, message, history);
      setMessages((prev) => [...prev, { role: "assistant", content: result.answer }]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The assistant could not complete your request.",
      );
    } finally {
      setLoading(false);
    }
  };

  return {
    messages,
    loading,
    error,
    draft,
    setDraft,
    setError,
    clearMessages: () => setMessages([]),
    submitMessage,
  };
}
