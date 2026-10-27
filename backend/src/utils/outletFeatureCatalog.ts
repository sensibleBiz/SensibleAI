const FEATURE_KEYS = [
  "dashboard",
  "leads",
  "leads_list",
  "leads_funnel",
  "leads_activities",
  "leads_ringing",
  "address_cards",
  "reports",
  "reports_source_wise",
  "reports_employee_wise",
  "reports_city_state_wise",
  "reports_call_logs",
  "reports_employee_target",
  "attendance",
  "attendance_records",
  "attendance_salary_master",
  "payroll",
  "leave",
  "leave_management",
  "leave_balance",
  "leave_holiday_calendar",
  "expense",
  "events",
  "warehouse",
  "warehouse_dashboard",
  "warehouse_products",
  "warehouse_transfer_request",
  "sales_orders",
  "export_operations",
  "ai_scrap",
  "user_tracking",
  "permissions",
  "permissions_master",
  "whatsapp",
  "whatsapp_automation",
  "email_automation",
  "sms_automation",
  "sendesk_admin",
  "team_tree",
  "integration",
  "products",
  "all_outlets",
  "ai_customer_dossiers",
] as const;

export const OUTLET_FEATURE_KEYS: readonly string[] = FEATURE_KEYS;
// AI dossiers are an evaluated, cost-bearing preview and must be explicitly enabled.
export const DEFAULT_OUTLET_FEATURE_KEYS = FEATURE_KEYS.filter((key) => key !== "ai_customer_dossiers");
const featureKeySet = new Set<string>(FEATURE_KEYS);

const legacyBundles: Record<string, readonly string[]> = {
  leads: ["leads_list", "leads_funnel", "leads_activities", "leads_ringing"],
  reports: [
    "reports_source_wise",
    "reports_employee_wise",
    "reports_city_state_wise",
    "reports_call_logs",
    "reports_employee_target",
  ],
  attendance: ["attendance_records", "attendance_salary_master"],
  leave: ["leave_management", "leave_balance", "leave_holiday_calendar"],
  warehouse: [
    "warehouse_dashboard",
    "warehouse_products",
    "warehouse_transfer_request",
  ],
};

export const normalizeFeatureKeys = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  const selected = new Set(
    value.map((key) => String(key ?? "").trim()).filter((key) => featureKeySet.has(key)),
  );
  return FEATURE_KEYS.filter((key) => selected.has(key));
};

const normalizeLookupValue = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();

const featureLookup = new Map(
  FEATURE_KEYS.map((key) => [normalizeLookupValue(key), key] as const),
);

const readDateMs = (value: unknown) => {
  if (!value) return undefined;
  if (typeof value === "object") {
    const dateLike = value as {
      seconds?: number;
      _seconds?: number;
      toMillis?: () => number;
    };
    if (typeof dateLike.toMillis === "function") return dateLike.toMillis();
    const seconds = dateLike.seconds ?? dateLike._seconds;
    if (Number.isFinite(seconds)) return Number(seconds) * 1_000;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 946_684_800_000 ? numeric * 1_000 : numeric;
  const parsed = new Date(String(value)).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const resolveLegacyFeatureKeys = (
  subscriptions: Array<Record<string, unknown>>,
  now = Date.now(),
) => {
  const enabled = new Set<string>();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  subscriptions.forEach((record) => {
    const renewalDate = readDateMs(record.renewalDate);
    if (record.isActive === false || (renewalDate && renewalDate < startOfToday.getTime())) {
      return;
    }

    const configuredKeys = normalizeFeatureKeys(record.enabledFeatureKeys);
    if (configuredKeys.length > 0) {
      configuredKeys.forEach((key) => enabled.add(key));
      return;
    }

    const candidates = [record.featureKey, record.moduleKey, record.key, record.id, record.name];
    const featureKey = candidates
      .map((candidate) => featureLookup.get(normalizeLookupValue(candidate)))
      .find(Boolean);
    if (!featureKey) return;

    const bundledKeys = legacyBundles[featureKey];
    if (bundledKeys) bundledKeys.forEach((key) => enabled.add(key));
    else enabled.add(featureKey);
  });

  return FEATURE_KEYS.filter((key) => enabled.has(key));
};
