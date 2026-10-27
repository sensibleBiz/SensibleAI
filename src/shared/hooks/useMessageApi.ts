import { useContext } from "react";
import { MessageContext } from "@/shared/lib/MessageContext";

export function useMessageApi() {
  const ctx = useContext(MessageContext);
  if (!ctx) {
    throw new Error("useMessageApi must be used within a MessageProvider");
  }
  return ctx;
}
