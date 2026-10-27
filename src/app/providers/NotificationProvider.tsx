import type { ReactNode } from "react";
import { notification } from "antd";
import { NotificationContext } from "@/shared/lib/NotificationContext";

export function NotificationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [api, contextHolder] = notification.useNotification();

  return (
    <NotificationContext.Provider value={api}>
      {contextHolder}
      {children}
    </NotificationContext.Provider>
  );
}
