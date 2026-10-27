import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWhatsAppTemplateContent,
  isAutomatedTestRuntime,
  normalizeWhatsAppNumber,
} from "../src/services/whatsapp.service.js";
import {
  interpolateVariables,
  isMissingWhatsAppConfigurationResponse,
} from "../src/modules/whatsapp/whatsappAutomation.service.js";
import {
  whatsappAutomationRuleBodySchema,
  whatsappAutomationTestBodySchema,
} from "../src/modules/whatsapp/whatsappAutomation.validator.js";

test("the Node test runner suppresses external WhatsApp side effects", () => {
  assert.equal(isAutomatedTestRuntime(), true);
});

test("normalizeWhatsAppNumber formats numbers to 91 prefix", () => {
  assert.equal(normalizeWhatsAppNumber("9876543210"), "919876543210");
  assert.equal(normalizeWhatsAppNumber("+919876543210"), "919876543210");
  assert.equal(normalizeWhatsAppNumber("919876543210"), "919876543210");
  assert.equal(normalizeWhatsAppNumber(""), "");
});

test("buildWhatsAppTemplateContent builds body components and body_N keys", () => {
  const content = buildWhatsAppTemplateContent("lead_welcome", {
    body_1: "John Doe",
    body_2: "Acme Corp",
  });

  assert.equal(content.messaging_product, "whatsapp");
  assert.equal(content.template.name, "lead_welcome");
  assert.equal(content.template.components[0]?.type, "body");
  assert.equal(content.template.components[0]?.parameters.length, 2);
  assert.equal(content.template.components[0]?.parameters[0]?.text, "John Doe");
  assert.equal(content.body_1.text, "John Doe");
  assert.equal(content.body_2.text, "Acme Corp");
});

test("interpolateVariables replaces {{placeholders}} with context values", () => {
  const template = "Hello {{customerName}} of {{businessName}}, inquiry for {{requirement}}";
  const context = {
    outletId: "test-outlet",
    customerName: "Alice",
    businessName: "Sensible Bistro",
    requirement: "POS software",
  };

  const result = interpolateVariables(template, context);
  assert.equal(result, "Hello Alice of Sensible Bistro, inquiry for POS software");
});

test("interpolateVariables handles missing keys gracefully", () => {
  const template = "Hello {{customerName}}, your city is {{city}}";
  const context = {
    outletId: "test-outlet",
    customerName: "Bob",
  };

  const result = interpolateVariables(template, context);
  assert.equal(result, "Hello Bob, your city is ");
});

test("missing outlet WhatsApp configuration is treated as an unconfigured outlet", () => {
  assert.equal(
    isMissingWhatsAppConfigurationResponse(
      500,
      '{"success":false,"message":"Active WhatsApp messaging configuration not found for outlet: outlet-1"}',
    ),
    true,
  );
  assert.equal(
    isMissingWhatsAppConfigurationResponse(500, "Unexpected provider failure"),
    false,
  );
  assert.equal(
    isMissingWhatsAppConfigurationResponse(
      503,
      "Active WhatsApp messaging configuration not found",
    ),
    false,
  );
});

test("whatsappAutomationRuleBodySchema validates correct rule input", () => {
  const parsed = whatsappAutomationRuleBodySchema.safeParse({
    triggerEvent: "LEAD_CREATED",
    name: "Lead Welcome",
    isActive: true,
    templateName: "welcome_v1",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
    },
  });

  assert.equal(parsed.success, true);
});

test("whatsappAutomationRuleBodySchema accepts existing rule with metadata fields", () => {
  const parsed = whatsappAutomationRuleBodySchema.safeParse({
    id: "lead_created",
    outletId: "uefD786xcJf9DxgLUm0U",
    triggerEvent: "LEAD_CREATED",
    name: "Lead Welcome",
    isActive: true,
    templateName: "welcome_v1",
    languageCode: "en",
    recipientType: "CUSTOMER",
    parameterMapping: {
      body_1: "{{customerName}}",
    },
    createdAt: 1717000000000,
    updatedAt: 1717000000000,
  });

  assert.equal(parsed.success, true);
});

test("whatsappAutomationRuleBodySchema rejects invalid trigger event", () => {
  const parsed = whatsappAutomationRuleBodySchema.safeParse({
    triggerEvent: "UNKNOWN_EVENT",
    name: "Invalid Rule",
    templateName: "test",
    recipientType: "CUSTOMER",
    parameterMapping: {},
  });

  assert.equal(parsed.success, false);
});

test("whatsappAutomationTestBodySchema validates test send payload", () => {
  const parsed = whatsappAutomationTestBodySchema.safeParse({
    recipientNumber: "9876543210",
    templateName: "welcome_template",
    languageCode: "en",
    parameters: {
      body_1: "Test User",
    },
  });

  assert.equal(parsed.success, true);
});
