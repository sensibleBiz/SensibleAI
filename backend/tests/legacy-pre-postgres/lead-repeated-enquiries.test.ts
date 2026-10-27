import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { leadRepository } from "../src/repositories/lead.repository.js";
import {
  aggregateRepeatedEnquiries,
  clearLeadReportCaches,
  leadService,
} from "../src/services/lead.service.js";
import type {
  LeadDocument,
  RepeatedEnquiryQuery,
} from "../src/types/lead.types.js";
import { repeatedEnquiryQuerySchema } from "../src/validators/lead.validator.js";

const originalStreamRepeatedEnquiries =
  leadRepository.streamRepeatedEnquiries;

afterEach(() => {
  leadRepository.streamRepeatedEnquiries = originalStreamRepeatedEnquiries;
  clearLeadReportCaches();
});

const query = (
  overrides: Partial<RepeatedEnquiryQuery> = {},
): RepeatedEnquiryQuery => ({
  outletId: "outlet-1",
  startDate: 1,
  endDate: 10_000,
  limit: 50,
  ...overrides,
});

const lead = (
  id: string,
  createdDate: number,
  data: Record<string, unknown>,
): LeadDocument => ({
  id,
  cursor: { id, createdDate },
  data: {
    assignedTo: "",
    businessName: "",
    createdDate,
    email: "",
    enquiryType: "NEW_LEAD",
    mobile: "",
    source: "Website",
    stage: "NEW",
    username: id,
    ...data,
  },
});

test("repeated enquiry validation bounds range and result size", () => {
  const parsed = repeatedEnquiryQuerySchema.parse({
    outletId: "outlet-1",
    startDate: "2026-08-01",
    endDate: "2026-08-20",
  });

  assert.equal(parsed.limit, 50);
  assert.equal(
    repeatedEnquiryQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: 1,
      endDate: 2,
      limit: 101,
    }).success,
    false,
  );
});

test("repeated enquiries group transitive normalized identities", () => {
  const result = aggregateRepeatedEnquiries(
    [
      lead("mobile-a", 700, {
        mobile: "+91 98765 43210",
        email: "first@example.com",
      }),
      lead("mobile-b", 600, {
        mobile: "9876543210",
        email: "second@example.com",
        assignedTo: "sales-1",
      }),
      lead("email-c", 500, {
        mobile: "9000000000",
        email: " SECOND@example.com ",
      }),
      lead("profile-a", 400, { customerId: "customer-22" }),
      lead("profile-b", 300, { customerId: "CUSTOMER-22" }),
      lead("business-a", 200, { businessName: "Sensible CRM Pvt. Ltd." }),
      lead("business-b", 100, { businessName: " sensible crm pvt ltd " }),
      lead("single", 50, { businessName: "Only once" }),
    ],
    query({ assignedTo: "sales-1" }),
  );

  assert.equal(result.totalGroups, 1);
  assert.equal(result.totalEnquiries, 3);
  assert.deepEqual(result.groups[0]?.matchedOn, ["MOBILE", "EMAIL"]);
  assert.deepEqual(
    result.groups[0]?.enquiries.map((item) => item.id),
    ["mobile-a", "mobile-b", "email-c"],
  );
});

test("repeated enquiries report all identity types and paginate groups", () => {
  const result = aggregateRepeatedEnquiries(
    [
      lead("mobile-a", 800, { mobile: "9876543210" }),
      lead("mobile-b", 700, { phone: "9876543210" }),
      lead("profile-a", 600, { customerId: "profile-1" }),
      lead("profile-b", 500, { customerId: "profile-1" }),
      lead("business-a", 400, { businessName: "Sensible  CRM" }),
      lead("business-b", 300, { businessName: "sensible-crm" }),
    ],
    query({ limit: 2 }),
  );

  assert.equal(result.totalGroups, 3);
  assert.equal(result.totalEnquiries, 6);
  assert.equal(result.groups.length, 2);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.groups[0]?.matchedOn, ["MOBILE"]);
  assert.deepEqual(result.groups[1]?.matchedOn, ["BUSINESS_PROFILE"]);
});

test("repeated enquiries remain grouped after terminal stage changes", () => {
  const result = aggregateRepeatedEnquiries(
    [
      lead("won", 300, { email: "same@example.com", stage: "WON" }),
      lead("lost", 200, { email: "same@example.com", stage: "LOST" }),
      lead("disqualified", 100, {
        email: "same@example.com",
        stage: "DISQUALIFIED",
      }),
    ],
    query(),
  );

  assert.equal(result.totalGroups, 1);
  assert.deepEqual(
    result.groups[0]?.enquiries.map((item) => item.stage),
    ["WON", "LOST", "DISQUALIFIED"],
  );
});

test("repeated enquiry service performs one cached projected stream", async () => {
  let calls = 0;
  leadRepository.streamRepeatedEnquiries = async function* () {
    calls += 1;
    yield lead("lead-a", 200, { email: "repeat@example.com" });
    yield lead("lead-b", 100, { email: "REPEAT@example.com" });
  };
  const request = query({ outletId: "outlet-cache" });

  const [first, second] = await Promise.all([
    leadService.getRepeatedEnquiries(request),
    leadService.getRepeatedEnquiries(request),
  ]);
  const third = await leadService.getRepeatedEnquiries(request);

  assert.equal(calls, 1);
  assert.equal(first.totalGroups, 1);
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
});
