import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { validateRequest } from "../src/middleware/validateRequest.js";
import { leadListQuerySchema } from "../src/validators/lead.validator.js";

test("validated query transforms are retained outside the Express query getter", () => {
  const request = {
    query: { outletId: "outlet-1", limit: "1" },
  } as unknown as Request;
  let nextError: unknown;
  const next: NextFunction = (error?: unknown) => {
    nextError = error;
  };

  validateRequest({ query: leadListQuerySchema })(
    request,
    {} as Response,
    next,
  );

  assert.equal(nextError, undefined);
  assert.equal(
    (request.validated?.query as { limit: number }).limit,
    1,
  );
});
