import { createContext } from "react";
import { message } from "antd";

export type MessageApi = ReturnType<typeof message.useMessage>[0];

export const MessageContext = createContext<MessageApi | null>(null);
