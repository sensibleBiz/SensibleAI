import { useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import {
  CrmVerticalType,
  CrmTerminologyConfig,
  VERTICAL_TERMINOLOGY,
} from "@/features/leads/types/crmVerticals";

export const resolveCrmVertical = (value: unknown): CrmVerticalType => {
  const candidate = String(value ?? "").toLowerCase().trim().replace(/_/g, " ");

  if (candidate.includes("export")) return "exports";
  if (candidate.includes("manufactur")) return "manufacturing";
  if (
    candidate.includes("realestate") ||
    candidate.includes("real estate") ||
    candidate.includes("property")
  ) {
    return "realestate";
  }
  if (candidate.includes("service")) return "services";

  return "default";
};

export const useCrmTerminology = (overrideVertical?: CrmVerticalType) => {
  const outletInfo = useSelector((state: RootState) => state.appState.outletInfo);
  const stored = useSelector((state: RootState) => state.appState.businessConfiguration);
  const configuration = stored?.outletId === outletInfo?.id ? stored?.configuration : undefined;

  const activeVertical: CrmVerticalType = useMemo(() => {
    if (overrideVertical) return overrideVertical;

    const outletRecord = outletInfo as unknown as (Record<string, unknown> | null);
    return resolveCrmVertical(
      configuration?.vertical || outletRecord?.vertical ||
        outletRecord?.businessType ||
        outletRecord?.industry
    );
  }, [configuration?.vertical, outletInfo, overrideVertical]);

  const config: CrmTerminologyConfig = useMemo(() => {
    return VERTICAL_TERMINOLOGY[activeVertical] || VERTICAL_TERMINOLOGY.default;
  }, [activeVertical]);

  const getStageLabel = (stageKey: string, fallback?: string): string => {
    const configuredStage = configuration?.pipelineStages?.find((stage) => stage.stageKey === stageKey);
    if (configuredStage) return configuredStage.displayName;
    if (config.stageLabels && config.stageLabels[stageKey]) {
      return config.stageLabels[stageKey];
    }
    return fallback || stageKey;
  };

  return {
    vertical: activeVertical,
    isExport: activeVertical === "exports",
    ...config,
    getStageLabel,
  };
};

export default useCrmTerminology;
