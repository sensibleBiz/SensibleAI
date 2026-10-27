type TimestampRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is TimestampRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toEventDateString = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  if (isRecord(value)) {
    const seconds = Number(value._seconds ?? value.seconds);
    const nanoseconds = Number(value._nanoseconds ?? value.nanoseconds ?? 0);

    if (Number.isFinite(seconds)) {
      const date = new Date(
        seconds * 1000 + Math.floor(nanoseconds / 1_000_000)
      );
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
  }

  return "";
};

const dateFromGeneratedId = (value: unknown): string => {
  if (typeof value !== "string") return "";

  const timestampMatch = value.match(/\d{13}/);
  if (!timestampMatch) return "";

  const timestamp = Number(timestampMatch[0]);
  const date = new Date(timestamp);
  const earliestSupportedDate = Date.UTC(2000, 0, 1);
  const latestSupportedDate = Date.now() + 366 * 24 * 60 * 60 * 1000;

  if (
    !Number.isFinite(timestamp) ||
    timestamp < earliestSupportedDate ||
    timestamp > latestSupportedDate ||
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  return date.toISOString();
};

/**
 * Returns a persisted registration timestamp without ever falling back to now.
 * Generated transaction/member IDs are supported for registrations saved before
 * registrationDate was included in the event member payload.
 */
export const getEventRegistrationDate = (
  participant: TimestampRecord
): string => {
  const storedDateCandidates = [
    participant.registrationDate,
    participant.registrationTime,
    participant.registrationTimestamp,
    participant.registeredDate,
    participant.registeredAt,
    participant.registeredOn,
    participant.registration_date,
    participant.registered_at,
    participant.createdAt,
    participant.createdDate,
    participant.created_at,
  ];

  for (const candidate of storedDateCandidates) {
    const date = toEventDateString(candidate);
    if (date) return date;
  }

  const generatedIdCandidates = [
    participant.transactionId,
    participant.merchantOrderId,
    participant.id,
  ];

  for (const candidate of generatedIdCandidates) {
    const date = dateFromGeneratedId(candidate);
    if (date) return date;
  }

  // Paid legacy registrations may only have the payment completion timestamp.
  return toEventDateString(participant.paymentDate);
};
