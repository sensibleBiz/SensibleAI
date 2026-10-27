import React from "react";
import { MailOutlined } from "@ant-design/icons";
import UnifiedAutomationPage from "./UnifiedAutomationPage";

const EmailAutomationPage: React.FC = () => (
  <UnifiedAutomationPage
    channel="email"
    title="Email automation"
    description="Set up email templates for CRM events and preview personalized messages before they go live."
    icon={<MailOutlined />}
  />
);

export default EmailAutomationPage;