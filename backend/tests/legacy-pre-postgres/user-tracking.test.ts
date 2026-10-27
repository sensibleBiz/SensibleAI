import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { userTrackingRepository } from "../src/repositories/userTracking.repository.js";
import {
  decodeTrackingCursor,
  getIndiaDayRange,
  mapTrackingPoint,
  userTrackingService,
} from "../src/services/userTracking.service.js";
import type { UserTrackingDocument } from "../src/types/userTracking.types.js";
import { userTrackingQuerySchema } from "../src/validators/userTracking.validator.js";

const originalListHistory = userTrackingRepository.listHistory;

afterEach(() => {
  userTrackingRepository.listHistory = originalListHistory;
});

const trackingDocument = (
  id: string,
  timestamp: number,
  latitude = 18.52,
  longitude = 73.85,
): UserTrackingDocument => ({
  id,
  cursor: { id, timestamp },
  data: {
    userID: "user-1",
    currentlocation: { latitude, longitude },
    address: "Pune",
    name: "Field Executive",
    timestamp,
    rawDevicePayload: { secret: true },
  },
});

test("tracking validation bounds pages and rejects impossible dates", () => {
  const valid = userTrackingQuerySchema.parse({
    outletId: "outlet-1",
    userId: "user-1",
    date: "2026-09-09",
  });
  assert.equal(valid.limit, 250);
  assert.equal(
    userTrackingQuerySchema.safeParse({
      outletId: "outlet-1",
      userId: "user-1",
      date: "2026-09-31",
    }).success,
    false,
  );
  assert.equal(
    userTrackingQuerySchema.safeParse({ ...valid, limit: 501 }).success,
    false,
  );
});

test("tracking day boundaries use Asia/Kolkata and an exclusive next day", () => {
  const range = getIndiaDayRange("2026-09-09");
  assert.equal(range.startDate, Date.parse("2026-09-09T00:00:00.000+05:30"));
  assert.equal(
    range.endDateExclusive,
    Date.parse("2026-09-10T00:00:00.000+05:30"),
  );
});

test("tracking projection exposes normalized map fields only", () => {
  assert.deepEqual(mapTrackingPoint(trackingDocument("point-1", 1000)), {
    id: "point-1",
    userId: "user-1",
    latitude: 18.52,
    longitude: 73.85,
    address: "Pune",
    name: "Field Executive",
    timestamp: 1000,
  });
  assert.equal(mapTrackingPoint(trackingDocument("bad", 1000, 100, 73.85)), undefined);
});

test("tracking history returns a stable cursor and coalesces duplicate requests", async () => {
  let repositoryCalls = 0;
  userTrackingRepository.listHistory = async () => {
    repositoryCalls += 1;
    return [
      trackingDocument("point-3", 3000),
      trackingDocument("point-2", 2000),
      trackingDocument("point-1", 1000),
    ];
  };
  const query = {
    outletId: "outlet-cache-test",
    userId: "user-cache-test",
    date: "2026-09-09",
    limit: 2,
  };
  const [first, second] = await Promise.all([
    userTrackingService.listHistory(query),
    userTrackingService.listHistory(query),
  ]);

  assert.equal(repositoryCalls, 1);
  assert.deepEqual(first.items.map((item) => item.id), ["point-3", "point-2"]);
  assert.equal(first.nextCursor, second.nextCursor);
  assert.deepEqual(decodeTrackingCursor(first.nextCursor ?? undefined), {
    id: "point-2",
    timestamp: 2000,
  });
});
