import { AppError } from "../errors/appError.js";
import type { CallCursor } from "../types/call.types.js";
import { env } from "../config/env.js";

// Public APIs allow 100 items; one extra document is used for hasMore.
export const CALL_PAGE_LIMIT_MAX = 101;
export const CALL_REPORT_MAX_DOCS = 5_000;
export const FIRESTORE_IN_FILTER_MAX = 30;

export const isValidCallCursor = (
  cursor: CallCursor | undefined,
): cursor is CallCursor =>
  Boolean(
    cursor &&
      typeof cursor.id === "string" &&
      cursor.id.length > 0 &&
      cursor.id.length <= 1_500 &&
      typeof cursor.timestamp === "number" &&
      Number.isSafeInteger(cursor.timestamp),
  );

export const readCallTimestamp = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value)
    ? value
    : undefined;

export const boundCallPageLimit = (limit: number) => {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new AppError(400, "Invalid page limit", "INVALID_LIMIT");
  }

  return Math.min(Math.trunc(limit), CALL_PAGE_LIMIT_MAX);
};

export const uniqueCallNumbers = (numbers: string[]) => {
  const unique = [
    ...new Set(
      numbers
        .map((number) => number.trim())
        .filter((number) => number.length > 0),
    ),
  ];

  if (unique.length > FIRESTORE_IN_FILTER_MAX) {
    throw new AppError(
      400,
      "Too many call numbers for a single lookup",
      "CALL_NUMBER_FILTER_TOO_LARGE",
    );
  }

  return unique;
};

export const logCallQuery = (
  name: string,
  outletId: string,
  count: number,
  startedAt: number,
) => {
  if (env.nodeEnv === "production") return;
  console.info(
    `[CALL_QUERY] ${name} returned ${count} docs in ${Date.now() - startedAt}ms`,
    { outletId },
  );
};

export const logCallQueryFailure = (
  name: string,
  outletId: string,
  error: unknown,
) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[CALL_QUERY] ${name} failed`, { outletId, message });
};
