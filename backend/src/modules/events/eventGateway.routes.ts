import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  checkGatewayEventPaymentStatus,
  createGatewayEvent,
  getGatewayEventTransactions,
  getGatewayEvents,
  payAndRegisterGatewayEvent,
} from "./eventGateway.controller.js";
import {
  eventCreateBodySchema,
  eventGetQuerySchema,
  eventPayAndRegisterBodySchema,
  eventPaymentStatusBodySchema,
  eventTransactionsGetQuerySchema,
} from "./eventGateway.validator.js";
import { requireEventGatewayKey } from "./eventGateway.middleware.js";

export const eventGatewayRouter = Router();

eventGatewayRouter.use(requireEventGatewayKey);

eventGatewayRouter.post("/create", validateRequest({ body: eventCreateBodySchema }), createGatewayEvent);
eventGatewayRouter.get("/get", validateRequest({ query: eventGetQuerySchema }), getGatewayEvents);
eventGatewayRouter.get(
  "/transactions/get",
  validateRequest({ query: eventTransactionsGetQuerySchema }),
  getGatewayEventTransactions,
);
eventGatewayRouter.post(
  "/payAndRegister",
  validateRequest({ body: eventPayAndRegisterBodySchema }),
  payAndRegisterGatewayEvent,
);
eventGatewayRouter.post(
  "/status",
  validateRequest({ body: eventPaymentStatusBodySchema }),
  checkGatewayEventPaymentStatus,
);
eventGatewayRouter.post(
  "/statusOld",
  validateRequest({ body: eventPaymentStatusBodySchema }),
  checkGatewayEventPaymentStatus,
);

