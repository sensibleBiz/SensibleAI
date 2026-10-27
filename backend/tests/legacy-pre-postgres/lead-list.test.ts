import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  boundLeadQueryLimit,
  getLeadListWhereClauses,
  LEAD_DETAIL_FIELDS,
  LEAD_LIST_FIELDS,
  leadRepository,
} from "../src/repositories/lead.repository.js";
import {
  clearLeadListCaches,
  clearLeadListIndexFallbacks,
  decodeLeadCursor,
  leadService,
  mapLeadListItem,
} from "../src/services/lead.service.js";
import type {
  LeadDocument,
  LeadListQuery,
} from "../src/types/lead.types.js";
import { leadListQuerySchema } from "../src/validators/lead.validator.js";

const originalListBatch = leadRepository.listBatch;

afterEach(() => {
  leadRepository.listBatch = originalListBatch;
  clearLeadListCaches();
  clearLeadListIndexFallbacks();
});

const makeLead = (
  id: string,
  createdDate: number,
  username: string,
  mobile: string,
  overrides: Record<string, unknown> = {},
): LeadDocument => ({
  id,
  cursor: { id, createdDate },
  data: {
    createdDate,
    username,
    mobile,
    stage: "NEW",
    reqBody: { accessToken: "must-not-be-projected" },
    ...overrides,
  },
});

const baseQuery = (overrides: Partial<LeadListQuery> = {}): LeadListQuery => ({
  outletId: "outlet-1",
  limit: 2,
  ...overrides,
});

test("lead list validation parses date boundaries and defaults the limit", () => {
  const parsed = leadListQuerySchema.parse({
    outletId: "outlet-1",
    startDate: "2026-08-01",
    endDate: "2026-08-17",
  });

  assert.equal(parsed.startDate, Date.parse("2026-08-01T00:00:00.000Z"));
  assert.equal(parsed.endDate, Date.parse("2026-08-17T23:59:59.999Z"));
  assert.equal(parsed.limit, 30);
});

test("lead list validation rejects reversed dates and limits above 100", () => {
  assert.equal(
    leadListQuerySchema.safeParse({
      outletId: "outlet-1",
      startDate: "2026-08-18",
      endDate: "2026-08-17",
    }).success,
    false,
  );
  assert.equal(
    leadListQuerySchema.safeParse({ outletId: "outlet-1", limit: 101 })
      .success,
    false,
  );
});

test("lead projection excludes raw payloads and normalizes UI fields", () => {
  const item = mapLeadListItem(
    makeLead("lead-1", 100, "Ada Lovelace", "9999999999", {
      whatsappShareCount: 3,
    }),
  );

  assert.equal(item.id, "lead-1");
  assert.equal(item.username, "Ada Lovelace");
  assert.deepEqual(item.assignedHistory, []);
  assert.equal(item.customerId, null);
  assert.equal(item.customerType, "PROSPECT");
  assert.equal(item.enquiryType, "NEW_LEAD");
  assert.equal(item.whatsappShareCount, 3);
  assert.equal("reqBody" in item, false);
});

test("lead list validation accepts only the explicit unassigned flag", () => {
  assert.equal(
    leadListQuerySchema.parse({ outletId: "outlet-1", unassigned: "true" })
      .unassigned,
    true,
  );
  assert.equal(
    leadListQuerySchema.safeParse({
      outletId: "outlet-1",
      unassigned: "false",
    }).success,
    false,
  );
});

test("lead list validation accepts only the existing-customer enquiry filter", () => {
  assert.equal(
    leadListQuerySchema.safeParse({
      outletId: "outlet-1",
      enquiryType: "CUSTOMER_ENQUIRY",
    }).success,
    true,
  );
  assert.equal(
    leadListQuerySchema.safeParse({
      outletId: "outlet-1",
      enquiryType: "NEW_LEAD",
    }).success,
    false,
  );
});

test("lead list projection excludes assignment history while detail retains it", () => {
  assert.equal(LEAD_LIST_FIELDS.includes("assignedHistory" as never), false);
  assert.equal(LEAD_DETAIL_FIELDS.includes("assignedHistory"), true);
  assert.equal(LEAD_LIST_FIELDS.includes("mobile"), true);
  assert.equal(LEAD_LIST_FIELDS.includes("requirement"), true);
  assert.equal(LEAD_LIST_FIELDS.includes("whatsappShareCount"), true);
});

test("repository limit guard allows only the pagination sentinel", () => {
  assert.equal(boundLeadQueryLimit(1), 1);
  assert.equal(boundLeadQueryLimit(100), 100);
  assert.equal(boundLeadQueryLimit(50_000), 101);
  assert.throws(() => boundLeadQueryLimit(0), { message: "Invalid page limit" });
});

test("search requests retain their date and assignee Firestore predicates", () => {
  const clauses = getLeadListWhereClauses(
    baseQuery({
      assignedTo: "user-1",
      startDate: 100,
      endDate: 500,
      search: "ada",
    }),
  );

  assert.deepEqual(clauses, [
    ["createdDate", ">=", 100],
    ["createdDate", "<=", 500],
    ["assignedTo", "==", "user-1"],
  ]);
});

test("indexed stage and status filters are applied by Firestore", () => {
  const stageClauses = getLeadListWhereClauses(
    baseQuery({
      stage: "FOLLOWUP",
      startDate: 100,
      endDate: 500,
    }),
  );
  const statusClauses = getLeadListWhereClauses(
    baseQuery({
      status: "RINGING",
      startDate: 100,
      endDate: 500,
    }),
  );

  assert.deepEqual(stageClauses, [
    ["createdDate", ">=", 100],
    ["createdDate", "<=", 500],
    ["stage", "==", "FOLLOWUP"],
  ]);
  assert.deepEqual(statusClauses, [
    ["createdDate", ">=", 100],
    ["createdDate", "<=", 500],
    ["status", "==", "RINGING"],
  ]);
});

test("customer enquiry filter is applied by Firestore", () => {
  const clauses = getLeadListWhereClauses(
    baseQuery({
      enquiryType: "CUSTOMER_ENQUIRY",
      startDate: 100,
      endDate: 500,
    }),
  );

  assert.deepEqual(clauses, [
    ["createdDate", ">=", 100],
    ["createdDate", "<=", 500],
    ["enquiryType", "==", "CUSTOMER_ENQUIRY"],
  ]);
});

test("source filters are converted to Firestore source predicates", () => {
  const sourceClauses = getLeadListWhereClauses(
    baseQuery({
      source: "JustDail",
      startDate: 100,
      endDate: 500,
    }),
  );
  const sourceKeyClauses = getLeadListWhereClauses(
    baseQuery({
      sourceKey: "facebook",
      startDate: 100,
      endDate: 500,
    }),
  );

  assert.deepEqual(sourceClauses, [
    ["createdDate", ">=", 100],
    ["createdDate", "<=", 500],
    [
      "source",
      "in",
      [
        "JustDail",
        "JustDial",
        "Justdial",
        "Justdial Leads In CRM",
        "JustDail Leads In CRM",
      ],
    ],
  ]);
  assert.deepEqual(sourceKeyClauses, [
    ["createdDate", ">=", 100],
    ["createdDate", "<=", 500],
    ["source", "in", ["Facebook", "FB", "Facebook Leads In CRM"]],
  ]);
});

test("cursor pagination returns non-overlapping pages and an empty terminal cursor", async () => {
  const records = [
    makeLead("lead-3", 300, "Three", "300"),
    makeLead("lead-2", 200, "Two", "200"),
    makeLead("lead-1", 100, "One", "100"),
  ];

  leadRepository.listBatch = async (_filters, cursor, limit) => {
    const startIndex = cursor
      ? records.findIndex((record) => record.id === cursor.id) + 1
      : 0;
    return records.slice(startIndex, startIndex + limit);
  };

  const firstPage = await leadService.list(baseQuery());
  assert.deepEqual(firstPage.items.map((item) => item.id), ["lead-3", "lead-2"]);
  assert.ok(firstPage.nextCursor);

  const secondPage = await leadService.list(
    baseQuery({ cursor: firstPage.nextCursor ?? undefined }),
  );
  assert.deepEqual(secondPage.items.map((item) => item.id), ["lead-1"]);
  assert.equal(secondPage.nextCursor, null);
});

test("server filters are forwarded and substring search is applied on the backend", async () => {
  const capturedFilters: LeadListQuery[] = [];
  const records = [
    makeLead("lead-3", 300, "Alice Johnson", "9000000001", {
      assignedTo: "user-1",
      source: "Facebook",
      status: "RINGING",
    }),
    makeLead("lead-2", 200, "Bob Smith", "9000000002", {
      assignedTo: "user-2",
      source: "Indiamart",
      status: "",
    }),
    makeLead("lead-1", 100, "Alicia Stone", "9000000003", {
      assignedTo: "user-1",
      source: "Facebook",
      status: "RINGING",
    }),
  ];

  leadRepository.listBatch = async (filters) => {
    capturedFilters.push(filters);
    return records;
  };

  const result = await leadService.list(
    baseQuery({
      assignedTo: "user-1",
      source: "Facebook",
      stage: "NEW",
      status: "RINGING",
      search: "ali",
    }),
  );

  assert.deepEqual(result.items.map((item) => item.id), ["lead-3", "lead-1"]);
  assert.equal(capturedFilters[0]?.assignedTo, "user-1");
  assert.equal(capturedFilters[0]?.source, "Facebook");
  assert.equal(capturedFilters[0]?.stage, "NEW");
  assert.equal(capturedFilters[0]?.status, "RINGING");
});

test("indexed assignee filters fetch only one bounded page", async () => {
  const requestedLimits: number[] = [];
  leadRepository.listBatch = async (_filters, _cursor, limit) => {
    requestedLimits.push(limit);
    return [makeLead("lead-1", 100, "Alice", "9000000001")];
  };

  const result = await leadService.list(
    baseQuery({ assignedTo: "user-1" }),
  );

  assert.deepEqual(result.items.map((lead) => lead.id), ["lead-1"]);
  assert.deepEqual(requestedLimits, [3]);
});

test("unassigned lead view excludes records that already have an assignee", async () => {
  const records = [
    makeLead("unassigned-empty", 300, "Empty", "9000000001", {
      assignedTo: "",
    }),
    makeLead("assigned", 200, "Assigned", "9000000002", {
      assignedTo: "user-1",
    }),
    makeLead("unassigned-missing", 100, "Missing", "9000000003"),
  ];

  leadRepository.listBatch = async () => records;

  const result = await leadService.list(
    baseQuery({ limit: 3, stage: "NEW", unassigned: true }),
  );

  assert.deepEqual(
    result.items.map((lead) => lead.id),
    ["unassigned-empty", "unassigned-missing"],
  );
});

test("customer enquiry list stays paginated while stage is filtered by the service", async () => {
  const capturedFilters: LeadListQuery[] = [];
  const records = [
    makeLead("customer-new", 300, "Alice", "9000000001", {
      customerId: "customer-1",
      enquiryType: "CUSTOMER_ENQUIRY",
    }),
    makeLead("customer-won", 200, "Alice", "9000000001", {
      customerId: "customer-1",
      enquiryType: "CUSTOMER_ENQUIRY",
      stage: "WON",
    }),
  ];

  leadRepository.listBatch = async (filters) => {
    capturedFilters.push(filters);
    return records;
  };

  const result = await leadService.list(
    baseQuery({
      enquiryType: "CUSTOMER_ENQUIRY",
      stage: "NEW",
    }),
  );

  assert.deepEqual(result.items.map((lead) => lead.id), ["customer-new"]);
  assert.equal(capturedFilters[0]?.enquiryType, "CUSTOMER_ENQUIRY");
  assert.equal(capturedFilters[0]?.stage, undefined);
});

test("missing stage index fails clearly instead of broad-scanning date ranges", async () => {
  const queriedStages: Array<string | undefined> = [];
  const records = [
    makeLead("lead-new", 200, "Alice", "9000000001"),
    makeLead("lead-won", 100, "Bob", "9000000002", { stage: "WON" }),
  ];

  leadRepository.listBatch = async (filters) => {
    queriedStages.push(filters.stage);
    if (filters.stage) {
      throw Object.assign(new Error("The query requires an index"), { code: 9 });
    }
    return records;
  };

  await assert.rejects(
    leadService.list(
      baseQuery({ outletId: "missing-stage-index", stage: "NEW" }),
    ),
    {
      message:
        "Lead list Firestore index is not ready. Deploy firestore.indexes.json and try again.",
    },
  );

  assert.deepEqual(queriedStages, ["NEW"]);
});

test("lead list does not hide unrelated Firestore failures", async () => {
  leadRepository.listBatch = async () => {
    throw Object.assign(new Error("Permission denied"), { code: 7 });
  };

  await assert.rejects(
    leadService.list(
      baseQuery({ outletId: "permission-error", stage: "NEW" }),
    ),
    { message: "Permission denied" },
  );
});

test("identical concurrent list requests share one repository read", async () => {
  let calls = 0;
  leadRepository.listBatch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return [makeLead("lead-cache", 100, "Alice", "9000000001")];
  };
  const query = baseQuery({ outletId: "outlet-list-cache", stage: "NEW" });

  await Promise.all([leadService.list(query), leadService.list(query)]);
  await leadService.list(query);

  assert.equal(calls, 1);
});

test("indexed source filters fetch only one bounded page", async () => {
  const requestedLimits: number[] = [];
  const capturedSources: Array<string | undefined> = [];
  leadRepository.listBatch = async (filters, _cursor, limit) => {
    requestedLimits.push(limit);
    capturedSources.push(filters.source);
    return [
      makeLead("lead-1", 200, "Ada", "9000000001", { source: "JustDial" }),
    ];
  };

  const result = await leadService.list(baseQuery({ source: "JustDail" }));

  assert.deepEqual(result.items.map((lead) => lead.id), ["lead-1"]);
  assert.deepEqual(requestedLimits, [3]);
  assert.deepEqual(capturedSources, ["JustDail"]);
});

test("search matches business name and phone digits even when mixed with text", async () => {
  leadRepository.listBatch = async () => [
    makeLead("lead-2", 200, "Ada Lovelace", "+91 90000-00001", {
      businessName: "Sensible Tech",
    }),
    makeLead("lead-1", 100, "Grace Hopper", "", {
      mobileAlt: "+91 (98888) 00002",
      phone: "9888800003",
    }),
  ];

  const byBusiness = await leadService.list(
    baseQuery({ search: "sensible" }),
  );
  const byPhone = await leadService.list(
    baseQuery({ search: "9000000001" }),
  );
  const alternate = await leadService.list(
    baseQuery({ search: "98888 00002" }),
  );
  const normalizedName = await leadService.list(
    baseQuery({ search: "ada   lovelace" }),
  );

  assert.deepEqual(byBusiness.items.map((lead) => lead.id), ["lead-2"]);
  assert.deepEqual(byPhone.items.map((lead) => lead.id), ["lead-2"]);
  assert.deepEqual(alternate.items.map((lead) => lead.id), ["lead-1"]);
  assert.deepEqual(normalizedName.items.map((lead) => lead.id), ["lead-2"]);
});

test("empty result sets are represented without a cursor", async () => {
  leadRepository.listBatch = async () => [];

  const result = await leadService.list(baseQuery());
  assert.deepEqual(result, { items: [], nextCursor: null });
});

test("malformed cursors are rejected", () => {
  assert.throws(() => decodeLeadCursor("not-a-cursor"), {
    message: "Invalid pagination cursor",
  });
});
