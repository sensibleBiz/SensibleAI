// NUMERIC columns from PostgreSQL arrive as strings. Never use float arithmetic on these.

export type UsageEventStatus = "PENDING" | "BILLED" | "INSUFFICIENT" | "FAILED" | "REVERSED";

export interface UsageEventRecord {
  id: string;
  tenantId: string;
  outletId: string;
  walletId: string;
  serviceType: string;
  quantity: string;
  unitLabel: string;
  rateCardId: string | null;
  estimatedCredits: string | null;
  billedCredits: string | null;
  status: UsageEventStatus;
  walletTxnId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string;
  actorUserId: string | null;
  providerRef: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Input to usageService.meterUsage — the single entry point for all billing calls.
export interface MeterUsageInput {
  tenantId: string;
  outletId: string;
  serviceType: string;
  quantity?: string;            // default "1.0000"
  idempotencyKey: string;       // stable, unique per billable event (provider ID preferred)
  actorUserId?: string;
  referenceType?: string;       // must be provided with referenceId (usage_events constraint)
  referenceId?: string;         // UUID, e.g. whatsapp messageUuid
  providerRef?: string;         // free-form provider reference, e.g. SES MessageId
  countryCode?: string;         // rate resolution hint
  provider?: string;            // rate resolution hint
  metadata?: Record<string, unknown>;
}

export interface MeterUsageResult {
  usageEvent: UsageEventRecord;
  walletTxnId: string;
  billedCredits: string;
  idempotent: boolean;          // true if already billed (idempotency_key collision)
}
