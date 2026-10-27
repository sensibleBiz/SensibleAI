import assert from "node:assert/strict";
import test from "node:test";
import {
  generatedContactImportParamsSchema,
  generatedContactImportSchema,
  generatedContactReassignParamsSchema,
  generatedContactReassignSchema,
} from "../src/validators/generatedContact.validator.js";

const validPayload = {
  outletId: "outlet-1",
  importId: "import-1",
  fileName: "contacts.xlsx",
  worksheetName: "Sheet1",
  uploadedAt: Date.now(),
  uploadType: "EVENT",
  uploadName: "Sales Expo",
  event: {
    id: "event-1",
    name: "Sales Expo",
    description: "Annual sales event",
    terms: "Standard terms",
    location: "Convention Centre",
    address: "Pune",
    city: "Pune",
    eventDateTime: "2026-10-01T10:00:00.000Z",
    registrationExpiryDate: "2026-09-30T18:00:00.000Z",
    registrationType: "free",
    fees: 0,
    imageUrl: "https://example.com/event.jpg",
    status: "Active",
    totalRegistrations: 10,
    registrationLink: "https://example.com/event-register/event-1",
  },
  contacts: [
    {
      rowNumber: 2,
      values: { name: "Customer", mobile: "9876543210" },
      assignedUserId: "sales-user-1",
      assignedUserName: "Sales User",
    },
  ],
};

test("generated contacts require one sales user id per contact", () => {
  assert.equal(generatedContactImportSchema.safeParse(validPayload).success, true);
  assert.equal(
    generatedContactImportSchema.safeParse({
      ...validPayload,
      contacts: [{ ...validPayload.contacts[0], assignedUserId: "" }],
    }).success,
    false,
  );
  assert.equal(
    generatedContactImportSchema.safeParse({
      ...validPayload,
      contacts: [{ ...validPayload.contacts[0], assignedUserIds: ["a", "b"] }],
    }).success,
    false,
  );
});

test("generated contacts require linked event name, date, and link", () => {
  const payloadWithoutEvent = { ...validPayload, event: undefined };
  assert.equal(
    generatedContactImportSchema.safeParse(payloadWithoutEvent).success,
    false,
  );
  assert.equal(
    generatedContactImportSchema.safeParse({
      ...validPayload,
      event: { ...validPayload.event, name: "" },
    }).success,
    false,
  );
});

test("other contact uploads require a name and omit event details", () => {
  assert.equal(
    generatedContactImportSchema.safeParse({
      ...validPayload,
      uploadType: "OTHER",
      uploadName: "Walk-in campaign",
      event: undefined,
    }).success,
    true,
  );
  assert.equal(
    generatedContactImportSchema.safeParse({
      ...validPayload,
      uploadType: "OTHER",
      uploadName: "",
      event: undefined,
    }).success,
    false,
  );
  assert.equal(
    generatedContactImportSchema.safeParse({
      ...validPayload,
      uploadType: "OTHER",
    }).success,
    false,
  );
});

test("generated contact detail and reassignment identifiers are bounded", () => {
  assert.equal(
    generatedContactImportParamsSchema.safeParse({ importId: "import-1" }).success,
    true,
  );
  assert.equal(
    generatedContactReassignParamsSchema.safeParse({ contactId: "contact-1" }).success,
    true,
  );
  assert.equal(
    generatedContactReassignSchema.safeParse({
      outletId: "outlet-1",
      assignedUserId: "sales-user-2",
      reason: "Territory transfer",
    }).success,
    true,
  );
  assert.equal(
    generatedContactReassignSchema.safeParse({
      outletId: "outlet-1",
      assignedUserId: "bad/user",
    }).success,
    false,
  );
});
