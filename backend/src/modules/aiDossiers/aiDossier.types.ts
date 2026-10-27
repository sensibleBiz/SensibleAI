export type DossierSubjectType = "lead" | "customer";
export type DossierStatus = "pending" | "synthesizing" | "ready" | "stale" | "failed";

export interface EvidenceRef {
  sourceType: "lead" | "customer" | "timeline" | "quotation";
  sourceId: string;
}

export interface EvidenceBackedStatement {
  statement: string;
  evidence: EvidenceRef[];
}

export interface AiCustomerDossier {
  id: string;
  subjectType: DossierSubjectType;
  subjectId: string;
  outletId: string;
  status: DossierStatus;
  attemptCount: number;
  sourceVersion: string | null;
  sourceWatermark: Record<string, unknown>;
  factualSummary: string;
  summaryEvidence: EvidenceRef[];
  facts: EvidenceBackedStatement[];
  statedNeeds: EvidenceBackedStatement[];
  explicitBudget: Record<string, unknown> | null;
  decisionMakers: unknown[];
  risks: unknown[];
  suggestedNextActions: unknown[];
  estimates: {
    winProbability: number | null;
    churnRisk: number | null;
    calibrated: false;
    caveat: string;
  };
  synthesis: {
    provider: string | null;
    model: string | null;
    modelVersion: string | null;
    synthesizedAt: string | null;
    durationMs: number | null;
  };
  lastErrorCode: string | null;
  usage: { inputTokens: number; outputTokens: number; estimatedCostMicros: number };
  retainUntil: string | null;
  updatedAt: string;
}
