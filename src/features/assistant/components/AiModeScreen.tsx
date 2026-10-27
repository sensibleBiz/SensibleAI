import React, { useEffect, useRef } from "react";
import {
  SendOutlined,
  ClearOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";
import { Alert, Button, Spin, Typography } from "antd";
import { useLocation } from "react-router-dom";
import type { CrmAssistantMessage } from "../api/crmAssistantApi";
import { type ToolPageConfig, getToolConfig } from "../config/toolPages";
import { useAssistantChat } from "../hooks/useAssistantChat";

const { Text } = Typography;

interface AiModeScreenProps {
  outletId: string;
}

// ─── Orb visual (used only on dashboard home) ────────────────────────────────

function OrbVisual() {
  return (
    <div className="ai-orb-container" aria-hidden="true">
      <div className="ai-orb">
        <div className="ai-orb-inner" />
        <div className="ai-orb-ring ai-orb-ring--1" />
        <div className="ai-orb-ring ai-orb-ring--2" />
        <div className="ai-orb-dots" />
        <div className="ai-orb-diamond" />
      </div>
    </div>
  );
}

// ─── Reevi-style tool hero page ───────────────────────────────────────────────

function ToolHeroPage({
  config,
  loading,
  onAsk,
}: {
  config: ToolPageConfig;
  loading: boolean;
  onAsk: (q: string) => void;
}) {
  const isHome = config.category === "DASHBOARD";

  return (
    <div className="ai-tool-page">
      <div className="ai-tool-hero">
        <div className="ai-tool-hero-left">
          <span className="ai-tool-category">{config.category}</span>

          {isHome && <OrbVisual />}

          <h1 className="ai-tool-headline">{config.headline}</h1>
          <p className="ai-tool-subtitle">{config.subtitle}</p>

          <ul className="ai-tool-checks">
            {config.checkmarks.map((c) => (
              <li key={c}>
                <CheckCircleFilled className="ai-tool-check-icon" />
                {c}
              </li>
            ))}
          </ul>

          {config.quickTry && (
            <div className="ai-tool-quick-try">
              <span className="ai-tool-quick-label">Not sure what to ask? Try:</span>
              <div className="ai-tool-quick-chips">
                {config.quickTry.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="ai-tool-quick-chip"
                    onClick={() => onAsk(q)}
                    disabled={loading}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ai-tool-preview-card">
          <div className="ai-tool-preview-header">
            <div className="ai-tool-preview-title">
              <strong>{config.previewCard.title}</strong>
              <small>{config.previewCard.subtitle}</small>
            </div>
            <span
              className="ai-tool-preview-badge"
              style={{ background: `${config.previewCard.badgeColor}18`, color: config.previewCard.badgeColor }}
            >
              ● {config.previewCard.badge}
            </span>
          </div>
          <div className="ai-tool-preview-divider" />
          {config.previewCard.rows.map((row) => (
            <div
              key={row.label}
              className={`ai-tool-preview-row${row.highlight ? " ai-tool-preview-row--highlight" : ""}`}
            >
              <span>{row.label}</span>
              <button
                type="button"
                className="ai-tool-preview-ask"
                onClick={() => onAsk(`What is my ${row.label.toLowerCase()}?`)}
                disabled={loading}
              >
                {row.value}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="ai-tool-features">
        {config.features.map((f) => (
          <button
            key={f.title}
            type="button"
            className="ai-tool-feature-card"
            onClick={() => onAsk(f.question)}
            disabled={loading}
          >
            <span className="ai-tool-feature-icon">{f.icon}</span>
            <strong className="ai-tool-feature-title">{f.title}</strong>
            <span className="ai-tool-feature-desc">{f.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Minimal markdown renderer (bold + bullet lists) ─────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part as React.ReactNode,
  );
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: number) => {
    if (!bullets.length) return;
    nodes.push(
      <ul key={`ul-${key}`} className="ai-md-list">
        {bullets.map((b, i) => <li key={i}>{renderInline(b)}</li>)}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((line, idx) => {
    const t = line.trim();
    if (t.startsWith("• ") || t.startsWith("- ")) {
      bullets.push(t.slice(2));
    } else {
      flushBullets(idx);
      if (t) {
        nodes.push(<p key={idx} className="ai-md-para">{renderInline(t)}</p>);
      }
    }
  });
  flushBullets(lines.length);

  return <>{nodes}</>;
}

// ─── Chat thread ──────────────────────────────────────────────────────────────

function ChatThread({ messages, loading }: { messages: CrmAssistantMessage[]; loading: boolean }) {
  return (
    <div className="ai-thread">
      {messages.map((entry, index) => (
        <div key={`${entry.role}-${index}`} className={`ai-bubble ai-bubble--${entry.role}`}>
          <Text type="secondary" className="ai-bubble-label">
            {entry.role === "user" ? "You" : "CRM Assistant"}
          </Text>
          <div className="ai-bubble-content">
            {entry.role === "assistant" ? renderMarkdown(entry.content) : entry.content}
          </div>
        </div>
      ))}
      {loading && (
        <div className="ai-bubble ai-bubble--assistant">
          <Text type="secondary" className="ai-bubble-label">CRM Assistant</Text>
          <div className="ai-bubble-content ai-bubble-content--typing">
            <Spin size="small" />
            <span>Checking your CRM…</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function AiModeScreen({ outletId }: AiModeScreenProps) {
  const location = useLocation();
  const toolConfig = getToolConfig(location.pathname);

  const { messages, loading, error, draft, setDraft, setError, clearMessages, submitMessage } =
    useAssistantChat(outletId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Reset chat when route changes
  useEffect(() => {
    clearMessages();
    setDraft("");
    setError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [location.pathname]);

  const hasMessages = messages.length > 0;

  return (
    <div className="ai-mode-root">
      <div ref={scrollRef} className="ai-mode-scroll" aria-live="polite">
        {hasMessages ? (
          <ChatThread messages={messages} loading={loading} />
        ) : (
          <ToolHeroPage config={toolConfig} loading={loading} onAsk={(q) => void submitMessage(q)} />
        )}
      </div>

      <div className="ai-mode-input-dock">
        <div className="ai-mode-input-wrap">
          {error && (
            <Alert type="error" showIcon message={error} closable onClose={() => setError("")} style={{ marginBottom: 10 }} />
          )}
          <div className="ai-input-bar">
            <textarea
              ref={inputRef}
              aria-label={toolConfig.inputPlaceholder}
              rows={1}
              value={draft}
              maxLength={4_000}
              placeholder={toolConfig.inputPlaceholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submitMessage();
                }
              }}
              disabled={loading}
              className="ai-input-native"
            />
            <button
              type="button"
              className="ai-input-send"
              aria-label="Send message"
              onClick={() => void submitMessage()}
              disabled={!draft.trim() || loading}
            >
              <SendOutlined />
            </button>
          </div>
          <div className="ai-input-foot">
            <Text type="secondary" style={{ fontSize: 11, margin: 0 }}>
              Answers from read-only CRM data · Press Enter to send, Shift+Enter for new line
            </Text>
            {hasMessages && (
              <Button type="text" size="small" icon={<ClearOutlined />} onClick={clearMessages} disabled={loading} style={{ fontSize: 11, color: "#8c8c8c" }}>
                New chat
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
