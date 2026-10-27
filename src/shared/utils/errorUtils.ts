export function getErrorMessage(error: unknown, fallback = "Unknown error") {
  return error instanceof Error ? error.message : fallback;
}
