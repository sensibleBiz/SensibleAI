export type WalletTransactionType = "CREDIT" | "DEBIT" | "RECHARGE";

export interface DealerWalletSummary {
  walletBalance: number;
  totalEarned: number;
  totalUsed: number;
  totalSubscriptions: number;
  totalOrders: number;
}

export interface RewardRule {
  id: string;
  planName: string;
  duration: number;
  rewardPoints: number;
  isActive: boolean;
}

export interface WalletTransaction {
  id: string;
  dealerId: string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  purpose: string;
  referenceId?: string;
  createdAt: string;
}

export interface DealerSubscription {
  id: string;
  dealerId: string;
  customerName: string;
  customerMobile: string;
  planId: string;
  planName: string;
  rewardPointsGiven: number;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  createdAt: string;
}
