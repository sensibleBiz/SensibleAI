export interface PendingTargetSingle {
  type: "single";
  resolvedName: string;
  resolvedId: string | null;
  zone: string;
  forecastNetSales: number;
  month: number;
  year: number;
  tenantId: string;
  outletId: string;
  requestingUserId: string;
  expiresAt: number;
}

export interface PendingTargetBulk {
  type: "bulk";
  employees: Array<{ userId: string; name: string; zone: string }>;
  zoneSummary: string;
  forecastNetSales: number;
  month: number;
  year: number;
  tenantId: string;
  outletId: string;
  requestingUserId: string;
  expiresAt: number;
}

export type PendingTargetAction = PendingTargetSingle | PendingTargetBulk;

export const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

export const CONFIRM_PATTERNS = /^\s*(yes|confirm|proceed|go\s+ahead|do\s+it|ok\s+proceed)\s*$/i;
export const CANCEL_PATTERNS = /^\s*(no|cancel|stop|abort|nevermind|never\s+mind|don'?t)\s*$/i;

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export function fmtINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function fmtMonthYear(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

const store = new Map<string, PendingTargetAction>();

export function pendingKey(userId: string, outletId: string): string {
  return `${userId}:${outletId}`;
}

export function storePending(key: string, action: PendingTargetAction): void {
  store.set(key, action);
  setTimeout(() => store.delete(key), PENDING_ACTION_TTL_MS);
}

export function getPending(key: string): PendingTargetAction | undefined {
  const action = store.get(key);
  if (!action) return undefined;
  if (Date.now() > action.expiresAt) { store.delete(key); return undefined; }
  return action;
}

export function clearPending(key: string): void {
  store.delete(key);
}

export function formatConfirmationPrompt(action: PendingTargetAction): string {
  if (action.type === "single") {
    return (
      `Setting **${action.resolvedName}**'s forecast target to **${fmtINR(action.forecastNetSales)}** ` +
      `for **${fmtMonthYear(action.month, action.year)}** (${action.zone} zone).\n\n` +
      `Reply **confirm** to proceed or **cancel** to abort.`
    );
  }
  const empList = action.employees
    .slice(0, 8)
    .map((e) => `• ${e.name} (${e.zone})`)
    .join("\n");
  const moreCount = action.employees.length - 8;
  const suffix = moreCount > 0 ? `\n_…and ${moreCount} more_` : "";
  return (
    `Setting forecast target to **${fmtINR(action.forecastNetSales)}** for ` +
    `**${action.employees.length} employees** in **${action.zoneSummary}** ` +
    `for **${fmtMonthYear(action.month, action.year)}**.\n\n` +
    `${empList}${suffix}\n\n` +
    `Reply **confirm** to proceed or **cancel** to abort.`
  );
}
