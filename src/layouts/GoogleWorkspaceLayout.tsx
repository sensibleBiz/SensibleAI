import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  MapPin,
  CreditCard,
  Settings,
  Sparkles,
  Mic,
  MicOff,
  Search,
  Bell,
  ChevronLeft,
  ChevronRight,
  Send,
  X,
  Volume2,
  Globe,
  Briefcase,
  LayoutGrid,
} from "lucide-react";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import { PortalSwitcher } from "@/shared/components/PortalSwitcher";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: ROUTES_PATHS.DASHBOARD },
  { id: "leads", label: "Leads & Pipeline", icon: Users, path: ROUTES_PATHS.LEADS_MANAGEMENT, badge: 8 },
  { id: "whatsapp", label: "WhatsApp Chat", icon: MessageSquare, path: ROUTES_PATHS.WHATSAPP, badge: 3 },
  { id: "tracking", label: "Field Maps & Visits", icon: MapPin, path: ROUTES_PATHS.USER_TRACKING_PAGE },
  { id: "sales_orders", label: "Sales Orders", icon: Briefcase, path: ROUTES_PATHS.SALES_ORDERS },
  { id: "exports", label: "EXIM Exports", icon: Globe, path: ROUTES_PATHS.EXPORT_OPERATIONS },
  { id: "billing", label: "PhonePe Wallet", icon: CreditCard, path: ROUTES_PATHS.BILLING_WALLET },
  { id: "outlets", label: "Outlets & Settings", icon: Settings, path: ROUTES_PATHS.OUTLETS },
];

export const GoogleWorkspaceLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useSelector((state: RootState) => state.auth.user);

  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [isLiveVoiceActive, setIsLiveVoiceActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copilotInput, setCopilotInput] = useState("");

  const [copilotMessages, setCopilotMessages] = useState<Array<{ role: "user" | "gemini"; text: string }>>([
    {
      role: "gemini",
      text: "Hello! I am Sensible AI, powered by Google Gemini 3.8. How can I assist your sales, accounting, or exports today?",
    },
  ]);

  const handleSendMessage = () => {
    if (!copilotInput.trim()) return;
    const text = copilotInput.trim();
    setCopilotMessages((prev) => [...prev, { role: "user", text }]);
    setCopilotInput("");

    setTimeout(() => {
      setCopilotMessages((prev) => [
        ...prev,
        {
          role: "gemini",
          text: `Analyzing records for: "${text}". Found active customer and pipeline context across Sensible Core.`,
        },
      ]);
    }, 500);
  };

  const switchToClassic = () => {
    localStorage.setItem("crm_ui_theme", "classic");
    window.location.reload();
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8F9FA] text-[#1F1F1F] font-sans">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. LEFT NAVIGATION RAIL (Material Design 3)                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <aside
        className={`relative z-20 flex flex-col border-r border-[#E0E2EC] bg-white transition-all duration-300 ease-in-out ${
          isRailExpanded ? "w-60" : "w-[72px]"
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center px-4 justify-between border-b border-[#F0F2F5]">
          <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={() => navigate(ROUTES_PATHS.DASHBOARD)}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#1A73E8] via-[#8AB4F8] to-[#4285F4] text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            {isRailExpanded && (
              <span className="truncate font-semibold tracking-tight text-base text-[#1A73E8]">
                Sensible.biz
              </span>
            )}
          </div>
          <button
            onClick={() => setIsRailExpanded(!isRailExpanded)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-full hover:bg-[#F1F3F4] text-[#5F6368]"
            title={isRailExpanded ? "Collapse rail" : "Expand rail"}
          >
            {isRailExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`group relative flex w-full items-center rounded-full px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-[#E8F0FE] text-[#1A73E8]"
                    : "text-[#444746] hover:bg-[#F1F3F4] hover:text-[#1F1F1F]"
                }`}
                title={!isRailExpanded ? item.label : undefined}
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <Icon className={`h-5 w-5 ${isActive ? "text-[#1A73E8]" : "text-[#5F6368]"}`} />
                </div>

                {isRailExpanded && (
                  <span className="ml-3 truncate text-sm font-medium">{item.label}</span>
                )}

                {item.badge && item.badge > 0 && (
                  <span
                    className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                      isActive
                        ? "bg-[#1A73E8] text-white"
                        : "bg-[#E0E2EC] text-[#444746]"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Status Indicator */}
        <div className="p-3 border-t border-[#F0F2F5] flex flex-col gap-2">
          <button
            onClick={switchToClassic}
            className="flex items-center gap-2 text-xs text-[#5F6368] hover:text-[#1A73E8] transition-colors"
            title="Switch to Classic AntD Layout"
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            {isRailExpanded && <span>Classic View</span>}
          </button>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#1E8E3E]" title="Cloud Run: Connected" />
            {isRailExpanded && (
              <span className="text-[11px] text-[#5F6368] font-mono">Cloud Run (Live)</span>
            )}
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. MAIN APP CANVAS                                                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header Bar ("The Google Way") */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E0E2EC] bg-white px-6 shadow-xs gap-4">
          {/* Multi-Domain Portal Switcher (Sales | Accounts | Exports) */}
          <div className="flex items-center shrink-0">
            <PortalSwitcher />
          </div>

          {/* Universal Pill Search Bar (Cmd+K) */}
          <div className="flex flex-1 max-w-xl">
            <div className="relative flex w-full items-center">
              <Search className="absolute left-4 h-4 w-4 text-[#5F6368]" />
              <input
                type="text"
                placeholder="Ask Gemini, search leads, contacts, or invoices... (Cmd+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-[#E0E2EC] bg-[#F8F9FA] py-2 pl-11 pr-20 text-sm text-[#1F1F1F] placeholder-[#747775] transition-all focus:border-[#1A73E8] focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#D3E3FD]"
              />
              <div className="absolute right-3 flex items-center gap-1.5 text-xs font-medium text-[#747775]">
                <kbd className="rounded border border-[#DADCE0] bg-white px-1.5 py-0.5 shadow-2xs">⌘K</kbd>
              </div>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Gemini 3.8 Live Voice Action Button */}
            <button
              onClick={() => setIsLiveVoiceActive(!isLiveVoiceActive)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all shadow-sm ${
                isLiveVoiceActive
                  ? "bg-gradient-to-r from-[#D93025] to-[#EA4335] text-white animate-pulse"
                  : "bg-gradient-to-r from-[#1A73E8] via-[#8AB4F8] to-[#1E8E3E] text-white hover:opacity-95"
              }`}
            >
              {isLiveVoiceActive ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span>{isLiveVoiceActive ? "Live Voice On" : "Gemini 3.8 Live"}</span>
            </button>

            {/* Gemini Copilot Toggle */}
            <button
              onClick={() => setIsCopilotOpen(!isCopilotOpen)}
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-[#E0E2EC] transition-all ${
                isCopilotOpen
                  ? "bg-[#E8F0FE] text-[#1A73E8] border-[#1A73E8]"
                  : "hover:bg-[#F1F3F4] text-[#5F6368]"
              }`}
              title="Toggle Gemini Copilot"
            >
              <Sparkles className="h-4 w-4" />
            </button>

            {/* Notifications */}
            <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#F1F3F4] text-[#5F6368]">
              <Bell className="h-4 w-4" />
            </button>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 pl-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1A73E8] text-white font-semibold text-xs">
                {currentUser?.name?.[0]?.toUpperCase() ?? "S"}
              </div>
            </div>
          </div>
        </header>

        {/* Live Audio Streaming Status Banner (When Active) */}
        {isLiveVoiceActive && (
          <div className="flex items-center justify-between bg-gradient-to-r from-[#E8F0FE] via-[#FCE8E6] to-[#E6F4EA] px-6 py-2 border-b border-[#D3E3FD]">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-[#EA4335] animate-ping" />
                <span className="h-2 w-2 rounded-full bg-[#EA4335]" />
              </div>
              <span className="text-xs font-semibold text-[#1F1F1F]">
                Gemini 3.8 Live Voice Active
              </span>
              <span className="text-xs text-[#5F6368]">
                PCM 16kHz Streaming | Exotel Bridge Ready
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-[#1A73E8] animate-bounce" />
              <button
                onClick={() => setIsLiveVoiceActive(false)}
                className="text-xs font-medium text-[#D93025] hover:underline"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}

        {/* Content Outlet */}
        <main className="flex-1 overflow-y-auto p-5 bg-[#F8F9FA]">
          <Outlet />
        </main>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. GEMINI COPILOT DRAWER (Google Workspace Side-Panel)              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isCopilotOpen && (
        <aside className="relative z-30 flex w-84 flex-col border-l border-[#E0E2EC] bg-white shadow-xl">
          {/* Header */}
          <div className="flex h-16 items-center justify-between border-b border-[#F0F2F5] px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E8F0FE] text-[#1A73E8]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#1F1F1F]">Gemini Copilot</h3>
                <p className="text-[11px] text-[#5F6368]">Google ADK Multi-Agent</p>
              </div>
            </div>
            <button
              onClick={() => setIsCopilotOpen(false)}
              className="rounded-full p-1.5 hover:bg-[#F1F3F4] text-[#5F6368]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Prompt Chips */}
          <div className="flex gap-2 overflow-x-auto p-2.5 border-b border-[#F0F2F5] bg-[#F8F9FA]">
            {["High-Intent Leads", "Overdue PhonePe Links", "Mumbai Route Plan"].map((chip) => (
              <button
                key={chip}
                onClick={() => setCopilotInput(chip)}
                className="shrink-0 rounded-full border border-[#DADCE0] bg-white px-2.5 py-1 text-xs text-[#444746] hover:bg-[#F1F3F4]"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
            {copilotMessages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#1A73E8] text-white"
                      : "bg-[#F1F3F4] text-[#1F1F1F]"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          {/* Input Box */}
          <div className="p-3 border-t border-[#F0F2F5] bg-white">
            <div className="flex items-center gap-2 rounded-2xl border border-[#E0E2EC] bg-[#F8F9FA] px-3 py-1.5 focus-within:border-[#1A73E8] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#D3E3FD]">
              <input
                type="text"
                placeholder="Ask Gemini..."
                value={copilotInput}
                onChange={(e) => setCopilotInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                className="flex-1 bg-transparent text-xs text-[#1F1F1F] placeholder-[#747775] focus:outline-hidden"
              />
              <button
                onClick={handleSendMessage}
                disabled={!copilotInput.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1A73E8] text-white disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};

export default GoogleWorkspaceLayout;
