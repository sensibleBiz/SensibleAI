export interface WalletRecord {
  id: string;
  tenantId: string;
  outletId: string;
  /** PostgreSQL NUMERIC — always a string; never use JS float arithmetic */
  balanceCredits: string;
  /** PostgreSQL NUMERIC — always a string */
  reservedCredits: string;
  /** PostgreSQL NUMERIC — computed, always a string */
  availableCredits: string;
  currency: string;
  /** PostgreSQL NUMERIC — always a string */
  lowBalanceThreshold: string;
  isLowBalance: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionRecord {
  id: string;
  tenantId: string;
  outletId: string;
  walletId: string;
  txnType: "CREDIT" | "DEBIT" | "RESERVE" | "RELEASE" | "REVERSAL";
  /** PostgreSQL NUMERIC — always a string */
  credits: string;
  /** PostgreSQL NUMERIC — always a string */
  balanceAfter: string;
  /** PostgreSQL NUMERIC — always a string */
  reservedAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  actorUserId: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type TopUpOrderStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";

export type InitiateTopUpResult =
  | {
      orderId: string;
      orderRef: string;
      redirectUrl: string;
      amountInr: string;
      creditsToGrant: string;
      reused: false;
      status: "CREATED";
    }
  | {
      orderId: string;
      orderRef: string;
      redirectUrl: null;
      amountInr: string;
      creditsToGrant: string;
      reused: true;
      status: "CREATED" | "PENDING";
    };

export interface VerifyTopUpResult {
  orderId: string;
  orderRef: string;
  status: TopUpOrderStatus;
  walletTxnId: string | null;
  creditsGranted: string | null;
  idempotent: boolean;
}

// ─── Rate Card (Phase 9 Admin) ─────────────────────────────────────────────

export const BILLING_SERVICE_TYPES = {
  WHATSAPP_TEMPLATE: "whatsapp.template",
  WHATSAPP_UTILITY: "whatsapp.utility",
  WHATSAPP_AUTHENTICATION: "whatsapp.authentication",
  WHATSAPP_SERVICE: "whatsapp.service",
  EMAIL_SES: "email.ses",
  SMS_TRANSACTIONAL: "sms.transactional",
  AI_CHAT_TOKEN: "ai.chat_token",
  AI_EMBEDDING: "ai.embedding",
  AI_AGENT_ACTION: "ai.agent_action",
} as const;

export type BillingServiceType = (typeof BILLING_SERVICE_TYPES)[keyof typeof BILLING_SERVICE_TYPES];

export const ALL_SERVICE_TYPE_VALUES = Object.values(BILLING_SERVICE_TYPES);

export interface RateCardRecord {
  id: string;
  serviceType: string;
  countryCode: string | null;
  provider: string | null;
  unitLabel: string;
  /** NUMERIC(10,4) as string — never use JS float arithmetic on this */
  creditsPerUnit: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateRateCardBody {
  serviceType: string;
  countryCode?: string | null;
  provider?: string | null;
  unitLabel: string;
  creditsPerUnit: string;
  isActive?: boolean;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  notes?: string | null;
}

export interface UpdateRateCardBody {
  notes?: string | null;
  isActive?: boolean;
  effectiveUntil?: string | null;
}

export const TERMINAL_STATUSES: ReadonlySet<TopUpOrderStatus> = new Set([
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
]);

export const POLLING_STATUSES: ReadonlySet<TopUpOrderStatus> = new Set([
  "CREATED",
  "PENDING",
]);
