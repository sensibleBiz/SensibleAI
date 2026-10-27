import {
  Bot,
  Sparkles,
  Zap,
  Flame,
  CheckCircle2,
  ExternalLink,
  Activity,
  Cpu,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { DashboardConfig } from "../types/dashboardConfig";

interface AiAutopilotDashboardProps {
  config: DashboardConfig;
  onOpenDeepDive: (metric: string) => void;
}

interface AgentTelemetry {
  id: string;
  name: string;
  role: string;
  status: "active" | "optimizing" | "standby";
  tasksCompletedToday: number;
  accuracyRate: number;
  creditsConsumedToday: number;
  lastActive: string;
  iconBg: string;
}

const AI_AGENTS: AgentTelemetry[] = [
  {
    id: "ag-research",
    name: "B2B Lead Discovery Agent",
    role: "Google Maps & LinkedIn Lead Scraping & Verification",
    status: "active",
    tasksCompletedToday: 1240,
    accuracyRate: 98.4,
    creditsConsumedToday: 620,
    lastActive: "Just now",
    iconBg: "blue",
  },
  {
    id: "ag-outreach",
    name: "WhatsApp Hyper-Personalizer",
    role: "Generates tailored pitch decks & WhatsApp sequences",
    status: "active",
    tasksCompletedToday: 486,
    accuracyRate: 96.8,
    creditsConsumedToday: 972,
    lastActive: "1 min ago",
    iconBg: "green",
  },
  {
    id: "ag-sentiment",
    name: "Telephony Sentiment & Call Scorer",
    role: "Transcribes calls & extracts objections + intent scores",
    status: "active",
    tasksCompletedToday: 173,
    accuracyRate: 99.1,
    creditsConsumedToday: 519,
    lastActive: "3 mins ago",
    iconBg: "purple",
  },
  {
    id: "ag-followup",
    name: "Autonomous Deal Reviver",
    role: "Detects idle quotes & dispatches re-engagement nudges",
    status: "optimizing",
    tasksCompletedToday: 64,
    accuracyRate: 94.2,
    creditsConsumedToday: 192,
    lastActive: "8 mins ago",
    iconBg: "amber",
  },
];

const INTENT_SURGES = [
  {
    id: "int-1",
    account: "Tata Electronics Logistics Hub",
    score: 98,
    signal: "Checked pricing & quotation link 4 times in 2 hours",
    contact: "Sanjay Singhania (VP Procurement)",
    action: "Autonomous rep notification sent + auto WhatsApp dispatched",
  },
  {
    id: "int-2",
    account: "MedLife Pharmaceuticals Corp",
    score: 95,
    signal: "Forwarded proposal PDF to 3 additional board members",
    contact: "Pooja Malhotra (Head of IT)",
    action: "Meeting invite auto-suggested via AI executive assistant",
  },
  {
    id: "int-3",
    account: "Global Cargo & Express Lines",
    score: 91,
    signal: "Triggered repeated enquiry from official company website",
    contact: "Deepak Sharma (Director Operations)",
    action: "Lead escalated to Vikram Rathore with high-priority priority tag",
  },
];

export default function AiAutopilotDashboard({
  config,
  onOpenDeepDive,
}: AiAutopilotDashboardProps) {
  const navigate = useNavigate();

  return (
    <div className={`ai-autopilot-dashboard-root density-${config.density}`}>
      {/* ── Top AI Telemetry Strip ── */}
      <section className="ai-telemetry-strip">
        <div className="ai-kpi-card" onClick={() => onOpenDeepDive("ai_tasks")}>
          <div className="ai-kpi-icon blue"><Cpu size={16} /></div>
          <div className="ai-kpi-data">
            <span className="ai-kpi-label">Autonomous Tasks Today</span>
            <div className="ai-kpi-num">1,963 <span className="delta-pill pos">+48%</span></div>
            <span className="ai-kpi-sub">Across 4 active agents</span>
          </div>
        </div>

        <div className="ai-kpi-card" onClick={() => onOpenDeepDive("ai_intent")}>
          <div className="ai-kpi-icon amber"><Flame size={16} /></div>
          <div className="ai-kpi-data">
            <span className="ai-kpi-label">High-Intent Surges</span>
            <div className="ai-kpi-num">56 Deals <span className="delta-pill pos">+35%</span></div>
            <span className="ai-kpi-sub">Predictive win probability &gt; 80%</span>
          </div>
        </div>

        <div className="ai-kpi-card" onClick={() => onOpenDeepDive("ai_credit_roi")}>
          <div className="ai-kpi-icon green"><Zap size={16} /></div>
          <div className="ai-kpi-data">
            <span className="ai-kpi-label">AI Credit ROI Multiplier</span>
            <div className="ai-kpi-num">2,065x <span className="delta-pill pos">+18%</span></div>
            <span className="ai-kpi-sub">2,303 Cr consumed → ₹ 3.8 Cr won</span>
          </div>
        </div>

        <div className="ai-kpi-card" onClick={() => onOpenDeepDive("ai_sentiment")}>
          <div className="ai-kpi-icon purple"><Activity size={16} /></div>
          <div className="ai-kpi-data">
            <span className="ai-kpi-label">Positive Sentiment Rate</span>
            <div className="ai-kpi-num">84.2% <span className="delta-pill pos">+5.1%</span></div>
            <span className="ai-kpi-sub">Analyzed across 173 call transcripts</span>
          </div>
        </div>
      </section>

      {/* ── Main Two-Column AI Grid ── */}
      <div className="ai-main-columns">
        {/* Left Column: Autonomous Agents Control Center */}
        <div className="ai-left-column">
          <div className="terminal-card ai-control-card">
            <div className="card-top-bar">
              <div className="card-title-group">
                <span className="card-icon blue"><Bot size={16} /></span>
                <h3 className="column-card-title">Autonomous AI Agents Fleet</h3>
              </div>
              <button
                type="button"
                className="see-all-link"
                onClick={() => navigate(ROUTES_PATHS.AI_SCRAP)}
              >
                Launch Lead Generator →
              </button>
            </div>

            <div className="ai-agents-list">
              {AI_AGENTS.map((agent) => (
                <div key={agent.id} className="ai-agent-item">
                  <div className="agent-item-top">
                    <div className="agent-meta">
                      <div className={`agent-avatar-icon ${agent.iconBg}`}>
                        <Bot size={15} />
                      </div>
                      <div>
                        <div className="agent-title-row">
                          <strong className="agent-item-name">{agent.name}</strong>
                          <span className={`agent-status-tag ${agent.status}`}>
                            <span className="live-dot" />
                            {agent.status}
                          </span>
                        </div>
                        <p className="agent-item-role">{agent.role}</p>
                      </div>
                    </div>

                    <div className="agent-credits-pill">
                      ⚡ {agent.creditsConsumedToday} credits
                    </div>
                  </div>

                  <div className="agent-metrics-grid">
                    <div className="agent-m-box">
                      <span className="m-label">Tasks Executed</span>
                      <strong className="m-val">{agent.tasksCompletedToday}</strong>
                    </div>
                    <div className="agent-m-box">
                      <span className="m-label">Accuracy Score</span>
                      <strong className="m-val text-green-500">{agent.accuracyRate}%</strong>
                    </div>
                    <div className="agent-m-box">
                      <span className="m-label">Last Operation</span>
                      <strong className="m-val">{agent.lastActive}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Intent Surge Radar & Live Log */}
        <div className="ai-right-column">
          {/* Intent Surges Card */}
          <div className="terminal-card intent-radar-card">
            <div className="card-top-bar">
              <div className="card-title-group">
                <span className="card-icon amber"><Flame size={16} /></span>
                <h3 className="column-card-title">Buyer Intent Surge Radar</h3>
              </div>
              <span className="live-radar-badge">⚡ Real-Time</span>
            </div>

            <div className="intent-surges-list">
              {INTENT_SURGES.map((surge) => (
                <div key={surge.id} className="intent-surge-box">
                  <div className="intent-surge-header">
                    <div>
                      <strong className="intent-account">{surge.account}</strong>
                      <span className="intent-contact">{surge.contact}</span>
                    </div>
                    <div className="intent-score-col">
                      <span className="score-val">🔥 {surge.score}/100</span>
                    </div>
                  </div>

                  <div className="intent-signal-row">
                    <Sparkles size={12} className="inline mr-1 text-blue-500" />
                    <strong>Signal:</strong> {surge.signal}
                  </div>

                  <div className="intent-action-row">
                    <CheckCircle2 size={12} className="inline mr-1 text-green-500" />
                    <span>{surge.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick AI Links */}
          <div className="terminal-card ai-shortcuts-card">
            <h4 className="column-card-title">AI Quick Workflows</h4>
            <div className="ai-links-grid">
              <button
                type="button"
                className="ai-quick-link"
                onClick={() => navigate(ROUTES_PATHS.AI_SCRAP)}
              >
                <span>Automated Contact Scraper & Generator</span>
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="ai-quick-link"
                onClick={() => navigate(ROUTES_PATHS.WHATSAPP_AUTOMATION)}
              >
                <span>WhatsApp AI Automation Rules</span>
                <ExternalLink size={14} />
              </button>
              <button
                type="button"
                className="ai-quick-link"
                onClick={() => navigate(ROUTES_PATHS.BILLING_WALLET)}
              >
                <span>View AI Credits Balance & Consumption</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
