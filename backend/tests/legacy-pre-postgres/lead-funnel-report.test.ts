import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { leadRepository } from "../src/repositories/lead.repository.js";
import {
  aggregateFunnelReport,
  clearLeadReportCaches,
  leadService,
} from "../src/services/lead.service.js";
import { resolveFunnelSourceKey } from "../src/utils/funnelSource.js";
import {
  LEAD_REPORT_MAX_RANGE_MS,
  leadFunnelReportQuerySchema,
  leadListQuerySchema,
  leadLookupQuerySchema,
} from "../src/validators/lead.validator.js";

const originalStreamFunnelStages = leadRepository.streamFunnelStages;
const originalCountFunnelStages = leadRepository.countFunnelStages;
const originalListByMobiles = leadRepository.listByMobiles;
const originalListBatch = leadRepository.listBatch;

afterEach(() => {
  leadRepository.streamFunnelStages = originalStreamFunnelStages;
  leadRepository.countFunnelStages = originalCountFunnelStages;
  leadRepository.listByMobiles = originalListByMobiles;
  leadRepository.listBatch = originalListBatch;
  clearLeadReportCaches();
});

test("funnel report validation accepts assignedTo and rejects reversed dates", () => {
  const parsed = leadFunnelReportQuerySchema.parse({
    outletId: "outlet-1",
    startDate: "2026-08-01",
    endDate: "2026-08-18",
    assignedTo: "employee-1",
  });

  assert.equal(parsed.assignedTo, "employee-1");
  assert.equal(
    leadFunnelReportQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: "2026-08-19",
      endDate: "2026-08-18",
    }).success,
    false,
  );
  assert.equal(
    leadFunnelReportQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: 100,
      endDate: 100 + LEAD_REPORT_MAX_RANGE_MS + 1,
    }).success,
    false,
  );
});

test("lead list validation accepts funnel sourceKey values", () => {
  const parsed = leadListQuerySchema.parse({
    outletId: "outlet-1",
    sourceKey: "justdial",
  });

  assert.equal(parsed.sourceKey, "justdial");
  assert.equal(
    leadListQuerySchema.safeParse({
      outletId: "outlet-1",
      sourceKey: "unknown-source",
    }).success,
    false,
  );
});

test("lead lookup validation splits mobiles and caps the batch size", () => {
  const parsed = leadLookupQuerySchema.parse({
    outletId: "outlet-1",
    mobiles: "9876543210, 9123456789",
  });

  assert.deepEqual(parsed.mobiles, ["9876543210", "9123456789"]);
  assert.equal(
    leadLookupQuerySchema.safeParse({
      outletId: "outlet-1",
      mobiles: Array.from({ length: 31 }, (_, index) => String(index).padStart(10, "0")),
    }).success,
    false,
  );
});

test("funnel source matching keeps existing stored values", () => {
  assert.equal(resolveFunnelSourceKey("JustDail"), "justdial");
  assert.equal(resolveFunnelSourceKey("Google Ads"), "google");
  assert.equal(resolveFunnelSourceKey("Self Generated"), "self-generated");
  assert.equal(resolveFunnelSourceKey("WalkIn"), "walk-in");
  assert.equal(resolveFunnelSourceKey(""), "other");
});

test("funnel report aggregates counts and source buckets server-side", () => {
  const result = aggregateFunnelReport([
    { assignedTo: "", source: "Website", stage: "NEW" },
    { assignedTo: "emp-1", source: "Indiamart", stage: "ASSIGNED" },
    { assignedTo: "emp-1", source: "JustDial", stage: "FOLLOWUP" },
    { assignedTo: "", source: "Facebook", stage: "WON" },
    { assignedTo: "emp-2", source: "Reference", stage: "LOST" },
    { assignedTo: "emp-2", source: "Unknown Portal", stage: "DISQUALIFIED" },
  ]);

  assert.deepEqual(result.counts, {
    totalLeads: 6,
    newLeads: 1,
    assigned: 1,
    followUp: 1,
    closedWon: 1,
    lost: 1,
    disqualified: 1,
  });
  assert.equal(result.sources.find((source) => source.key === "indiamart")?.active, 1);
  assert.equal(result.sources.find((source) => source.key === "justdial")?.active, 1);
  assert.equal(result.sources.find((source) => source.key === "facebook")?.won, 1);
  assert.equal(result.sources.find((source) => source.key === "reference")?.lost, 1);
  assert.equal(result.sources.find((source) => source.key === "other")?.total, 1);
  assert.equal(result.sources.find((source) => source.key === "other")?.active, 0);
  assert.equal(
    result.sources.find((source) => source.key === "other")?.disqualified,
    1,
  );
});

test("funnel report keeps New and Assigned stages mutually exclusive", async () => {
  let calls = 0;
  leadRepository.streamFunnelStages = async function* (query) {
    calls += 1;
    yield { assignedTo: "employee-1", source: "Website", stage: "NEW" };
    assert.equal(query.assignedTo, "employee-1");
    yield { assignedTo: "employee-1", source: "Website", stage: "ASSIGNED" };
  };

  const result = await leadService.getFunnelReport({
    outletId: "outlet-1",
    startDate: 1,
    endDate: 2,
    assignedTo: "employee-1",
  });

  assert.equal(calls, 1);
  assert.equal(result.counts.totalLeads, 2);
  assert.equal(result.counts.newLeads, 1);
  assert.equal(result.counts.assigned, 1);
});

test("stage count service performs count-only repository query with assignedTo", async () => {
  let calls = 0;
  leadRepository.countFunnelStages = async (query) => {
    calls += 1;
    assert.equal(query.assignedTo, "employee-1");
    return {
      totalLeads: 10,
      newLeads: 4,
      assigned: 2,
      followUp: 1,
      closedWon: 2,
      lost: 1,
      disqualified: 0,
    };
  };

  const result = await leadService.getStageCounts({
    outletId: "outlet-1",
    startDate: 1,
    endDate: 2,
    assignedTo: "employee-1",
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, {
    totalLeads: 10,
    newLeads: 4,
    assigned: 2,
    followUp: 1,
    closedWon: 2,
    lost: 1,
    disqualified: 0,
  });
});

test("lead list sourceKey uses a bounded Firestore-filtered page", async () => {
  const requestedLimits: number[] = [];
  const capturedSourceKeys: Array<string | undefined> = [];
  leadRepository.listBatch = async (filters, _cursor, limit) => {
    requestedLimits.push(limit);
    capturedSourceKeys.push(filters.sourceKey);
    return [
    {
      id: "lead-1",
      cursor: { id: "lead-1", createdDate: 2 },
      data: { createdDate: 2, username: "Ada", mobile: "1", source: "JustDail" },
    },
  ];
  };

  const result = await leadService.list({
    outletId: "outlet-1",
    sourceKey: "justdial",
    limit: 10,
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.id, "lead-1");
  assert.deepEqual(requestedLimits, [11]);
  assert.deepEqual(capturedSourceKeys, ["justdial"]);
});
