import { env } from "../../../config/env.js";
import { processPostgresMinopTransaction } from "./postgresBridge.js";
import { normalizeText, validateTransaction } from "./validation.js";

export const processTransaction = async (
  transaction: Record<string, unknown>,
  _requestContext: { integrationKey: string },
): Promise<number> => {
  const validation = validateTransaction(transaction);
  if (!validation.valid) return 0;
  const outletId = normalizeText(env.biometric.postgresOutletId);
  if (!outletId) return 0;
  return (await processPostgresMinopTransaction(outletId, transaction)) ?? 0;
};
