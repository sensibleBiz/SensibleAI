import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { leadRepository } from "../src/repositories/lead.repository.js";
import {
  clearLeadReportCaches,
  leadService,
} from "../src/services/lead.service.js";

const originalStreamAnalytics = leadRepository.streamAnalytics;

afterEach(() => {
  leadRepository.streamAnalytics = originalStreamAnalytics;
  clearLeadReportCaches();
});

test("lead analytics aggregates stages, sources, days, and employees in one stream", async () => {
  let repositoryCalls = 0;
  leadRepository.streamAnalytics = async function* () {
    repositoryCalls += 1;
    yield {
      assignedTo: "employee-1",
      createdDate: Date.parse("2026-08-01T04:30:00.000Z"),
      source: "JustDial Leads In CRM",
      stage: "ASSIGNED",
    };
    yield {
      assignedTo: "employee-1",
      createdDate: Date.parse("2026-08-02T04:30:00.000Z"),
      source: "Google Ads",
      stage: "WON",
    };
    yield {
      assignedTo: "employee-2",
      createdDate: Date.parse("2026-08-02T05:30:00.000Z"),
      source: "Website",
      stage: "LOST",
    };
  };
  const query = {
    outletId: "outlet-analytics",
    startDate: Date.parse("2026-07-31T18:30:00.000Z"),
    endDate: Date.parse("2026-08-02T18:29:59.999Z"),
  };

  const analytics = await leadService.getAnalytics(query);
  const employeeReport = await leadService.getEmployeeReport(query);

  assert.equal(repositoryCalls, 1);
  assert.equal(analytics.counts.totalLeads, 3);
  assert.equal(analytics.counts.assigned, 1);
  assert.equal(analytics.counts.closedWon, 1);
  assert.equal(analytics.counts.lost, 1);
  assert.equal(
    analytics.sources.find((item) => item.source === "JustDail")?.count,
    1,
  );
  assert.deepEqual(
    analytics.trend.map((item) => item.leads),
    [1, 2],
  );
  assert.deepEqual(employeeReport.employees["employee-1"], {
    total: 2,
    assigned: 1,
    followup: 0,
    completed: 1,
    lost: 0,
  });
});
