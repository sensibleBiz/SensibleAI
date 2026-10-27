import type { ReactNode } from "react";
import { message } from "antd";
import { MessageContext } from "@/shared/lib/MessageContext";

export function MessageProvider({ children }: { children: ReactNode }) {
  const [messageApi, contextHolder] = message.useMessage();

  return (
    <MessageContext.Provider value={messageApi}>
      {contextHolder}
      {children}
    </MessageContext.Provider>
  );
}
  
