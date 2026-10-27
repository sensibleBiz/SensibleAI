import assert from "node:assert/strict";
import { test } from "node:test";
import { configureGoogleAiEnvironment } from "../../src/modules/assistant/googleAiEnvironment.js";

test("Google AI environment removes duplicate key and deprecated API flag", () => {
  const target: NodeJS.ProcessEnv = {
    GOOGLE_API_KEY: "old-google-key",
    GEMINI_API_KEY: "duplicate-key",
    GOOGLE_GENAI_USE_VERTEXAI: "false",
  };

  configureGoogleAiEnvironment({
    apiKey: "canonical-key",
    useEnterprise: false,
  }, target);

  assert.equal(target.GOOGLE_API_KEY, "canonical-key");
  assert.equal(target.GEMINI_API_KEY, undefined);
  assert.equal(target.GOOGLE_GENAI_USE_ENTERPRISE, "false");
  assert.equal(target.GOOGLE_GENAI_USE_VERTEXAI, undefined);
});

test("Google AI environment configures Enterprise project and location", () => {
  const target: NodeJS.ProcessEnv = {};

  configureGoogleAiEnvironment({
    useEnterprise: true,
    project: "example-project",
    location: "us-central1",
  }, target);

  assert.equal(target.GOOGLE_GENAI_USE_ENTERPRISE, "true");
  assert.equal(target.GOOGLE_CLOUD_PROJECT, "example-project");
  assert.equal(target.GOOGLE_CLOUD_LOCATION, "us-central1");
});
