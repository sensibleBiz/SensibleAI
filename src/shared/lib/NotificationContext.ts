import { createContext } from "react";
import { notification } from "antd";

export type NotificationApi = ReturnType<typeof notification.useNotification>[0];

export const NotificationContext = createContext<NotificationApi | null>(null);
