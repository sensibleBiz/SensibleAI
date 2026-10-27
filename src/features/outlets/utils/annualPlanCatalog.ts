import { OUTLET_FEATURES, type OutletFeatureConfig } from "./outletFeatures";

export type PlanTier = "silver" | "gold" | "platinum";

export type AnnualPlanFeature = {
  id: string;
  label: string;
  tier: PlanTier;
  source: "default" | "sidebar";
  featureKey?: string;
};

export const PLAN_CATALOG_DOC_ID = "annual";

const PLAN_TIERS: PlanTier[] = ["silver", "gold", "platinum"];

const toFeatureId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const defaultFeatures = (
  labels: string[],
  tier: PlanTier
): AnnualPlanFeature[] =>
  labels.map((label) => ({
    id: toFeatureId(label),
    label,
    tier,
    source: "default" as const,
  }));

export const DEFAULT_ANNUAL_PLAN_FEATURES: AnnualPlanFeature[] = [
  ...defaultFeatures(
    [
      "Lead Management",
      "Customer & Company Management",
      "Sales Pipeline",
      "Follow-up & Reminders",
      "Tasks & Activities",
      "Notes & Communication History",
      "Lead Assignment",
      "Basic Reports & Dashboard",
      "WhatsApp & Email Templates",
      "AI Message & Email Generation",
    ],
    "silver"
  ),
  ...defaultFeatures(
    [
      "AI Lead Discovery",
      "AI Data Enrichment",
      "AI Lead Scoring",
      "Sales Automation",
      "Dealer Management",
    ],
    "gold"
  ),
  ...defaultFeatures(
    [
      "AI Sales Agents",
      "Advanced Analytics & Forecasting",
      "Territory & Multi-Team Management",
      "Advanced API & Integrations",
      "Enterprise Permissions & Audit Logs",
    ],
    "platinum"
  ),
];

export const getSidebarFeatureLabel = (feature: OutletFeatureConfig) => {
  const parent = OUTLET_FEATURES.find(
    (candidate) => candidate.key === feature.parentKey
  );

  return parent ? `${parent.label} › ${feature.label}` : feature.label;
};

export const getUnassignedSidebarFeatures = (
  planFeatures: AnnualPlanFeature[]
) => {
  const assignedKeys = new Set(
    planFeatures
      .map((feature) => feature.featureKey)
      .filter((key): key is string => Boolean(key))
  );

  return OUTLET_FEATURES.filter((feature) => !assignedKeys.has(feature.key));
};

export const planIncludesFeature = (plan: PlanTier, featureTier: PlanTier) => {
  if (plan === "platinum") return true;
  if (plan === "gold") return featureTier !== "platinum";
  return featureTier === "silver";
};

export const countPlanFeaturesByTier = (features: AnnualPlanFeature[]) => ({
  silver: features.filter((feature) => feature.tier === "silver").length,
  gold: features.filter((feature) => feature.tier === "gold").length,
  platinum: features.filter((feature) => feature.tier === "platinum").length,
});

export const sortAnnualPlanFeatures = (features: AnnualPlanFeature[]) => {
  const tierOrder: Record<PlanTier, number> = {
    silver: 0,
    gold: 1,
    platinum: 2,
  };

  return [...features].sort((first, second) => {
    const tierDiff = tierOrder[first.tier] - tierOrder[second.tier];
    if (tierDiff !== 0) return tierDiff;
    return first.label.localeCompare(second.label);
  });
};

export const normalizeAnnualPlanFeatures = (
  value: unknown
): AnnualPlanFeature[] => {
  if (!Array.isArray(value)) return DEFAULT_ANNUAL_PLAN_FEATURES;

  const normalized = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];

    const record = item as Record<string, unknown>;
    const label = String(record.label ?? "").trim();
    const tier = String(record.tier ?? "").toLowerCase() as PlanTier;
    const source = record.source === "sidebar" ? "sidebar" : "default";
    const featureKey =
      typeof record.featureKey === "string" && record.featureKey.trim()
        ? record.featureKey.trim()
        : undefined;

    if (!label || !PLAN_TIERS.includes(tier)) return [];

    return [
      {
        id: String(record.id ?? featureKey ?? toFeatureId(label)),
        label,
        tier,
        source,
        ...(featureKey ? { featureKey } : {}),
      } satisfies AnnualPlanFeature,
    ];
  });

  return normalized.length > 0 ? normalized : DEFAULT_ANNUAL_PLAN_FEATURES;
};

export const createSidebarPlanFeature = (
  feature: OutletFeatureConfig,
  tier: PlanTier
): AnnualPlanFeature => ({
  id: `sidebar-${feature.key}`,
  label: getSidebarFeatureLabel(feature),
  tier,
  source: "sidebar",
  featureKey: feature.key,
});
