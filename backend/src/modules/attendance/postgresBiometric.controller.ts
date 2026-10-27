import type { Request, Response } from "express";
import { AppError } from "../../errors/appError.js";
import { withDatabaseContext } from "../../db/context.js";
import {
  BIOMETRIC_INGEST_BOOTSTRAP_TENANT_ID,
  BIOMETRIC_INGEST_SYSTEM_USER_ID,
  postgresBiometricService,
} from "./postgresBiometric.service.js";
import type { PostgresBiometricTransaction } from "./biometric.types.js";

export const ingestPostgresBiometricTransactions = async (request: Request, response: Response) => {
  const { outletId, trans } = request.body as { outletId: string; trans: PostgresBiometricTransaction[] };
  const bootstrapContext = {
    userId: BIOMETRIC_INGEST_SYSTEM_USER_ID,
    tenantId: BIOMETRIC_INGEST_BOOTSTRAP_TENANT_ID,
    isSuperAdmin: true,
  };

  const tenantId = await withDatabaseContext(bootstrapContext, (database) =>
    postgresBiometricService.resolveTenantId(database, outletId),
  );
  if (!tenantId) {
    throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
  }

  const transStatus = await withDatabaseContext(
    { userId: BIOMETRIC_INGEST_SYSTEM_USER_ID, tenantId, isSuperAdmin: true },
    (database) => postgresBiometricService.processTransactions(database, tenantId, outletId, trans),
  );

  response.status(200).json({ transStatus });
};
