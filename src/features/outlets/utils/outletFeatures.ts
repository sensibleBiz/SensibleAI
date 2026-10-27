import {
  OUTLET_FEATURE_KEYS,
  SIDEBAR_MENU_OPTIONS,
  SIDEBAR_PERMISSION_SECTION_RULES,
  type OutletFeatureKey,
  type SidebarMenuOption,
} from "@/shared/lib/sidebarMenuConfig";

export { OUTLET_FEATURE_KEYS } from "@/shared/lib/sidebarMenuConfig";
export type { OutletFeatureKey } from "@/shared/lib/sidebarMenuConfig";

export interface OutletFeatureConfig {
  key: OutletFeatureKey;
  label: string;
  category: string;
  description: string;
  parentKey?: OutletFeatureKey;
}

const getFeatureConfigs = (
  options: readonly SidebarMenuOption[],
  parentKey?: OutletFeatureKey
): OutletFeatureConfig[] =>
  options.flatMap((option) => {
    if (option.systemOnly) {
      return getFeatureConfigs(option.children ?? [], parentKey);
    }

    const feature: OutletFeatureConfig = {
      key: option.featureKey,
      label: option.featureLabel ?? option.label,
      category: option.featureCategory,
      description: option.featureDescription,
      ...(parentKey ? { parentKey } : {}),
    };

    return [
      feature,
      ...getFeatureConfigs(option.children ?? [], option.featureKey),
    ];
  });

const configuredFeatures = getFeatureConfigs(SIDEBAR_MENU_OPTIONS);
const previewFeatures: OutletFeatureConfig[] = [{
  key: OUTLET_FEATURE_KEYS.AI_CUSTOMER_DOSSIERS,
  label: "AI customer dossiers (preview)",
  category: "AI previews",
  description: "Opt-in derived customer and lead summaries with usage and cost controls.",
}];

// Some sidebar links intentionally share one entitlement (for example Leads
// and Repeated Enquiries). The access page should show that entitlement once.
export const OUTLET_FEATURES: OutletFeatureConfig[] = Array.from(
  new Map([...configuredFeatures, ...previewFeatures].map((feature) => [feature.key, feature])).values()
);

/** Legacy bundle keys are retained only to expand older subscription records. */
export const OUTLET_FEATURE_SUBMODULE_KEYS: Partial<
  Record<OutletFeatureKey, OutletFeatureKey[]>
> = {
  [OUTLET_FEATURE_KEYS.LEADS]: [
    OUTLET_FEATURE_KEYS.LEADS_LIST,
    OUTLET_FEATURE_KEYS.LEADS_FUNNEL,
    OUTLET_FEATURE_KEYS.LEADS_ACTIVITIES,
    OUTLET_FEATURE_KEYS.LEADS_RINGING,
  ],
  [OUTLET_FEATURE_KEYS.REPORTS]: [
    OUTLET_FEATURE_KEYS.REPORTS_SOURCE_WISE,
    OUTLET_FEATURE_KEYS.REPORTS_EMPLOYEE_WISE,
    OUTLET_FEATURE_KEYS.REPORTS_CITY_STATE_WISE,
    OUTLET_FEATURE_KEYS.REPORTS_CALL_LOGS,
    OUTLET_FEATURE_KEYS.REPORTS_EMPLOYEE_TARGET,
  ],
  [OUTLET_FEATURE_KEYS.ATTENDANCE]: [
    OUTLET_FEATURE_KEYS.ATTENDANCE_RECORDS,
    OUTLET_FEATURE_KEYS.ATTENDANCE_SALARY_MASTER,
  ],
  [OUTLET_FEATURE_KEYS.LEAVE]: [
    OUTLET_FEATURE_KEYS.LEAVE_MANAGEMENT,
    OUTLET_FEATURE_KEYS.LEAVE_BALANCE,
    OUTLET_FEATURE_KEYS.LEAVE_HOLIDAY_CALENDAR,
  ],
  [OUTLET_FEATURE_KEYS.WAREHOUSE]: [
    OUTLET_FEATURE_KEYS.WAREHOUSE_DASHBOARD,
    OUTLET_FEATURE_KEYS.WAREHOUSE_PRODUCTS,
    OUTLET_FEATURE_KEYS.WAREHOUSE_TRANSFER_REQUEST,
  ],
};

export const LEADS_SUBMODULE_FEATURE_KEYS =
  OUTLET_FEATURE_SUBMODULE_KEYS[OUTLET_FEATURE_KEYS.LEADS] ?? [];

export const REPORTS_SUBMODULE_FEATURE_KEYS =
  OUTLET_FEATURE_SUBMODULE_KEYS[OUTLET_FEATURE_KEYS.REPORTS] ?? [];

export const ATTENDANCE_SUBMODULE_FEATURE_KEYS =
  OUTLET_FEATURE_SUBMODULE_KEYS[OUTLET_FEATURE_KEYS.ATTENDANCE] ?? [];

export const LEAVE_SUBMODULE_FEATURE_KEYS =
  OUTLET_FEATURE_SUBMODULE_KEYS[OUTLET_FEATURE_KEYS.LEAVE] ?? [];

export const WAREHOUSE_SUBMODULE_FEATURE_KEYS =
  OUTLET_FEATURE_SUBMODULE_KEYS[OUTLET_FEATURE_KEYS.WAREHOUSE] ?? [];

const outletFeatureSubmoduleParents = new Map<OutletFeatureKey, OutletFeatureKey>(
  Object.entries(OUTLET_FEATURE_SUBMODULE_KEYS).flatMap(
    ([parentKey, submoduleKeys]) =>
      (submoduleKeys || []).map(
        (submoduleKey) => [submoduleKey, parentKey as OutletFeatureKey] as const
      )
  )
);

export const getOutletFeatureSubmodules = (
  featureKey?: OutletFeatureKey | string
): OutletFeatureKey[] =>
  OUTLET_FEATURE_SUBMODULE_KEYS[featureKey as OutletFeatureKey] || [];

export const getOutletFeatureSubmoduleParent = (
  featureKey?: OutletFeatureKey | string
): OutletFeatureKey | undefined =>
  outletFeatureSubmoduleParents.get(featureKey as OutletFeatureKey);

export const isOutletFeatureSubmoduleKey = (
  featureKey?: OutletFeatureKey | string
): featureKey is OutletFeatureKey =>
  Boolean(getOutletFeatureSubmoduleParent(featureKey));

export const DEFAULT_OUTLET_FEATURE_KEYS = OUTLET_FEATURES
  .map((feature) => feature.key)
  .filter((key) => key !== OUTLET_FEATURE_KEYS.AI_CUSTOMER_DOSSIERS);
const ALL_OUTLET_FEATURE_KEYS = OUTLET_FEATURES.map((feature) => feature.key);

export const LEADS_ONLY_FEATURE_KEYS: OutletFeatureKey[] = [
  OUTLET_FEATURE_KEYS.DASHBOARD,
  OUTLET_FEATURE_KEYS.LEADS_LIST,
  OUTLET_FEATURE_KEYS.LEADS_FUNNEL,
  OUTLET_FEATURE_KEYS.LEADS_ACTIVITIES,
  OUTLET_FEATURE_KEYS.LEADS_RINGING,
];

const outletFeatureKeySet = new Set<string>(ALL_OUTLET_FEATURE_KEYS);
const outletFeatureLookup = new Map<string, OutletFeatureKey>();

OUTLET_FEATURES.forEach((feature) => {
  [
    feature.key,
    feature.label,
    feature.label.replace(/\s+Management$/i, ""),
    feature.label.replace(/\s+\(AI\)$/i, ""),
  ].forEach((value) => {
    const normalizedValue = normalizeFeatureLookupValue(value);
    if (!outletFeatureLookup.has(normalizedValue)) {
      outletFeatureLookup.set(normalizedValue, feature.key);
    }
  });
});

Object.keys(OUTLET_FEATURE_SUBMODULE_KEYS).forEach((featureKey) => {
  outletFeatureLookup.set(
    normalizeFeatureLookupValue(featureKey),
    featureKey as OutletFeatureKey
  );
});

export const normalizeOutletFeatureKeys = (
  value: unknown,
  fallback: OutletFeatureKey[] = DEFAULT_OUTLET_FEATURE_KEYS
): OutletFeatureKey[] => {
  if (!Array.isArray(value)) return fallback;

  return value.filter((key): key is OutletFeatureKey =>
    outletFeatureKeySet.has(String(key))
  );
};

export const sortOutletFeatureKeys = (
  featureKeys: OutletFeatureKey[]
): OutletFeatureKey[] => {
  const selected = new Set(featureKeys);
  return ALL_OUTLET_FEATURE_KEYS.filter((key) => selected.has(key));
};

export const getOutletFeatureKeyFromValue = (
  value: unknown
): OutletFeatureKey | undefined => {
  if (typeof value !== "string") return undefined;

  return outletFeatureLookup.get(normalizeFeatureLookupValue(value));
};

const permissionFeaturePrefixes = SIDEBAR_PERMISSION_SECTION_RULES.flatMap(
  (section) =>
    section.featureKey
      ? section.prefixes.map((prefix) => ({
          featureKey: section.featureKey as OutletFeatureKey,
          prefix,
        }))
      : []
).sort((first, second) => second.prefix.length - first.prefix.length);

export const getOutletFeatureKeysForPermission = (permission: {
  key?: unknown;
  category?: unknown;
}): OutletFeatureKey[] => {
  const permissionKey =
    typeof permission.key === "string"
      ? permission.key.trim().toUpperCase()
      : "";

  if (permissionKey) {
    const prefixMatches = permissionFeaturePrefixes.filter(({ prefix }) =>
      permissionKey.startsWith(prefix)
    );

    if (prefixMatches.length > 0) {
      const longestPrefixLength = Math.max(
        ...prefixMatches.map(({ prefix }) => prefix.length)
      );
      return Array.from(
        new Set(
          prefixMatches
            .filter(({ prefix }) => prefix.length === longestPrefixLength)
            .map(({ featureKey }) => featureKey)
        )
      );
    }
  }

  const categoryFeatureKey = getOutletFeatureKeyFromValue(permission.category);
  return categoryFeatureKey ? [categoryFeatureKey] : [];
};

export const getOutletFeatureKeyForPermission = (permission: {
  key?: unknown;
  category?: unknown;
}): OutletFeatureKey | undefined =>
  getOutletFeatureKeysForPermission(permission)[0];

export const isPermissionAvailableForOutletFeatures = (
  permission: { key?: unknown; category?: unknown },
  enabledFeatureKeys: Iterable<OutletFeatureKey>
) => {
  const featureKeys = getOutletFeatureKeysForPermission(permission);
  if (featureKeys.length === 0) return false;

  const enabledFeatureKeySet = new Set(enabledFeatureKeys);
  return featureKeys.some((featureKey) => enabledFeatureKeySet.has(featureKey));
};

export const getOutletFeatureKeyFromModuleSubscription = (
  subscription: unknown
): OutletFeatureKey | undefined => {
  if (!subscription || typeof subscription !== "object") return undefined;

  const record = subscription as Record<string, unknown>;
  const candidates = [
    record.featureKey,
    record.moduleKey,
    record.key,
    record.id,
    record.name,
  ];

  for (const candidate of candidates) {
    const featureKey = getOutletFeatureKeyFromValue(candidate);
    if (featureKey) return featureKey;
  }

  return undefined;
};

export const getEnabledFeatureKeysFromModuleSubscriptions = (
  subscriptions: unknown[]
): OutletFeatureKey[] => {
  const enabledFeatureKeys = new Set<OutletFeatureKey>();

  subscriptions.forEach((subscription) => {
    if (!subscription || typeof subscription !== "object") return;

    const record = subscription as Record<string, unknown>;
    if (record.isActive === false || isSubscriptionExpired(record.renewalDate)) {
      return;
    }

    if (Array.isArray(record.enabledFeatureKeys)) {
      normalizeOutletFeatureKeys(record.enabledFeatureKeys, []).forEach((key) =>
        enabledFeatureKeys.add(key)
      );
      return;
    }

    const featureKey = getOutletFeatureKeyFromModuleSubscription(record);
    if (!featureKey) return;

    const legacySubmodules = getOutletFeatureSubmodules(featureKey);
    if (legacySubmodules.length > 0) {
      legacySubmodules.forEach((submoduleKey) => enabledFeatureKeys.add(submoduleKey));
      return;
    }

    enabledFeatureKeys.add(featureKey);
  });

  return sortOutletFeatureKeys(Array.from(enabledFeatureKeys));
};

function normalizeFeatureLookupValue(value: string) {
  return value
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isSubscriptionExpired(value: unknown) {
  const timestamp = getDateMs(value);
  if (!timestamp) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return timestamp < today.getTime();
}

function getDateMs(value: unknown) {
  if (!value) return undefined;

  if (typeof value === "object") {
    const dateLikeValue = value as {
      seconds?: number;
      _seconds?: number;
      toMillis?: () => number;
    };

    if (typeof dateLikeValue.toMillis === "function") {
      const timestamp = dateLikeValue.toMillis();
      return Number.isFinite(timestamp) ? timestamp : undefined;
    }

    const seconds = dateLikeValue.seconds ?? dateLikeValue._seconds;
    return Number.isFinite(seconds) ? Number(seconds) * 1000 : undefined;
  }

  const numericValue =
    typeof value === "string" && value.trim() && !Number.isNaN(Number(value))
      ? Number(value)
      : value;
  const timestamp =
    typeof numericValue === "number" && numericValue < 946684800000
      ? numericValue * 1000
      : numericValue;
  const date = new Date(timestamp as string | number);

  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}
