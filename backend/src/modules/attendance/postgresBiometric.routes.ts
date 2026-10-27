import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest.js";
import { requireBiometricIngestAuth } from "./biometricIngest.middleware.js";
import { ingestPostgresBiometricTransactions } from "./postgresBiometric.controller.js";
import { postgresBiometricTransactionsSchema } from "./postgresBiometric.validator.js";

export const postgresBiometricRouter = Router();

postgresBiometricRouter.post(
  "/transactions",
  requireBiometricIngestAuth,
  validateRequest({ body: postgresBiometricTransactionsSchema }),
  ingestPostgresBiometricTransactions,
);
