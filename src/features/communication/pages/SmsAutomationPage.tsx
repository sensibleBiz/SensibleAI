import React from "react";
import { PhoneOutlined } from "@ant-design/icons";
import UnifiedAutomationPage from "./UnifiedAutomationPage";

const SmsAutomationPage: React.FC = () => (
  <UnifiedAutomationPage
    channel="sms"
    title="SMS automation"
    description="Set up SMS templates for CRM events and preview messages before they go live."
    icon={<PhoneOutlined />}
  />
);

export default SmsAutomationPage;