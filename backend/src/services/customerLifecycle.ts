import type { CustomerLifecycle } from "../types/customer.types.js";

export interface CustomerCounters {
  totalEnquiries: number;
  totalLost: number;
  totalWon: number;
}

export const customerLifecycleForWonCount = (
  totalWon: number,
): CustomerLifecycle => {
  if (totalWon >= 2) return "REPEAT_CUSTOMER";
  if (totalWon === 1) return "NEW_CUSTOMER";
  return "PROSPECT";
};

export const calculateCustomerTransition = (
  counters: CustomerCounters,
  previousStage: string,
  nextStage: string,
  linkedNow: boolean,
) => {
  const normalizedPreviousStage = previousStage.trim().toUpperCase();
  const normalizedNextStage = nextStage.trim().toUpperCase();
  const wonDelta = linkedNow
    ? 1
    : Number(normalizedNextStage === "WON") -
      Number(normalizedPreviousStage === "WON");
  const lostDelta = linkedNow
    ? 0
    : Number(normalizedNextStage === "LOST") -
      Number(normalizedPreviousStage === "LOST");
  const totalWon = Math.max(0, counters.totalWon + wonDelta);
  const totalLost = Math.max(0, counters.totalLost + lostDelta);

  return {
    lifecycle: customerLifecycleForWonCount(totalWon),
    totalEnquiries: Math.max(0, counters.totalEnquiries) + (linkedNow ? 1 : 0),
    totalLost,
    totalWon,
  };
};
