import { env } from "../../../config/env.js";
import { withDatabaseContext } from "../../../db/context.js";
import {
  BIOMETRIC_INGEST_BOOTSTRAP_TENANT_ID,
  BIOMETRIC_INGEST_SYSTEM_USER_ID,
  postgresBiometricService,
} from "../postgresBiometric.service.js";
import type { PostgresBiometricTransaction } from "../biometric.types.js";
import { POSTGRES_OUTLET_UUID_PATTERN } from "./constants.js";
import { getTransactionDateTime, normalizePunchId, normalizeText } from "./validation.js";

export const isPostgresOutletCandidate = (outletId: string) =>
  Boolean(env.database.url) && POSTGRES_OUTLET_UUID_PATTERN.test(normalizeText(outletId));

export const processPostgresMinopTransaction = async (
  outletId: string,
  transaction: Record<string, unknown>,
): Promise<number | null> => {
  if (!isPostgresOutletCandidate(outletId)) return null;
  const txnDateTime = getTransactionDateTime(transaction);
  const mapped: PostgresBiometricTransaction = {
    txnId: String(transaction.txnId),
    punchId: String(normalizePunchId(transaction.punchId)),
    mode: String(transaction.mode).trim().toUpperCase() as "IN" | "OUT",
    txnDateTime: txnDateTime as string | number,
    ...(transaction.dvcId !== undefined ? { dvcId: String(transaction.dvcId) } : {}),
    ...(transaction.dvcIP !== undefined ? { dvcIP: String(transaction.dvcIP) } : {}),
  };
  const bootstrap = {
    userId: BIOMETRIC_INGEST_SYSTEM_USER_ID,
    tenantId: BIOMETRIC_INGEST_BOOTSTRAP_TENANT_ID,
    isSuperAdmin: true,
  };
  const tenantId = await withDatabaseContext(bootstrap, (database) =>
    postgresBiometricService.resolveTenantId(database, outletId),
  );
  if (!tenantId) return null;
  const [result] = await withDatabaseContext(
    { userId: BIOMETRIC_INGEST_SYSTEM_USER_ID, tenantId, isSuperAdmin: true },
    (database) => postgresBiometricService.processTransactions(database, tenantId, outletId, [mapped]),
  );
  return result?.status ?? 0;
};
