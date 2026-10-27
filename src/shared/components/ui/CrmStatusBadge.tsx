import React, { ReactNode } from "react";

export type CrmStatusTone =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "neutral"
  | "primary";

export interface CrmStatusBadgeProps {
  children?: ReactNode;
  status?: string;
  tone?: CrmStatusTone;
  color?: string; // custom hex color override
  dot?: boolean;
  dotPulse?: boolean;
  size?: "small" | "default" | "large";
  className?: string;
  style?: React.CSSProperties;
}

const TONE_MAP: Record<string, CrmStatusTone> = {
  // Success / Won
  won: "success",
  closed: "success",
  active: "success",
  completed: "success",
  approved: "success",
  done: "success",
  delivered: "success",
  paid: "success",

  // Danger / Lost
  lost: "danger",
  disqualified: "danger",
  rejected: "danger",
  cancelled: "danger",
  failed: "danger",
  expired: "danger",

  // Warning / In-progress
  pending: "warning",
  followup: "warning",
  "follow up": "warning",
  "in progress": "warning",
  "in review": "warning",
  urgent: "warning",
  draft: "warning",

  // Info / New
  new: "info",
  assigned: "info",
  open: "info",
  ringing: "info",
  contacted: "info",
  qualified: "info",
  proposal: "info",
};

export const CrmStatusBadge: React.FC<CrmStatusBadgeProps> = ({
  children,
  status,
  tone,
  color,
  dot = false,
  dotPulse = false,
  size = "default",
  className = "",
  style,
}) => {
  const displayText = children || status || "";
  const normalizedKey = String(status || children || "").toLowerCase().trim();
  const activeTone = tone || TONE_MAP[normalizedKey] || "neutral";

  // Size styles
  const sizeClasses = {
    small: "px-2 py-0.5 text-[11px]",
    default: "px-2.5 py-1 text-xs",
    large: "px-3 py-1.5 text-sm",
  }[size];

  // Default semantic styling
  const toneClasses: Record<CrmStatusTone, { bg: string; dot: string }> = {
    success: {
      bg: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
      dot: "bg-emerald-500",
    },
    danger: {
      bg: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      dot: "bg-rose-500",
    },
    warning: {
      bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      dot: "bg-amber-500",
    },
    info: {
      bg: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      dot: "bg-blue-500",
    },
    primary: {
      bg: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
      dot: "bg-indigo-500",
    },
    neutral: {
      bg: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
      dot: "bg-slate-400",
    },
  };

  const currentTone = toneClasses[activeTone];

  if (color) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md font-medium border ${sizeClasses} ${className}`}
        style={{
          backgroundColor: `${color}18`,
          color: color,
          borderColor: `${color}40`,
          ...style,
        }}
      >
        {dot && (
          <span
            className={`h-1.5 w-1.5 rounded-full ${dotPulse ? "animate-pulse" : ""}`}
            style={{ backgroundColor: color }}
          />
        )}
        <span>{displayText}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-medium border ${currentTone.bg} ${sizeClasses} ${className}`}
      style={style}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full ${currentTone.dot} ${dotPulse ? "animate-pulse" : ""}`}
        />
      )}
      <span>{displayText}</span>
    </span>
  );
};

export default CrmStatusBadge;
