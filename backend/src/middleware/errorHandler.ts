import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { AppError } from "../errors/appError.js";

export const notFoundHandler: RequestHandler = (_request, response) => {
  response.status(404).json({
    success: false,
    message: "API route not found",
    code: "ROUTE_NOT_FOUND",
  });
};

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  void _next;

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
    });
    return;
  }

  if (
    error instanceof SyntaxError &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    response.status(400).json({
      success: false,
      message: "Request body contains invalid JSON",
      code: "INVALID_JSON",
    });
    return;
  }

  const requestId = (request as Request & { requestId?: string }).requestId;
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({
    severity: "ERROR",
    event: "UNHANDLED_API_ERROR",
    requestId,
    message: errorMessage,
    stack: process.env["NODE_ENV"] !== "production" && error instanceof Error ? error.stack : undefined,
  }));
  response.status(500).json({
    success: false,
    message: "An unexpected server error occurred",
    code: "INTERNAL_SERVER_ERROR",
    detail: errorMessage,
    stack: process.env["NODE_ENV"] !== "production" && error instanceof Error ? error.stack : undefined,
  });
};

