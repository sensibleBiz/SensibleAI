import { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMessageApi } from "@/shared/hooks";
import { countPlanFeaturesByTier, createSidebarPlanFeature, DEFAULT_ANNUAL_PLAN_FEATURES, getSidebarFeatureLabel, getUnassignedSidebarFeatures, normalizeAnnualPlanFeatures, planIncludesFeature, sortAnnualPlanFeatures, type AnnualPlanFeature, type PlanTier } from "../utils/annualPlanCatalog";
import type { OutletFeatureConfig } from "../utils/outletFeatures";
import { outletApi } from "../api/outletApi";

const planGridClass =
  "grid grid-cols-[minmax(220px,1fr)_repeat(3,minmax(170px,0.72fr))] items-stretch";

const PLAN_OPTIONS: { value: PlanTier; label: string }[] = [
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
];

export default function AnnualPlansSection({
  canManagePlans,
}: {
  canManagePlans: boolean;
}) {
  const messageApi = useMessageApi();
  const [features, setFeatures] = useState<AnnualPlanFeature[]>(
    DEFAULT_ANNUAL_PLAN_FEATURES
  );
  const [saving, setSaving] = useState(false);
  const [draftTiers, setDraftTiers] = useState<Record<string, PlanTier>>({});
  const [view, setView] = useState<"see" | "update">("see");
  const isManaging = canManagePlans && view === "update";

  useEffect(() => {
    let current = true;
      void outletApi.getPlanCatalog().then((result) => {
        if (current) setFeatures(normalizeAnnualPlanFeatures(result.features));
      }).catch(() => {
        if (current) setFeatures(DEFAULT_ANNUAL_PLAN_FEATURES);
      });
    return () => { current = false; };
  }, []);

  const sortedFeatures = useMemo(
    () => sortAnnualPlanFeatures(features),
    [features]
  );
  const newSidebarFeatures = useMemo(
    () => (canManagePlans ? getUnassignedSidebarFeatures(features) : []),
    [canManagePlans, features]
  );
  const counts = useMemo(() => countPlanFeaturesByTier(features), [features]);

  const saveFeatures = async (nextFeatures: AnnualPlanFeature[]) => {
    setSaving(true);
    try {
        const response = await outletApi.savePlanCatalog(nextFeatures);
        setFeatures(normalizeAnnualPlanFeatures(response.features));
        return true;
      } catch {
        messageApi.error("Failed to update plan features");
        return false;
      } finally {
        setSaving(false);
      }
  };

  const handleAddSidebarFeature = async (
    feature: OutletFeatureConfig,
    tier: PlanTier
  ) => {
    const nextFeatures = [
      ...features,
      createSidebarPlanFeature(feature, tier),
    ];
    const saved = await saveFeatures(nextFeatures);
    if (saved) {
      messageApi.success(`${feature.label} added to ${tier} plan`);
    }
  };

  const handleChangeTier = async (featureId: string, tier: PlanTier) => {
    const nextFeatures = features.map((feature) =>
      feature.id === featureId ? { ...feature, tier } : feature
    );
    await saveFeatures(nextFeatures);
  };

  const handleRemoveFeature = async (featureId: string) => {
    const nextFeatures = features.filter((feature) => feature.id !== featureId);
    const saved = await saveFeatures(nextFeatures);
    if (saved) {
      messageApi.success("Feature removed from plans");
    }
  };

  return (
    <section className="mt-8 w-full max-w-none rounded-3xl border border-[#e7ebf1] bg-white p-5 text-[#0a3750] shadow-[0_1px_2px_rgba(10,55,80,0.04),0_12px_32px_-16px_rgba(10,55,80,0.12)] dark:border-white/10 dark:bg-[#17181a] dark:text-white sm:p-8">
      <div className="mb-9 text-center">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#ff3228]">
          <span className="h-px w-4 bg-[#ff3228]" />
          Sensible AI CRM &middot; Annual Plans
          <span className="h-px w-4 bg-[#ff3228]" />
        </p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#0a3750] dark:text-white sm:text-4xl">
          Choose the right plan for your team
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[#5b6b7c] dark:text-white/60">
          Silver manages sales, Gold grows sales with AI, and Platinum automates
          the sales organisation end to end.
        </p>

        {canManagePlans && (
          <div className="mx-auto mt-6 inline-flex rounded-full border border-[#e7ebf1] bg-[#f7f9fc] p-1 dark:border-white/10 dark:bg-[#202124]">
            <button
              type="button"
              onClick={() => setView("see")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                view === "see"
                  ? "bg-[#0a3750] text-white shadow-sm"
                  : "text-[#5b6b7c] hover:text-[#0a3750] dark:text-white/60 dark:hover:text-white"
              }`}
            >
              See Plan
            </button>
            <button
              type="button"
              onClick={() => setView("update")}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                view === "update"
                  ? "bg-[#0a3750] text-white shadow-sm"
                  : "text-[#5b6b7c] hover:text-[#0a3750] dark:text-white/60 dark:hover:text-white"
              }`}
            >
              Update Plan
            </button>
          </div>
        )}
      </div>

      {isManaging && newSidebarFeatures.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[#e7ebf1] bg-[#f7f9fc] p-4 dark:border-white/10 dark:bg-[#202124]">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#ff3228]/10 text-[#ff3228]">
              <Sparkles size={13} strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#0a3750] dark:text-white">
                New sidebar features
              </p>
              <p className="text-xs text-[#7b8799] dark:text-white/50">
                These modules are in the sidebar but not assigned to a plan yet.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {newSidebarFeatures.map((feature) => {
              const selectedTier = draftTiers[feature.key] ?? "silver";

              return (
                <div
                  key={feature.key}
                  className="flex flex-col gap-2.5 rounded-xl border border-[#e7ebf1] bg-white px-3.5 py-3 dark:border-white/10 dark:bg-[#26272b] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#0a3750] dark:text-white">
                      {getSidebarFeatureLabel(feature)}
                    </p>
                    <p className="truncate text-xs text-[#7b8799] dark:text-white/45">
                      {feature.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      className="rounded-lg border border-[#dbe2ea] bg-white px-2.5 py-1.5 text-sm font-medium text-[#0a3750] outline-none transition focus:border-[#0a3750] disabled:opacity-60 dark:border-white/15 dark:bg-[#303134] dark:text-white"
                      disabled={saving}
                      value={selectedTier}
                      onChange={(event) =>
                        setDraftTiers((current) => ({
                          ...current,
                          [feature.key]: event.target.value as PlanTier,
                        }))
                      }
                    >
                      {PLAN_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        handleAddSidebarFeature(feature, selectedTier)
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0a3750] px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-[#0a3750]/90 disabled:opacity-60"
                    >
                      <Plus size={14} />
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="min-w-[820px]">
          <div className={planGridClass}>
            <div className="sticky left-0 z-20" />
            <PlanColumnHeader
              badge={`${counts.silver} core features`}
              description="A dependable CRM foundation for managing your sales pipeline."
              name="Silver"
              price="₹72,000"
              tagline="Manage Sales"
              tone="silver"
            />
            <PlanColumnHeader
              badge={`Everything in Silver + ${counts.gold} more`}
              description="Grow revenue faster with AI-driven discovery, scoring, and automation."
              highlightLabel="Most Popular"
              name="Gold"
              price="₹1,50,000"
              tagline="Grow Sales with AI"
              tone="gold"
            />
            <PlanColumnHeader
              badge={`Everything in Gold + ${counts.platinum} more`}
              description="Automate the entire sales organisation with agents and enterprise controls."
              highlightLabel="Best Value"
              name="Platinum"
              price="₹2,20,000"
              tagline="Automate the Sales Organisation"
              tone="platinum"
            />
          </div>

          <div className="space-y-1 rounded-b-2xl border border-t-0 border-[#e7ebf1] bg-[#fbfcfe] p-2 dark:border-white/10 dark:bg-[#1c1d1f]">
            {sortedFeatures.map((feature, index) => {
              const rowBackground =
                index % 2 === 0
                  ? "bg-white dark:bg-[#202124]"
                  : "bg-[#fbfcfe] dark:bg-[#1c1d1f]";

              return (
                <div
                  key={feature.id}
                  className={`${planGridClass} group items-center rounded-lg transition-colors hover:bg-[#f4f7fb] dark:hover:bg-[#26272b] ${rowBackground}`}
                >
                  <span
                    className={`sticky left-0 z-10 flex items-center gap-3 px-5 py-3.5 text-[15px] font-medium text-[#0a3750] dark:text-white/90 ${rowBackground}`}
                  >
                    <span className="min-w-0 flex-1">{feature.label}</span>
                    {isManaging && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <select
                          className="rounded-md border border-[#dbe2ea] bg-white px-2 py-1 text-xs font-medium text-[#0a3750] outline-none transition focus:border-[#0a3750] disabled:opacity-60 dark:border-white/15 dark:bg-[#303134] dark:text-white"
                          disabled={saving}
                          value={feature.tier}
                          onChange={(event) =>
                            handleChangeTier(
                              feature.id,
                              event.target.value as PlanTier
                            )
                          }
                        >
                          {PLAN_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {feature.source === "sidebar" && (
                          <button
                            type="button"
                            aria-label={`Remove ${feature.label}`}
                            disabled={saving}
                            onClick={() => handleRemoveFeature(feature.id)}
                            className="rounded-md p-1 text-[#a32d2d] transition hover:bg-[#fcebeb] disabled:opacity-60 dark:hover:bg-white/10"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </span>
                    )}
                  </span>
                  <FeatureCheck
                    included={planIncludesFeature("silver", feature.tier)}
                    tone="silver"
                  />
                  <FeatureCheck
                    included={planIncludesFeature("gold", feature.tier)}
                    tone="gold"
                  />
                  <FeatureCheck
                    included={planIncludesFeature("platinum", feature.tier)}
                    tone="platinum"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

type PlanTone = "silver" | "gold" | "platinum";

const TONE_STYLES: Record<
  PlanTone,
  {
    wrapper: string;
    name: string;
    tagline: string;
    badge: string;
    description: string;
    price: string;
    period: string;
    highlightPill?: string;
  }
> = {
  silver: {
    wrapper:
      "bg-[#f7f9fc] border-x border-t border-[#e7ebf1] dark:bg-[#202124] dark:border-white/10",
    name: "text-[#0a3750] dark:text-white",
    tagline: "text-[#5b6b7c] dark:text-white/50",
    badge:
      "bg-white text-[#5b6b7c] border border-[#e0e6ee] dark:bg-white/5 dark:text-white/60 dark:border-white/10",
    description: "text-[#5b6b7c] dark:text-white/55",
    price: "text-[#0a3750] dark:text-white",
    period: "text-[#8b98a8] dark:text-white/40",
  },
  gold: {
    wrapper:
      "relative z-10 border-x-2 border-t-2 border-[#ff3228] bg-white shadow-[0_18px_40px_-20px_rgba(255,50,40,0.45)] dark:bg-[#231a1a]",
    name: "text-[#0a3750] dark:text-white",
    tagline: "text-[#ff3228]",
    badge:
      "bg-[#fff1f0] text-[#c81d13] border border-[#ffd3d0] dark:bg-[#3a1f1c] dark:text-[#ff9b93] dark:border-[#5c2b26]",
    description: "text-[#5b6b7c] dark:text-white/55",
    price: "text-[#0a3750] dark:text-white",
    period: "text-[#8b98a8] dark:text-white/40",
    highlightPill: "bg-[#ff3228] text-white",
  },
  platinum: {
    wrapper: "bg-[#0a3750] border-x border-t border-[#0a3750]",
    name: "text-white",
    tagline: "text-white/70",
    badge: "bg-white/10 text-white/90 border border-white/15",
    description: "text-white/65",
    price: "text-white",
    period: "text-white/45",
    highlightPill: "bg-white text-[#0a3750]",
  },
};

function PlanColumnHeader({
  badge,
  description,
  highlightLabel,
  name,
  price,
  tagline,
  tone,
}: {
  badge: string;
  description: string;
  highlightLabel?: string;
  name: string;
  price: string;
  tagline: string;
  tone: PlanTone;
}) {
  const styles = TONE_STYLES[tone];

  return (
    <div
      className={`flex min-h-[20rem] flex-col overflow-hidden rounded-t-2xl ${styles.wrapper}`}
    >
      <div
        className={`flex h-8 shrink-0 items-center justify-center text-[10px] font-bold uppercase tracking-[0.12em] ${
          highlightLabel ? styles.highlightPill : "bg-transparent"
        }`}
      >
        {highlightLabel ?? ""}
      </div>
      <div className="flex flex-1 flex-col items-center px-5 pb-7 pt-6 text-center">
      <h3 className={`text-2xl font-bold tracking-tight ${styles.name}`}>
        {name}
      </h3>
      <p
        className={`mt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] ${styles.tagline}`}
      >
        {tagline}
      </p>
      <p
        className={`mt-3.5 rounded-full px-3 py-1 text-[11px] font-semibold ${styles.badge}`}
      >
        {badge}
      </p>
      <p className={`mt-4 max-w-[230px] text-sm leading-6 ${styles.description}`}>
        {description}
      </p>
      <div className="mt-auto pt-6">
        <p className={`text-3xl font-extrabold tracking-tight ${styles.price}`}>
          {price}
        </p>
        <p className={`mt-1 text-sm font-medium ${styles.period}`}>/year</p>
      </div>
      </div>
    </div>
  );
}

const CHECK_CIRCLE_STYLES: Record<PlanTone, string> = {
  silver: "bg-[#0a3750] dark:bg-white/25",
  gold: "bg-[#ff3228]",
  platinum: "bg-white text-[#0a3750]",
};

function FeatureCheck({
  included,
  tone,
}: {
  included: boolean;
  tone: PlanTone;
}) {
  return (
    <span className="flex min-h-12 items-center justify-center px-5 py-3.5">
      {included ? (
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full shadow-sm ${CHECK_CIRCLE_STYLES[tone]}`}
        >
          <Check
            size={14}
            strokeWidth={3}
            className={tone === "platinum" ? "text-[#0a3750]" : "text-white"}
          />
        </span>
      ) : (
        <Minus
          size={14}
          strokeWidth={2}
          className="text-[#c7cfd8] dark:text-white/20"
        />
      )}
    </span>
  );
}
