import { Router, type Request, type Response, type NextFunction } from "express";
import { MAX_INTEGRATION_KEY_LENGTH, MAX_TRANSACTIONS_PER_REQUEST } from "./constants.js";
import { processTransaction } from "./transactionService.js";
import { getIntegrationKey, isJsonParseError } from "./validation.js";

export const minopBiometricRouter = Router();

minopBiometricRouter.post("/hello", (_request, response) => {
  response.status(200).json({ status: 1 });
});

minopBiometricRouter.post("/transactions", async (request, response) => {
  const transactions = Array.isArray(request.body?.trans) ? request.body.trans as Record<string, unknown>[] : [];
  if (!Array.isArray(request.body?.trans)) {
    response.status(200).json({ transStatus: [] });
    return;
  }
  if (transactions.length > MAX_TRANSACTIONS_PER_REQUEST) {
    response.status(200).json({
      transStatus: transactions.map((transaction) => ({
        txnId: transaction?.txnId,
        status: 0,
      })),
    });
    return;
  }

  const integrationKey = getIntegrationKey(request.body as Record<string, unknown>);
  if (integrationKey.length > MAX_INTEGRATION_KEY_LENGTH) {
    response.status(200).json({
      transStatus: transactions.map((transaction) => ({
        txnId: transaction?.txnId,
        status: 0,
      })),
    });
    return;
  }

  const requestContext = {
    integrationKey,
  };

  const transStatus = [];
  for (const transaction of transactions) {
    const txnId = transaction?.txnId;
    try {
      const status = await processTransaction(transaction, requestContext);
      transStatus.push({ txnId, status });
    } catch (error) {
      console.error("Failed biometric transaction", { txnId, error });
      transStatus.push({ txnId, status: 0 });
    }
  }
  response.status(200).json({ transStatus });
});

export const minopJsonParseErrorHandler = (
  error: unknown,
  request: Request,
  response: Response,
  next: NextFunction,
) => {
  if (!isJsonParseError(error)) {
    next(error);
    return;
  }
  if (request.path.endsWith("/hello")) {
    response.status(200).json({ status: 0 });
    return;
  }
  response.status(200).json({ transStatus: [] });
};
