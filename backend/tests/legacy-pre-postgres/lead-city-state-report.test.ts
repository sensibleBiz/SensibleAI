import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { leadRepository } from "../src/repositories/lead.repository.js";
import {
  aggregateCityStateReport,
  clearLeadReportCaches,
  leadService,
} from "../src/services/lead.service.js";
import { leadCityStateReportQuerySchema } from "../src/validators/lead.validator.js";

const originalStreamCityStateStages = leadRepository.streamCityStateStages;

afterEach(() => {
  leadRepository.streamCityStateStages = originalStreamCityStateStages;
  clearLeadReportCaches();
});

test("city/state report validates its date range", () => {
  const parsed = leadCityStateReportQuerySchema.parse({
    outletId: "outlet-1",
    startDate: 1,
    endDate: 2,
  });

  assert.equal(parsed.startDate, 1);
  assert.equal(parsed.endDate, 2);
  assert.equal(
    leadCityStateReportQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: 2,
      endDate: 1,
    }).success,
    false,
  );
});

test("city/state report normalizes locations and aggregates every stage", () => {
  const result = aggregateCityStateReport([
    { state: " Karnataka ", city: "Bengaluru", stage: "NEW" },
    { state: "karnataka", city: " bengaluru ", stage: "ASSIGNED" },
    { state: "Karnataka", city: "Bengaluru", stage: "" },
    { state: "Karnataka", city: "Mysuru", stage: "FOLLOWUP" },
    { state: "", city: "", stage: "WON" },
    { state: "", city: "", stage: "LOST" },
    { state: "", city: "", stage: "DISQUALIFIED" },
  ]);

  assert.deepEqual(result.rows[0], {
    state: "KARNATAKA",
    city: "BENGALURU",
    assigned: 1,
    new: 2,
    followup: 0,
    completed: 0,
    lost: 0,
    disqual: 0,
    total: 3,
  });
  assert.equal(result.rows.find((row) => row.city === "MYSURU")?.followup, 1);
  assert.deepEqual(result.rows.find((row) => row.state === "UNKNOWN STATE"), {
    state: "UNKNOWN STATE",
    city: "UNKNOWN CITY",
    assigned: 0,
    new: 0,
    followup: 0,
    completed: 1,
    lost: 1,
    disqual: 1,
    total: 3,
  });
});

test("city/state report service performs one repository query", async () => {
  let calls = 0;
  leadRepository.streamCityStateStages = async function* () {
    calls += 1;
    yield { state: "Goa", city: "Panaji", stage: "NEW" };
  };

  const result = await leadService.getCityStateReport({
    outletId: "outlet-1",
    startDate: 1,
    endDate: 2,
  });

  assert.equal(calls, 1);
  assert.equal(result.rows[0]?.state, "GOA");
  assert.equal(result.rows[0]?.total, 1);
});
