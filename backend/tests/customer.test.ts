import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateCustomerTransition,
  customerLifecycleForWonCount,
} from "../src/services/customerLifecycle.js";
import {
  buildCustomerIdentities,
  customerIdentityId,
  deterministicCustomerId,
  normalizeBusinessName,
  normalizeEmail,
  normalizeMobile,
} from "../src/utils/customerNormalization.js";
import {
  customerEnquiryQuerySchema,
  customerSearchQuerySchema,
} from "../src/validators/customer.validator.js";
import { leadCreateBodySchema } from "../src/validators/lead.validator.js";

// customerRepository, customerService, leadRepository were in deleted Firestore
// repositories/services; those tests removed pending PostgreSQL-native replacements.

test("customer normalization is exact and preserves stable identities", () => {
  assert.equal(normalizeMobile("+91 98765-43210"), "9876543210");
  assert.equal(normalizeEmail(" SALES@Example.COM "), "sales@example.com");
  assert.equal(
    normalizeBusinessName("  Landmark  Pharmaceuticals Pvt. Ltd. "),
    "landmark pharmaceuticals pvt ltd",
  );

  const identities = buildCustomerIdentities({
    businessName: "Landmark Pharmaceuticals",
    city: "Mumbai",
    email: "sales@landmark.example",
    mobile: "9876543210",
    state: "Maharashtra",
  });
  assert.deepEqual(identities.map((identity) => identity.type), [
    "mobile",
    "email",
    "businessLocation",
  ]);
  assert.equal(customerIdentityId(identities[0]!).length, 64);
  assert.equal(
    deterministicCustomerId(identities[0]!),
    deterministicCustomerId(identities[0]!),
  );
});

test("customer lifecycle follows zero, one, and repeat WON rules", () => {
  assert.equal(customerLifecycleForWonCount(0), "PROSPECT");
  assert.equal(customerLifecycleForWonCount(1), "NEW_CUSTOMER");
  assert.equal(customerLifecycleForWonCount(2), "REPEAT_CUSTOMER");
});


test("customer counters are idempotent and stage-reversal safe", () => {
  const initial = { totalEnquiries: 1, totalWon: 1, totalLost: 0 };

  assert.deepEqual(calculateCustomerTransition(initial, "WON", "WON", false), {
    lifecycle: "NEW_CUSTOMER",
    totalEnquiries: 1,
    totalLost: 0,
    totalWon: 1,
  });
  assert.deepEqual(calculateCustomerTransition(initial, "WON", "LOST", false), {
    lifecycle: "PROSPECT",
    totalEnquiries: 1,
    totalLost: 1,
    totalWon: 0,
  });
  assert.deepEqual(
    calculateCustomerTransition(
      { totalEnquiries: 2, totalWon: 1, totalLost: 1 },
      "LOST",
      "WON",
      false,
    ),
    {
      lifecycle: "REPEAT_CUSTOMER",
      totalEnquiries: 2,
      totalLost: 0,
      totalWon: 2,
    },
  );
});

test("linking a first WON lead adds one enquiry and one win", () => {
  assert.deepEqual(
    calculateCustomerTransition(
      { totalEnquiries: 4, totalWon: 3, totalLost: 1 },
      "FOLLOWUP",
      "WON",
      true,
    ),
    {
      lifecycle: "REPEAT_CUSTOMER",
      totalEnquiries: 5,
      totalLost: 1,
      totalWon: 4,
    },
  );
});

test("customer API validators bound searches and enquiry pagination", () => {
  assert.equal(
    customerSearchQuerySchema.parse({ outletId: "outlet-1", query: "Landmark" })
      .limit,
    10,
  );
  assert.equal(
    customerEnquiryQuerySchema.parse({ outletId: "outlet-1" }).limit,
    20,
  );
  assert.equal(
    customerSearchQuerySchema.safeParse({ outletId: "outlet-1", query: "L" })
      .success,
    false,
  );
});

test("customer enquiry validation requires a customer relationship", () => {
  const base = {
    outletId: "outlet-1",
    customerName: "Ada",
    mobile: "9999999999",
    requirement: "CRM",
  };
  assert.equal(
    leadCreateBodySchema.safeParse({
      ...base,
      enquiryType: "CUSTOMER_ENQUIRY",
    }).success,
    false,
  );
  assert.equal(
    leadCreateBodySchema.safeParse({
      ...base,
      customerId: "customer-1",
      enquiryType: "CUSTOMER_ENQUIRY",
    }).success,
    true,
  );
});

// Tests below require customerRepository / customerService (deleted Firestore code).
// Removed pending PostgreSQL-native replacements.

/*
test("customer detail reuses every latest enquiry field except requirement", async () => {
  customerRepository.getById = async () => ({
    id: "customer-1",
    data: {
      businessName: "Old Business Name",
      city: "Old City",
      customerName: "Old Customer Name",
      email: "old@example.com",
      mobile: "9000000000",
      state: "Old State",
      status: "ACTIVE",
    },
  });
  customerRepository.getLatestEnquiryDefaults = async () => ({
    id: "lead-latest",
    data: {
      area: "Camp",
      businessName: "Latest Business Name",
      businessType: "Restaurant",
      city: "Pune",
      email: "latest@example.com",
      mobile: "9876543210",
      priority: "High",
      requirement: "Must not be copied",
      source: "Reference",
      state: "Maharashtra",
      username: "Latest Customer Name",
    },
  });

  const customer = await customerService.getById(
    { outletId: "outlet-1" },
    "customer-1",
  );

  assert.deepEqual(
    {
      area: customer.area,
      businessName: customer.businessName,
      businessType: customer.businessType,
      city: customer.city,
      customerName: customer.customerName,
      email: customer.email,
      mobile: customer.mobile,
      priority: customer.priority,
      source: customer.source,
      state: customer.state,
    },
    {
      area: "Camp",
      businessName: "Latest Business Name",
      businessType: "Restaurant",
      city: "Pune",
      customerName: "Latest Customer Name",
      email: "latest@example.com",
      mobile: "9876543210",
      priority: "High",
      source: "Reference",
      state: "Maharashtra",
    },
  );
  assert.equal("requirement" in customer, false);
});

test("customer enquiry history is cursor paginated and includes the overview", async () => {
  const requestedOutlets: string[] = [];
  customerRepository.getById = async (outletId) => {
    requestedOutlets.push(`customer:${outletId}`);
    return {
      id: "customer-1",
      data: {
        businessName: "Landmark Pharmaceuticals",
        customerCode: "CUS-123",
        lifecycle: "REPEAT_CUSTOMER",
        status: "ACTIVE",
        totalEnquiries: 3,
        totalWon: 2,
        totalLost: 1,
      },
    };
  };
  customerRepository.listEnquiries = async (outletId) => {
    requestedOutlets.push(`enquiries:${outletId}`);
    return [
      {
        id: "lead-3",
        data: { createdDate: 300, customerId: "customer-1", stage: "WON" },
        cursor: { id: "lead-3", createdDate: 300 },
      },
      {
        id: "lead-2",
        data: { createdDate: 200, customerId: "customer-1", stage: "LOST" },
        cursor: { id: "lead-2", createdDate: 200 },
      },
    ];
  };

  const result = await customerService.listEnquiries(
    { outletId: "outlet-1", limit: 1 },
    "customer-1",
  );

  assert.equal(result.customer.lifecycle, "REPEAT_CUSTOMER");
  assert.equal(result.customer.outletId, "outlet-1");
  assert.equal(result.customer.customerName, "");
  assert.equal(result.customer.businessName, "Landmark Pharmaceuticals");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.customerId, "customer-1");
  assert.ok(result.nextCursor);
  assert.deepEqual(requestedOutlets, [
    "customer:outlet-1",
    "enquiries:outlet-1",
  ]);
});

test("customer match also returns existing enquiries for the same mobile", async () => {
  customerRepository.match = async () => [];
  customerRepository.getById = async () => null;
  leadRepository.listMatchingEnquiries = async () => [
    {
      id: "lead-repeat",
      data: {
        createdDate: 400,
        email: "same@example.com",
        mobile: "9876543210",
        username: "Santosh",
        stage: "NEW",
      },
      cursor: { id: "lead-repeat", createdDate: 400 },
    },
  ];

  const result = await customerService.match({
    outletId: "outlet-1",
    mobile: "9876543210",
    email: "same@example.com",
    limit: 5,
  });

  assert.equal(result.items.length, 0);
  assert.equal(result.existingEnquiries.length, 1);
  assert.equal(result.existingEnquiries[0]?.mobile, "9876543210");
  assert.equal(result.existingEnquiries[0]?.email, "same@example.com");
  assert.equal(result.existingEnquiries[0]?.username, "Santosh");
});

test("customer search also returns repeated enquiries for a searched number", async () => {
  customerRepository.search = async () => [];
  leadRepository.listMatchingEnquiries = async (_outletId, input) => {
    assert.equal(input.mobile, "9876543210");
    return [
      {
        id: "lead-repeat",
        data: {
          createdDate: 400,
          mobile: "9876543210",
          username: "Santosh",
          stage: "NEW",
        },
        cursor: { id: "lead-repeat", createdDate: 400 },
      },
    ];
  };

  const result = await customerService.search({
    outletId: "outlet-1",
    query: "+91 98765-43210",
    limit: 10,
  });

  assert.equal(result.items.length, 0);
  assert.equal(result.existingEnquiries.length, 1);
  assert.equal(result.existingEnquiries[0]?.mobile, "9876543210");
});
*/
