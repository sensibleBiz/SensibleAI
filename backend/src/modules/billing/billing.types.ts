export type WalletTxnType = "CREDIT" | "DEBIT" | "RESERVE" | "RELEASE" | "REVERSAL";

// NUMERIC columns come back from PostgreSQL as strings. Never use float arithmetic on these.
export interface WalletRecord {
  id: string;
  tenantId: string;
  outletId: string;
  balanceCredits: string;
  reservedCredits: string;
  availableCredits: string;   // balance_credits - reserved_credits, computed
  currency: string;
  lowBalanceThreshold: string;
  isLowBalance: boolean;       // availableCredits < lowBalanceThreshold
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransactionRecord {
  id: string;
  tenantId: string;
  outletId: string;
  walletId: string;
  txnType: WalletTxnType;
  credits: string;
  balanceAfter: string;
  reservedAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  actorUserId: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface WalletDebitInput {
  amount: string;              // positive decimal string, e.g. "100.0000"
  idempotencyKey: string;
  actorUserId?: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface WalletCreditInput {
  amount: string;
  idempotencyKey: string;
  actorUserId?: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface WalletReservationInput {
  amount: string;
  idempotencyKey: string;
  actorUserId?: string;
  referenceType?: string;
  referenceId?: string;
  description?: string;
}

export interface WalletMutationResult {
  wallet: WalletRecord;
  transaction: WalletTransactionRecord;
  idempotent: boolean;
}

export interface TransactionListQuery {
  limit?: number;
  offset?: number;
}
