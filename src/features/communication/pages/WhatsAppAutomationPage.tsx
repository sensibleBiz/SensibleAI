import React from "react";
import { WhatsAppOutlined } from "@ant-design/icons";
import UnifiedAutomationPage from "./UnifiedAutomationPage";

export const WhatsAppAutomationPage: React.FC = () => (
  <UnifiedAutomationPage
    channel="whatsapp"
    title="WhatsApp automation"
    description="Set up approved WhatsApp templates for CRM events and test messages before they go live."
    icon={<WhatsAppOutlined />}
  />
);

export default WhatsAppAutomationPage;