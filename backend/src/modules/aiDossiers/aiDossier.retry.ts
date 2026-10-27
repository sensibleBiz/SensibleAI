import type { DossierStatus } from "./aiDossier.types.js";

export interface DossierRetryPlan {
  status: Extract<DossierStatus, "pending" | "failed">;
  delaySeconds: number;
}

export const dossierRetryPlan = (attemptCount: number, maxAttempts = 8): DossierRetryPlan => ({
  status: attemptCount >= maxAttempts ? "failed" : "pending",
  delaySeconds: Math.min(60 * 2 ** Math.max(0, attemptCount - 1), 3_600),
});

export const dossierErrorCode = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (/NOT_CONFIGURED/.test(message)) return "SYNTHESIS_PROVIDER_NOT_CONFIGURED";
  if (/INVALID_JSON/.test(message)) return "SYNTHESIS_INVALID_JSON";
  if (/INVALID_SCHEMA/.test(message)) return "SYNTHESIS_INVALID_SCHEMA";
  if (/INVALID_EVIDENCE/.test(message)) return "SYNTHESIS_INVALID_EVIDENCE";
  if (/permission|authoriz/i.test(message)) return "SOURCE_AUTHORIZATION_REVOKED";
  return "SYNTHESIS_PROVIDER_ERROR";
};
