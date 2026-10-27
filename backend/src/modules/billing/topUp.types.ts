// NUMERIC columns from PostgreSQL arrive as strings. Never use float arithmetic on these.

export type TopUpOrderStatus = "CREATED" | "PENDING" | "SUCCESS" | "FAILED" | "EXPIRED" | "REFUNDED";

export interface TopUpOrderRecord {
  id: string;
  tenantId: string;
  outletId: string;
  walletId: string;
  /** Stable internal reference; also used as PhonePe merchantOrderId */
  orderRef: string;
  provider: string;
  /** PhonePe orderId returned by v2 create payment */
  providerOrderId: string | null;
  /** PhonePe transactionId returned in the status / callback response */
  providerTxnId: string | null;
  /** INR amount as NUMERIC string, e.g. "500.00" */
  amountInr: string;
  /** Credits to add to the wallet as NUMERIC string, e.g. "5000.0000" */
  creditsToGrant: string;
  status: TopUpOrderStatus;
  callbackPayload: Record<string, unknown> | null;
  idempotencyKey: string;
  requestedByUserId: string;
  expiresAt: Date | null;
  paidAt: Date | null;
  walletTxnId: string | null;
  createdAt: Date;
  updatedAt: Date;
  reconcileRetryCount: number;
  reconcileNextRetryAt: Date | null;
  reconcileLastFailureClass: "TRANSIENT" | "PERMANENT" | "AMBIGUOUS" | "DEAD_LETTER" | null;
}

export interface InitiateTopUpInput {
  tenantId: string;
  outletId: string;
  requestedByUserId: string;
  /** INR amount as a positive decimal string, max 2dp, e.g. "500.00" */
  amountInr: string;
  idempotencyKey: string;
}

export type InitiateTopUpResult =
  | {
      orderId: string;
      orderRef: string;
      /** URL the frontend should redirect the user to for payment */
      redirectUrl: string;
      amountInr: string;
      creditsToGrant: string;
      reused: false;
      status: "CREATED";
    }
  | {
      orderId: string;
      orderRef: string;
      /** Replayed requests are sent to local status polling, never to checkout creation. */
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
  /** true when the payment was already processed by a prior call */
  idempotent: boolean;
}

// ─── PhonePe PG API shapes ────────────────────────────────────────────────────

export interface PhonePeApiError {
  code?: string;
  message?: string;
}

export interface PhonePeCreatePaymentResponse extends PhonePeApiError {
  orderId?: string;
  state?: string;
  expireAt?: number;
  redirectUrl?: string;
}

export interface PhonePePaymentDetail {
  transactionId?: string;
  paymentMode?: string;
  timestamp?: number;
  amount?: number;
  state?: string;
  errorCode?: string;
  detailedErrorCode?: string;
  [key: string]: unknown;
}

export interface PhonePeOrderStatusResponse extends PhonePeApiError {
  orderId?: string;
  state?: string;
  amount?: number;
  payableAmount?: number;
  feeAmount?: number;
  expireAt?: number;
  paymentDetails?: PhonePePaymentDetail[];
  metaInfo?: Record<string, unknown>;
  errorContext?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface PhonePePaymentWebhook {
  event: "checkout.order.completed" | "checkout.order.failed";
  payload: {
    orderId?: string;
    merchantId?: string;
    merchantOrderId: string;
    state?: string;
    amount?: number;
    expireAt?: number;
    paymentDetails?: PhonePePaymentDetail[];
    metaInfo?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
