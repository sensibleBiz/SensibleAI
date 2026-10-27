import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import type { LeaveBalance } from "../types/types";
import { leaveApi } from "../api/leaveApi";
import { getErrorMessage } from "@/shared/utils/errorUtils";

export interface UseLeaveBalanceOptions {
  userId?: string;
  year?: number;
  enabled?: boolean;
}

export const useLeaveBalance = (options: UseLeaveBalanceOptions = {}) => {
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const year = options.year ?? new Date().getFullYear();
  const enabled = options.enabled ?? true;

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!enabled || !outletId) {
      setLeaveBalances([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const result = await leaveApi.listBalances(outletId, year, options.userId, signal);
      setLeaveBalances(result.items);
      setError(null);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(getErrorMessage(loadError));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [enabled, options.userId, outletId, year]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const updateTotalLeaves = async (
    userId: string,
    newTotalLeaves: number,
    reason = "Annual leave allocation updated",
  ): Promise<{ success: boolean; error?: string }> => {
    if (!outletId) return { success: false, error: "No outlet selected" };
    try {
      await leaveApi.updateBalance(outletId, userId, year, newTotalLeaves, reason);
      await load();
      return { success: true };
    } catch (updateError) {
      return { success: false, error: getErrorMessage(updateError) };
    }
  };

  const syncLeaveBalances = async () => {
    await load();
  };

  return { leaveBalances, loading, error, syncLeaveBalances, updateTotalLeaves, refetch: load };
};
