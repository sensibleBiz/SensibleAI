import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { leadRepository } from "../src/repositories/lead.repository.js";
import { customerRepository } from "../src/repositories/customer.repository.js";
import { autoLeadAssignmentRepository } from "../src/repositories/autoLeadAssignment.repository.js";
import {
  buildBulkLeadCreateData,
  buildLeadCreateData,
  clearLeadReportCaches,
  leadService,
} from "../src/services/lead.service.js";
import type {
  LeadCreateData,
  LeadCreateInput,
} from "../src/types/lead.types.js";
import {
  leadBulkCreateBodySchema,
  leadCreateBodySchema,
} from "../src/validators/lead.validator.js";

const originalCreate = leadRepository.create;
const originalCreateBulk = leadRepository.createBulk;
const originalCreateEnquiry = customerRepository.createEnquiry;
const originalFindActiveUserId = autoLeadAssignmentRepository.findActiveUserId;
const originalStreamSourceStages = leadRepository.streamSourceStages;

afterEach(() => {
  leadRepository.create = originalCreate;
  leadRepository.createBulk = originalCreateBulk;
  customerRepository.createEnquiry = originalCreateEnquiry;
  autoLeadAssignmentRepository.findActiveUserId = originalFindActiveUserId;
  leadRepository.streamSourceStages = originalStreamSourceStages;
  clearLeadReportCaches();
});

const createInput = (
  overrides: Partial<LeadCreateInput> = {},
): LeadCreateInput => ({
  outletId: "outlet-1",
  area: "Central",
  businessName: "Analytical Engines",
  businessType: "Technology",
  city: "Pune",
  customerName: "Ada Lovelace",
  email: "ada@example.com",
  mobile: "9999999999",
  priority: "High",
  requirement: "CRM installation",
  source: "Reference",
  state: "Maharashtra",
  ...overrides,
});

const bulkLead = (overrides = {}) => ({
  rowNumber: 2,
  externalId: "l:123",
  adId: "ad-456",
  originalCreatedAt: Date.UTC(2026, 7, 18, 8),
  customerName: "Ada Lovelace",
  mobile: "9999999999",
  city: "Pune",
  source: "Facebook" as const,
  requirement: "New Leads ad",
  leadCampaign: "August campaign",
  inboxUrl: "https://business.facebook.com/latest/example",
  ...overrides,
});

test("lead create validation preserves optional fields as empty strings", () => {
  const parsed = leadCreateBodySchema.parse({
    outletId: "outlet-1",
    customerName: "Ada Lovelace",
    mobile: "9999999999",
    requirement: "CRM installation",
  });

  assert.equal(parsed.area, "");
  assert.equal(parsed.priority, "");
  assert.equal(parsed.source, "");
  assert.equal(parsed.state, "");
});

test("lead create validation rejects invalid mobile numbers and unknown fields", () => {
  assert.equal(
    leadCreateBodySchema.safeParse({
      ...createInput(),
      mobile: "123",
    }).success,
    false,
  );
  assert.equal(
    leadCreateBodySchema.safeParse({
      ...createInput(),
      reqBody: { accessToken: "must-not-be-accepted" },
    }).success,
    false,
  );
});

test("bulk lead validation accepts the Facebook export mapping", () => {
  const parsed = leadBulkCreateBodySchema.parse({
    outletId: "outlet-1",
    leads: [bulkLead()],
  });

  assert.equal(parsed.leads[0]?.externalId, "l:123");
  assert.equal(parsed.leads[0]?.adId, "ad-456");
  assert.equal(parsed.leads[0]?.source, "Facebook");
  assert.equal(
    leadBulkCreateBodySchema.safeParse({
      outletId: "outlet-1",
      leads: [bulkLead({ mobile: "123" })],
    }).success,
    false,
  );
});

test("bulk lead data keeps import metadata and creates a new CRM lead today", () => {
  const importTimestamp = Date.UTC(2026, 7, 31, 10);
  const data = buildBulkLeadCreateData(bulkLead(), importTimestamp);

  assert.equal(data.createdDate, importTimestamp);
  assert.equal(data.leadRefId, "l:123");
  assert.equal(data.adId, "ad-456");
  assert.equal(data.leadCampaign, "August campaign");
  assert.equal(data.source, "Facebook");
  assert.match(data.remarks, /Original lead time: 2026-08-18T08:00:00.000Z/);
  assert.match(data.remarks, /business\.facebook\.com/);
});

test("bulk lead service deduplicates external ids before repository creation", async () => {
  let capturedRecords = 0;
  autoLeadAssignmentRepository.findActiveUserId = async () => null;
  leadRepository.createBulk = async (outletId, records) => {
    assert.equal(outletId, "outlet-1");
    capturedRecords = records.length;
    return { created: 1, skippedDuplicates: 0 };
  };

  const result = await leadService.createBulk({
    outletId: "outlet-1",
    leads: [bulkLead(), bulkLead({ rowNumber: 3 })],
  });

  assert.equal(capturedRecords, 1);
  assert.deepEqual(result, { created: 1, skippedDuplicates: 1 });
});

test("bulk Facebook leads are auto-assigned by ad ID", async () => {
  let capturedData: LeadCreateData | undefined;
  autoLeadAssignmentRepository.findActiveUserId = async (
    _outletId,
    _platformName,
    adId,
  ) => (adId === "ad-456" ? "sales-user-1" : null);
  leadRepository.createBulk = async (_outletId, records) => {
    capturedData = records[0]?.data;
    return { created: 1, skippedDuplicates: 0 };
  };

  await leadService.createBulk({
    outletId: "outlet-1",
    leads: [bulkLead()],
  });

  assert.equal(capturedData?.assignedTo, "sales-user-1");
  assert.equal(capturedData?.stage, "ASSIGNED");
});

test("lead create data preserves the existing document fields", () => {
  const timestamp = Date.UTC(2026, 7, 18, 0, 5);
  const data = buildLeadCreateData(createInput(), timestamp);

  assert.equal(data.createdDate, timestamp);
  assert.equal(data.leadCreatedDate, timestamp);
  assert.equal(data.updatedDate, timestamp);
  assert.equal(data.logId, timestamp);
  assert.equal(data.date, "18-08-2026");
  assert.equal(data.leadDate, "18-08-2026");
  assert.equal(data.time, "05:35 AM");
  assert.equal(data.stage, "NEW");
  assert.equal(data.status, "NEW");
  assert.equal(data.phone, "9999999999");
  assert.equal(data.username, "Ada Lovelace");
  assert.equal(data.customerId, null);
  assert.equal(data.customerType, "PROSPECT");
  assert.equal(data.enquiryType, "NEW_LEAD");
  assert.deepEqual(data.leadTag, []);
  assert.equal("reqBody" in data, false);
  assert.equal("id" in data, false);
  assert.equal("assignedHistory" in data, false);
});

test("lead create service writes once to the authorized outlet", async () => {
  let capturedOutletId = "";
  let capturedData: LeadCreateData | undefined;
  leadRepository.create = async (outletId, data) => {
    capturedOutletId = outletId;
    capturedData = data;
    return "lead-1";
  };

  const result = await leadService.create(createInput());

  assert.deepEqual(result, { id: "lead-1" });
  assert.equal(capturedOutletId, "outlet-1");
  assert.equal(capturedData?.username, "Ada Lovelace");
  assert.equal(capturedData?.mobile, "9999999999");
});

test("Facebook ad mapping auto-assigns a newly created lead", async () => {
  let capturedData: LeadCreateData | undefined;
  autoLeadAssignmentRepository.findActiveUserId = async (
    outletId,
    platformName,
    adId,
  ) => {
    assert.equal(outletId, "outlet-1");
    assert.equal(platformName, "Facebook");
    assert.equal(adId, "ad-456");
    return "sales-user-1";
  };
  leadRepository.create = async (_outletId, data) => {
    capturedData = data;
    return "lead-auto-1";
  };

  await leadService.create(
    createInput({ source: "Facebook", adId: "ad-456" }),
  );

  assert.equal(capturedData?.adId, "ad-456");
  assert.equal(capturedData?.assignedTo, "sales-user-1");
  assert.equal(capturedData?.assignedBy, "AUTOLEAD_ASSIGN");
  assert.equal(capturedData?.stage, "ASSIGNED");
  assert.equal(capturedData?.status, "NEW");
  assert.deepEqual(capturedData?.assignedHistory?.[0], {
    assignTo: "sales-user-1",
    assignBy: "AUTOLEAD_ASSIGN",
    assignAt: capturedData?.createdDate,
  });
});

test("customer enquiry creation uses the customer transaction path", async () => {
  let capturedCustomerId = "";
  customerRepository.createEnquiry = async (_outletId, customerId, data) => {
    capturedCustomerId = customerId;
    assert.equal(data.customerType, "CUSTOMER");
    assert.equal(data.enquiryType, "CUSTOMER_ENQUIRY");
    return "lead-customer-1";
  };

  const result = await leadService.create(
    createInput({
      customerId: "customer-1",
      enquiryType: "CUSTOMER_ENQUIRY",
    }),
  );

  assert.deepEqual(result, { id: "lead-customer-1" });
  assert.equal(capturedCustomerId, "customer-1");
});

test("customer enquiry creation rejects an invalid customer id", async () => {
  customerRepository.createEnquiry = async () => null;

  await assert.rejects(
    leadService.create(
      createInput({
        customerId: "missing-customer",
        enquiryType: "CUSTOMER_ENQUIRY",
      }),
    ),
    { message: "Customer not found" },
  );
});

test("lead creation invalidates cached report totals", async () => {
  let reportReads = 0;
  leadRepository.streamSourceStages = async function* () {
    reportReads += 1;
    yield { source: "Website", stage: "NEW" };
  };
  leadRepository.create = async () => "lead-2";
  const query = {
    outletId: "outlet-create-cache",
    startDate: 1,
    endDate: 2,
  };

  await leadService.getSourceReport(query);
  await leadService.getSourceReport(query);
  await leadService.create(createInput({ outletId: query.outletId }));
  await leadService.getSourceReport(query);

  assert.equal(reportReads, 2);
});
