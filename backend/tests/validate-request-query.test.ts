import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { validateRequest } from "../src/middleware/validateRequest.js";

const noop = () => undefined;

const dateBoundary = (endOfDay: boolean) =>
  z.union([z.string(), z.number()]).transform((value, context) => {
    const rawValue = String(value).trim();
    const milliseconds = /^\d+$/.test(rawValue)
      ? Number(rawValue)
      : /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
        ? Date.parse(`${rawValue}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
        : Number.NaN;

    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Date must be a YYYY-MM-DD value or millisecond timestamp",
      });
      return z.NEVER;
    }

    return milliseconds;
  });

test("validateRequest writes validated query data back onto request.query", () => {
  const request = {
    query: { outletId: "abc", startDate: "2025-01-01", endDate: "2025-01-31" },
    validated: {},
  } as unknown as Request;

  const middleware = validateRequest({
    query: z.object({
      outletId: z.string().min(1),
      startDate: dateBoundary(false),
      endDate: dateBoundary(true),
    }),
  });

  middleware(request, {} as Response, noop as NextFunction);

  assert.equal(request.query.outletId, "abc");
  assert.equal(request.query.startDate, Date.parse("2025-01-01T00:00:00.000Z"));
  assert.equal(request.query.endDate, Date.parse("2025-01-31T23:59:59.999Z"));
});

test("validateRequest rejects invalid date values in query strings", () => {
  const request = {
    query: { outletId: "abc", startDate: "0NaN-NaN-NaNTNaN:NaN:NaN.NaN+NaN:NaN" },
    validated: {},
  } as unknown as Request;

  const middleware = validateRequest({
    query: z.object({
      outletId: z.string().min(1),
      startDate: dateBoundary(false),
    }),
  });

  let error: unknown = null;
  middleware(request, {} as Response, (err?: unknown) => {
    error = err;
  });

  assert.ok(error);
  assert.equal(request.query.startDate, "0NaN-NaN-NaNTNaN:NaN:NaN.NaN+NaN:NaN");
});
