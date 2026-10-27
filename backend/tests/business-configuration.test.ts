import assert from "node:assert/strict";
import test from "node:test";
import { saveBusinessConfigurationSchema } from "../src/modules/businessConfiguration/businessConfiguration.validator.js";
import { postgresLeadStageEnum } from "../src/modules/leads/postgresLead.validator.js";

const base = { businessModel: "b2b", vertical: "exports", templateVersion: "1.0.0", currency: "USD" };
const stage = { stageKey: "negotiation", displayName: "Negotiation", stageOrder: 4, stageCategory: "OPEN", tabColor: "#123456" };
test("configuration validates dynamic stages, fields and supported currencies", () => {
  const configuration = saveBusinessConfigurationSchema.parse({ ...base, pipelineStages: [stage], customFields: [{ fieldKey: "shipmentDate", fieldName: "Shipment Date", dataType: "date" }] });
  assert.equal(configuration.pipelineStages?.[0]?.stageKey, "NEGOTIATION");
  assert.equal(configuration.customFields?.[0]?.entityType, "lead");
  assert.equal(postgresLeadStageEnum.parse("negotiation"), "NEGOTIATION");
  assert.equal(postgresLeadStageEnum.safeParse("invalid stage").success, false);
  assert.equal(saveBusinessConfigurationSchema.safeParse({ ...base, currency: "X" }).success, false);
  assert.equal(saveBusinessConfigurationSchema.safeParse({ ...base, pipelineStages: [stage, stage] }).success, false);
  assert.equal(saveBusinessConfigurationSchema.safeParse({ ...base, pipelineStages: [{ ...stage, stageKey: "WON" }] }).success, false);
});
