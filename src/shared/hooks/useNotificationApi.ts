import { useContext } from "react";
import { NotificationContext } from "@/shared/lib/NotificationContext";

export function useNotificationApi() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotificationApi must be used within NotificationProvider");
  }
  return ctx;
}
