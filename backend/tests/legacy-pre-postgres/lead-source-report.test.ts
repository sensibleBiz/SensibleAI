import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { leadRepository } from "../src/repositories/lead.repository.js";
import {
  aggregateSourceReport,
  clearLeadReportCaches,
  leadService,
} from "../src/services/lead.service.js";
import {
  LEAD_REPORT_MAX_RANGE_MS,
  leadSourceReportQuerySchema,
} from "../src/validators/lead.validator.js";

const originalStreamSourceStages = leadRepository.streamSourceStages;

afterEach(() => {
  leadRepository.streamSourceStages = originalStreamSourceStages;
  clearLeadReportCaches();
});

test("source report validation parses date ranges and rejects reversed dates", () => {
  const parsed = leadSourceReportQuerySchema.parse({
    outletId: "outlet-1",
    startDate: "2026-08-01",
    endDate: "2026-08-18",
  });

  assert.equal(parsed.startDate, Date.parse("2026-08-01T00:00:00.000Z"));
  assert.equal(parsed.endDate, Date.parse("2026-08-18T23:59:59.999Z"));
  assert.equal(
    leadSourceReportQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: "2026-08-19",
      endDate: "2026-08-18",
    }).success,
    false,
  );
  assert.equal(
    leadSourceReportQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: 100,
      endDate: 100 + LEAD_REPORT_MAX_RANGE_MS + 1,
    }).success,
    false,
  );
});

test("source report aggregates stages and normalizes existing source values", () => {
  const result = aggregateSourceReport([
    { source: "Google Ads", stage: "NEW" },
    { source: "Google", stage: "WON" },
    { source: "Facebook", stage: "ASSIGNED" },
    { source: "JustDial", stage: "FOLLOWUP" },
    { source: "Reference", stage: "LOST" },
    { source: "Indiamart", stage: "DISQUALIFIED" },
  ]);

  assert.deepEqual(result.sources.Google, {
    total: 2,
    new: 1,
    follow: 0,
    completed: 1,
    lost: 0,
  });
  assert.equal(result.sources.Facebook.follow, 1);
  assert.equal(result.sources.JustDail.follow, 1);
  assert.equal(result.sources.Other.lost, 1);
  assert.equal(result.sources.Indiamart.total, 1);
});

test("source report service performs one repository query", async () => {
  let calls = 0;
  leadRepository.streamSourceStages = async function* () {
    calls += 1;
    yield { source: "Website", stage: "NEW" };
  };

  const result = await leadService.getSourceReport({
    outletId: "outlet-1",
    startDate: 1,
    endDate: 2,
  });

  assert.equal(calls, 1);
  assert.equal(result.sources.Website.total, 1);
  assert.equal(result.sources.Website.new, 1);
});

test("source report cache deduplicates identical requests", async () => {
  let calls = 0;
  leadRepository.streamSourceStages = async function* () {
    calls += 1;
    yield { source: "Website", stage: "NEW" };
  };
  const query = {
    outletId: "outlet-source-cache",
    startDate: 1,
    endDate: 2,
  };

  await Promise.all([
    leadService.getSourceReport(query),
    leadService.getSourceReport(query),
  ]);
  await leadService.getSourceReport(query);

  assert.equal(calls, 1);
});
