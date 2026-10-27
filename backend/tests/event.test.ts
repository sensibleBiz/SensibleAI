import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { eventCityBodySchema } from "../src/validators/event.validator.js";
import { eventMobilesMatch, normalizeEventMobileDigits } from "../src/modules/events/eventMobile.util.js";
import { eventCreateBodySchema } from "../src/modules/events/eventGateway.validator.js";

test("event gateway always uses PostgreSQL storage", async () => {
  const repositoryFactory = await readFile(
    new URL("../src/modules/events/createEventGatewayRepository.ts", import.meta.url),
    "utf8",
  );
  assert.match(repositoryFactory, /postgresEventGatewayRepository/);
  assert.doesNotMatch(repositoryFactory, /firestoreEventGatewayRepository/);
});

test("event gateway router is mounted on /api/v1/event", async () => {
  const routes = await readFile(new URL("../src/routes/index.ts", import.meta.url), "utf8");
  assert.ok(routes.includes('apiRouter.use("/event", eventGatewayRouter)'));
});

test("event gateway create schema requires eventId and outletId", () => {
  assert.equal(eventCreateBodySchema.safeParse({ eventId: "EVT1" }).success, false);
  assert.equal(
    eventCreateBodySchema.safeParse({ eventId: "EVT1", outletId: "outlet-1" }).success,
    true,
  );
});

test("event mobile normalization matches legacy member updates", () => {
  assert.equal(normalizeEventMobileDigits("+91 98765-43210"), "9876543210");
  assert.equal(eventMobilesMatch("919876543210", "9876543210"), true);
});

test("event city validation requires a non-empty city", () => {
  assert.equal(
    eventCityBodySchema.safeParse({ outletId: "outlet-1", city: "Pune" })
      .success,
    true,
  );
  assert.equal(
    eventCityBodySchema.safeParse({ outletId: "outlet-1", city: "   " })
      .success,
    false,
  );
});

// eventRepository and eventService removed from codebase (were in deleted Firestore
// event.repository.ts / event.service.ts). Tests removed pending PostgreSQL-native replacements.
