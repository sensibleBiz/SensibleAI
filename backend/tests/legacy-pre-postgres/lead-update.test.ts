import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  buildLeadAssignmentData,
  leadRepository,
} from "../src/repositories/lead.repository.js";
import {
  buildLeadUpdateData,
  leadService,
} from "../src/services/lead.service.js";
import { customerRepository } from "../src/repositories/customer.repository.js";
import type {
  LeadDocument,
} from "../src/types/lead.types.js";
import {
  leadAssignBodySchema,
  leadStageBodySchema,
  leadUpdateBodySchema,
} from "../src/validators/lead.validator.js";

const originalGetById = leadRepository.getById;
const originalUpdate = leadRepository.update;
const originalRecordWhatsAppShare = leadRepository.recordWhatsAppShare;
const originalGetLeadIdByShareToken = leadRepository.getLeadIdByShareToken;
const originalAssign = leadRepository.assign;
const originalApplyLeadWorkflow = customerRepository.applyLeadWorkflow;

afterEach(() => {
  leadRepository.getById = originalGetById;
  leadRepository.update = originalUpdate;
  leadRepository.recordWhatsAppShare = originalRecordWhatsAppShare;
  leadRepository.getLeadIdByShareToken = originalGetLeadIdByShareToken;
  leadRepository.assign = originalAssign;
  customerRepository.applyLeadWorkflow = originalApplyLeadWorkflow;
});

const leadDocument = (overrides: Record<string, unknown> = {}): LeadDocument => ({
  id: "lead-1",
  cursor: { id: "lead-1", createdDate: 100 },
  data: {
    assignedTo: "user-1",
    createdDate: 100,
    mobile: "9999999999",
    stage: "NEW",
    username: "Ada Lovelace",
    reqBody: { accessToken: "must-not-be-returned" },
    ...overrides,
  },
});

test("phase 4 validators reject arbitrary fields and invalid workflow input", () => {
  assert.equal(
    leadUpdateBodySchema.safeParse({
      outletId: "outlet-1",
      reqBody: { secret: true },
    }).success,
    false,
  );
  assert.equal(
    leadAssignBodySchema.safeParse({
      outletId: "outlet-1",
      assignedTo: "user-1",
      stage: "UNKNOWN",
    }).success,
    false,
  );
  assert.deepEqual(
    leadStageBodySchema.parse({ outletId: "outlet-1", stage: "WON" }),
    { outletId: "outlet-1", stage: "WON", comments: "", leadTag: [] },
  );
});

test("lead detail uses the safe projection", async () => {
  leadRepository.getById = async () => leadDocument();

  const result = await leadService.getById({ outletId: "outlet-1" }, "lead-1");

  assert.equal(result.id, "lead-1");
  assert.equal(result.username, "Ada Lovelace");
  assert.equal("reqBody" in result, false);
});

test("WhatsApp share records and returns the persisted click count", async () => {
  let capturedOutletId = "";
  let capturedLeadId = "";
  leadRepository.recordWhatsAppShare = async (outletId, leadId) => {
    capturedOutletId = outletId;
    capturedLeadId = leadId;
    return { shareToken: "Ab3kP9xQ2m12", whatsappShareCount: 4 };
  };

  const result = await leadService.recordWhatsAppShare(
    { outletId: "outlet-1" },
    "lead-1",
  );

  assert.equal(capturedOutletId, "outlet-1");
  assert.equal(capturedLeadId, "lead-1");
  assert.deepEqual(result, {
    id: "lead-1",
    shareToken: "Ab3kP9xQ2m12",
    whatsappShareCount: 4,
  });
});

test("WhatsApp share returns not found for an unknown lead", async () => {
  leadRepository.recordWhatsAppShare = async () => null;

  await assert.rejects(
    leadService.recordWhatsAppShare(
      { outletId: "outlet-1" },
      "missing-lead",
    ),
    { message: "Lead not found" },
  );
});

test("short share token resolves to the safely projected lead", async () => {
  leadRepository.getLeadIdByShareToken = async (_outletId, shareToken) =>
    shareToken === "Ab3kP9xQ2m12" ? "lead-1" : null;
  leadRepository.getById = async () => leadDocument();

  const result = await leadService.getByShareToken(
    { outletId: "outlet-1" },
    "Ab3kP9xQ2m12",
  );

  assert.equal(result.id, "lead-1");
  assert.equal(result.username, "Ada Lovelace");
  assert.equal("reqBody" in result, false);
});

test("lead update synchronizes phone and uses a server timestamp", () => {
  const data = buildLeadUpdateData(
    {
      outletId: "outlet-1",
      mobile: "8888888888",
      username: "Grace Hopper",
    },
    500,
  );

  assert.deepEqual(data, {
    mobile: "8888888888",
    phone: "8888888888",
    updatedDate: 500,
    username: "Grace Hopper",
  });
});

test("lead update strips blank strings before saving", () => {
  const data = buildLeadUpdateData(
    {
      outletId: "outlet-1",
      area: "",
      businessName: "   ",
      email: "",
      mobile: "",
      state: "   ",
      username: "  Grace Hopper  ",
    },
    500,
  );

  assert.deepEqual(data, {
    updatedDate: 500,
    username: "Grace Hopper",
  });
});

test("lead update returns not found without exposing repository errors", async () => {
  leadRepository.update = async () => false;

  await assert.rejects(
    leadService.update(
      { outletId: "outlet-1", username: "Grace Hopper" },
      "missing-lead",
    ),
    { message: "Lead not found" },
  );
});

test("assignment preserves history and appends the existing array shape", () => {
  const update = buildLeadAssignmentData(
    {
      assignedTo: "user-1",
      assignedHistory: [
        { assignTo: "user-1", assignBy: "admin-1", assignAt: 100 },
      ],
    },
    {
      assignedBy: "admin-2",
      assignedTo: "user-2",
      comments: "",
      leadTag: ["Hot"],
      stage: "ASSIGNED",
      updatedDate: 200,
    },
  );

  assert.deepEqual(update.assignedHistory, [
    { assignTo: "user-1", assignBy: "admin-1", assignAt: 100 },
    { assignTo: "user-2", assignBy: "admin-2", assignAt: 200 },
  ]);
});

test("assignment derives actor and stage on the backend", async () => {
  let capturedData:
    | Parameters<typeof customerRepository.applyLeadWorkflow>[2]
    | undefined;
  customerRepository.applyLeadWorkflow = async (_outletId, _leadId, data) => {
    capturedData = data;
    return {
      assignedBy: data.assignment?.assignedBy,
      assignedTo: data.assignment?.assignedTo,
      customerId: null,
      customerType: "PROSPECT",
      enquiryType: "NEW_LEAD",
      ...(data.stage ? { stage: data.stage } : {}),
    };
  };

  const result = await leadService.assign(
    {
      outletId: "outlet-1",
      assignedTo: "user-2",
      stage: "NEW",
      comments: "Ready",
      leadTag: [],
    },
    "lead-1",
    "admin-1",
  );

  assert.equal(capturedData?.assignment?.assignedBy, "admin-1");
  assert.equal(capturedData?.stage, "ASSIGNED");
  assert.equal(result.stage, "ASSIGNED");
});

test("stage changes enforce comments and existing assignment rules", async () => {
  leadRepository.getById = async () => leadDocument({ assignedTo: "" });
  leadRepository.update = async () => true;

  await assert.rejects(
    leadService.changeStage(
      {
        outletId: "outlet-1",
        stage: "LOST",
        comments: "",
        leadTag: [],
      },
      "lead-1",
    ),
    { message: "Comments are required for Lost or Disqualified stage" },
  );
  await assert.rejects(
    leadService.changeStage(
      {
        outletId: "outlet-1",
        stage: "FOLLOWUP",
        comments: "Call tomorrow",
        leadTag: [],
      },
      "lead-1",
    ),
    { message: "An assignee is required for Assigned or Followup stage" },
  );
});
