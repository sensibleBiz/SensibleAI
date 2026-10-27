import { useCallback, useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { isOutletMonitoringOutlet } from "@/shared/lib/constants";
import { DEFAULT_OUTLET_FEATURE_KEYS, getOutletFeatureSubmoduleParent, getOutletFeatureSubmodules } from "../utils/outletFeatures";
import { OUTLET_FEATURE_KEYS, type OutletFeatureKey } from "../../../shared/lib/sidebarMenuConfig";
import {
  accessControlApi,
  OUTLET_FEATURE_ACCESS_UPDATED_EVENT,
} from "@/features/access-control";

export const useOutletFeatureAccess = () => {
  const outletInfo = useSelector((state: RootState) => state.appState.outletInfo);
  const { authMode, postgresStatus } = useSelector((state: RootState) => state.auth);
  const outletId = outletInfo?.id;
  const [enabledFeatureKeys, setEnabledFeatureKeys] = useState<OutletFeatureKey[]>(
    DEFAULT_OUTLET_FEATURE_KEYS,
  );
  const [isConfigured, setIsConfigured] = useState(false);
  const [loadingModuleSubscriptions, setLoadingModuleSubscriptions] =
    useState(false);

  const loadFeatureAccess = useCallback(async (signal?: AbortSignal) => {
    if (
      !outletId ||
      !authMode ||
      (authMode === "postgres" && postgresStatus !== "authenticated")
    ) {
      setEnabledFeatureKeys(DEFAULT_OUTLET_FEATURE_KEYS);
      setIsConfigured(false);
      setLoadingModuleSubscriptions(false);
      return;
    }
    setLoadingModuleSubscriptions(true);
    try {
      const access = await accessControlApi.getOutletFeatures(
        outletId,
        outletId,
        false,
        signal,
        authMode,
      );
      setIsConfigured(access.isConfigured);
      setEnabledFeatureKeys(
        access.isConfigured
          ? (access.enabledFeatureKeys as OutletFeatureKey[])
          : DEFAULT_OUTLET_FEATURE_KEYS,
      );
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Failed to load module subscriptions", error);
      setEnabledFeatureKeys(DEFAULT_OUTLET_FEATURE_KEYS);
      setIsConfigured(false);
    } finally {
      if (!signal?.aborted) setLoadingModuleSubscriptions(false);
    }
  }, [authMode, outletId, postgresStatus]);

  useEffect(() => {
    const controller = new AbortController();
    void loadFeatureAccess(controller.signal);
    return () => controller.abort();
  }, [loadFeatureAccess]);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const updatedOutletId = (event as CustomEvent<{ outletId?: string }>).detail
        ?.outletId;
      if (!updatedOutletId || updatedOutletId === outletId) {
        void loadFeatureAccess();
      }
    };
    const handleFocus = () => void loadFeatureAccess();
    window.addEventListener(OUTLET_FEATURE_ACCESS_UPDATED_EVENT, handleUpdate);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener(OUTLET_FEATURE_ACCESS_UPDATED_EVENT, handleUpdate);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadFeatureAccess, outletId]);

  const enabledFeatureKeySet = useMemo(
    () => new Set(enabledFeatureKeys),
    [enabledFeatureKeys]
  );
  const hasOutletFeature = (featureKey?: OutletFeatureKey | string) => {
    if (!featureKey) return true;
    if (!outletInfo?.id) return true;
    if (
      featureKey === OUTLET_FEATURE_KEYS.ALL_OUTLETS &&
      isOutletMonitoringOutlet(outletInfo.id)
    ) {
      return true;
    }
    if (loadingModuleSubscriptions) return true;
    if (!isConfigured) return true;

    const submoduleFeatureKeys = getOutletFeatureSubmodules(featureKey);
    if (submoduleFeatureKeys.length > 0) {
      return (
        enabledFeatureKeySet.has(featureKey as OutletFeatureKey) ||
        submoduleFeatureKeys.some((submoduleFeatureKey) =>
          enabledFeatureKeySet.has(submoduleFeatureKey)
        )
      );
    }

    if (enabledFeatureKeySet.has(featureKey as OutletFeatureKey)) return true;
    const parentFeatureKey = getOutletFeatureSubmoduleParent(featureKey);
    return Boolean(
      parentFeatureKey && enabledFeatureKeySet.has(parentFeatureKey),
    );
  };

  return {
    enabledFeatureKeys,
    hasOutletFeature,
    isFeatureAccessConfigured: isConfigured,
    loadingModuleSubscriptions,
  };
};
