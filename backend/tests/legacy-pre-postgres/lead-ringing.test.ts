import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { leadRepository } from "../src/repositories/lead.repository.js";
import {
  buildLeadRingingData,
  leadService,
} from "../src/services/lead.service.js";
import type {
  LeadDocument,
  LeadRingingData,
  LeadRingingListQuery,
} from "../src/types/lead.types.js";
import {
  leadRingingBodySchema,
  leadRingingListQuerySchema,
} from "../src/validators/lead.validator.js";

const originalListRinging = leadRepository.listRinging;
const originalSetRinging = leadRepository.setRinging;

afterEach(() => {
  leadRepository.listRinging = originalListRinging;
  leadRepository.setRinging = originalSetRinging;
});

const makeLead = (id: string, createdDate: number): LeadDocument => ({
  id,
  cursor: { id, createdDate },
  data: {
    createdDate,
    mobile: "9999999999",
    reqBody: { accessToken: "must-not-be-returned" },
    stage: "NEW",
    status: "RINGING",
    username: `Lead ${id}`,
  },
});

const ringingQuery = (
  overrides: Partial<LeadRingingListQuery> = {},
): LeadRingingListQuery => ({
  outletId: "outlet-1",
  startDate: 100,
  endDate: 500,
  limit: 2,
  ...overrides,
});

test("ringing validators require a bounded date range and boolean toggle", () => {
  assert.deepEqual(
    leadRingingListQuerySchema.parse({
      outletId: "outlet-1",
      startDate: "100",
      endDate: "500",
    }),
    { outletId: "outlet-1", startDate: 100, endDate: 500, limit: 50 },
  );
  assert.equal(
    leadRingingListQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: 500,
      endDate: 100,
    }).success,
    false,
  );
  assert.equal(
    leadRingingBodySchema.safeParse({
      outletId: "outlet-1",
      ringing: "true",
    }).success,
    false,
  );
});

test("ringing list uses one bounded repository page and omits raw payloads", async () => {
  let requestedLimit = 0;
  leadRepository.listRinging = async (_filters, _cursor, limit) => {
    requestedLimit = limit;
    return [makeLead("lead-3", 300), makeLead("lead-2", 200), makeLead("lead-1", 100)];
  };

  const result = await leadService.listRinging(ringingQuery());

  assert.equal(requestedLimit, 3);
  assert.deepEqual(result.items.map((lead) => lead.id), ["lead-3", "lead-2"]);
  assert.ok(result.nextCursor);
  assert.equal("reqBody" in result.items[0]!, false);
});

test("concurrent identical ringing lists share one Firestore request", async () => {
  let reads = 0;
  leadRepository.listRinging = async () => {
    reads += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return [makeLead("lead-1", 100)];
  };

  const [first, second] = await Promise.all([
    leadService.listRinging(ringingQuery()),
    leadService.listRinging(ringingQuery()),
  ]);

  assert.equal(reads, 1);
  assert.deepEqual(first, second);
});

test("ringing toggle performs exactly one write and uses a server timestamp", async () => {
  let writes = 0;
  let writtenData: LeadRingingData | undefined;
  leadRepository.setRinging = async (_outletId, _leadId, data) => {
    writes += 1;
    writtenData = data;
    return true;
  };

  const result = await leadService.setRinging(
    { outletId: "outlet-1", ringing: true },
    "lead-1",
  );

  assert.equal(writes, 1);
  assert.equal(writtenData?.status, "RINGING");
  assert.equal(result.status, "RINGING");
  assert.ok(result.updatedDate > 0);
  assert.deepEqual(buildLeadRingingData(false, 500), {
    status: "",
    updatedDate: 500,
  });
});

test("concurrent identical ringing toggles share one Firestore write", async () => {
  let writes = 0;
  leadRepository.setRinging = async () => {
    writes += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return true;
  };

  const [first, second] = await Promise.all([
    leadService.setRinging(
      { outletId: "outlet-dedupe", ringing: true },
      "lead-1",
    ),
    leadService.setRinging(
      { outletId: "outlet-dedupe", ringing: true },
      "lead-1",
    ),
  ]);

  assert.equal(writes, 1);
  assert.deepEqual(first, second);
});

test("ringing toggle returns not found when the document does not exist", async () => {
  leadRepository.setRinging = async () => false;

  await assert.rejects(
    leadService.setRinging(
      { outletId: "outlet-1", ringing: false },
      "missing-lead",
    ),
    { message: "Lead not found" },
  );
});
