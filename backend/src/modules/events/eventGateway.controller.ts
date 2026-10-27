import type { RequestHandler } from "express";
import { eventGatewayService } from "./eventGateway.service.js";

export const createGatewayEvent: RequestHandler = async (request, response) => {
  try {
    const result = await eventGatewayService.createEvent(request.validated?.body as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    console.error("event create failed:", error);
    response.status(500).json({
      status: 0,
      message: error instanceof Error ? error.message : "Internal Server Error",
    });
  }
};

export const getGatewayEvents: RequestHandler = async (request, response) => {
  const result = await eventGatewayService.getEvents(request.validated?.query as {
    outletId: string;
    eventId?: string;
    isActive?: string;
    fromDate?: string;
    toDate?: string;
  });
  response.status(200).send(result);
};

export const getGatewayEventTransactions: RequestHandler = async (request, response) => {
  const result = await eventGatewayService.getEventTransactions(request.validated?.query as {
    outletId: string;
    eventId?: string;
  });
  response.status(200).send(result);
};

export const payAndRegisterGatewayEvent: RequestHandler = async (request, response) => {
  try {
    const result = await eventGatewayService.payAndRegister(request.validated?.body as Record<string, unknown>);
    response.status(200).json(result);
  } catch (error) {
    console.error("payAndRegister failed:", error);
    response.status(500).json({
      status: 0,
      message: error instanceof Error ? error.message : "Failed to initiate payment",
    });
  }
};

export const checkGatewayEventPaymentStatus: RequestHandler = async (request, response) => {
  try {
    const result = await eventGatewayService.checkPaymentStatus(request.validated?.body as Record<string, unknown>);
    response.status(200).send(result);
  } catch (error) {
    console.error("event payment status failed:", error);
    response.status(500).send("Something went wrong");
  }
};
