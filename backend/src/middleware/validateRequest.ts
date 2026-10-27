import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../errors/appError.js";

type RequestPart = "body" | "params" | "query";
type RequestSchemas = Partial<Record<RequestPart, ZodType>>;

export const validateRequest = (schemas: RequestSchemas): RequestHandler =>
  (request: Request, _response: Response, next: NextFunction) => {
    for (const part of Object.keys(schemas) as RequestPart[]) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(request[part]);
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? "Invalid request";
        next(new AppError(400, message, "VALIDATION_ERROR"));
        return;
      }

      request.validated = {
        ...request.validated,
        [part]: result.data,
      };

      if (part === "query") {
        const nextQuery = { ...(request.query ?? {}), ...result.data };
        try {
          request.query = nextQuery;
        } catch {
          Object.defineProperty(request, "query", {
            value: nextQuery,
            configurable: true,
            enumerable: true,
            writable: true,
          });
        }
      } else {
        Object.assign(request[part], result.data);
      }
    }

    next();
  };
