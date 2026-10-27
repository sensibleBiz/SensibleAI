import { RobotOutlined, SendOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  FloatButton,
  Input,
  Space,
  Spin,
  Typography,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { useAssistantChat } from "../hooks/useAssistantChat";

const { Text, Paragraph, Title } = Typography;

interface CrmAssistantProps {
  outletId: string;
}

const suggestedQuestions = [
  "How many leads are in each stage?",
  "Find leads for a business or person",
];

export function CrmAssistant({ outletId }: CrmAssistantProps) {
  const [open, setOpen] = useState(false);
  const { messages, loading, error, draft, setDraft, setError, submitMessage } =
    useAssistantChat(outletId);
  const scrollContainer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainer.current) {
      scrollContainer.current.scrollTop = scrollContainer.current.scrollHeight;
    }
  }, [messages, loading]);

  return (
    <>
      <FloatButton
        icon={<RobotOutlined />}
        tooltip="CRM assistant"
        aria-label="Open CRM assistant"
        onClick={() => setOpen(true)}
      />
      <Drawer
        title={
          <Space>
            <RobotOutlined />
            <span>CRM assistant</span>
          </Space>
        }
        placement="right"
        width={420}
        open={open}
        onClose={() => setOpen(false)}
        styles={{ body: { padding: 16, display: "flex", flexDirection: "column" } }}
      >
        <div
          ref={scrollContainer}
          aria-live="polite"
          style={{ flex: 1, overflowY: "auto", paddingBottom: 12 }}
        >
          {messages.length === 0 ? (
            <div style={{ padding: "36px 8px 20px" }}>
              <Empty
                image={<RobotOutlined style={{ color: "#1677ff", fontSize: 36 }} />}
                styles={{ image: { height: 48 } }}
                description={
                  <>
                    <Title level={5}>Ask about your CRM</Title>
                    <Paragraph type="secondary">
                      Get read-only answers about leads and pipeline stages for this outlet.
                    </Paragraph>
                  </>
                }
              />
              <Space direction="vertical" style={{ width: "100%" }}>
                {suggestedQuestions.map((question) => (
                  <Button
                    key={question}
                    block
                    onClick={() => void submitMessage(question)}
                    disabled={loading}
                  >
                    {question}
                  </Button>
                ))}
              </Space>
            </div>
          ) : (
            <Space direction="vertical" size="middle" style={{ width: "100%" }}>
              {messages.map((entry, index) => (
                <div
                  key={`${entry.role}-${index}`}
                  style={{
                    alignSelf: entry.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "92%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: entry.role === "user" ? "#e6f4ff" : "#f5f5f5",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <Text type="secondary" style={{ display: "block", marginBottom: 4 }}>
                    {entry.role === "user" ? "You" : "CRM assistant"}
                  </Text>
                  <span>{entry.content}</span>
                </div>
              ))}
            </Space>
          )}
          {loading && (
            <div style={{ padding: 16, textAlign: "center" }}>
              <Spin size="small" /> <Text type="secondary">Checking your CRM…</Text>
            </div>
          )}
        </div>

        {error && (
          <Alert
            type="error"
            showIcon
            message={error}
            closable
            onClose={() => setError("")}
            style={{ marginBottom: 12 }}
          />
        )}
        <Space.Compact style={{ width: "100%" }}>
          <Input.TextArea
            aria-label="Ask the CRM assistant"
            autoSize={{ minRows: 1, maxRows: 4 }}
            value={draft}
            maxLength={4_000}
            placeholder="Ask a question about your CRM"
            onChange={(event) => setDraft(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void submitMessage();
              }
            }}
            disabled={loading}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            aria-label="Send message"
            onClick={() => void submitMessage()}
            disabled={!draft.trim() || loading}
          />
        </Space.Compact>
        <Text type="secondary" style={{ fontSize: 11, marginTop: 8 }}>
          Answers are generated from read-only CRM data and may need verification.
        </Text>
      </Drawer>
    </>
  );
}
