import assert from "node:assert/strict";
import test from "node:test";
import { finishWorkspaceSetup, shouldSkipSetup, workspaceDestination } from "../../src/features/onboarding/setupNavigation.js";

test("new accounts enter setup; configured accounts preserve the requested destination", () => {
  assert.equal(workspaceDestination({ isConfigured: false }, "/dashboard", "/leads"), "/setup");
  assert.equal(workspaceDestination({ isConfigured: true }, "/dashboard", "/leads"), "/leads");
  assert.equal(workspaceDestination({ isConfigured: true }, "/dashboard"), "/dashboard");
  assert.equal(workspaceDestination(null, "/dashboard"), "/dashboard");
  assert.equal(shouldSkipSetup(true, false), true);
  assert.equal(shouldSkipSetup(true, true), false);
  assert.equal(shouldSkipSetup(false, false), false);
});

test("wizard navigation waits for successful persistence", async () => {
  const events: string[] = [];
  await finishWorkspaceSetup(async () => { events.push("saved"); return { isConfigured: true }; }, (configuration) => {
    assert.equal(configuration.isConfigured, true);
    events.push("dashboard");
  });
  assert.deepEqual(events, ["saved", "dashboard"]);
  await assert.rejects(finishWorkspaceSetup(async () => { throw new Error("Save failed"); }, () => { events.push("unexpected navigation"); }));
  assert.deepEqual(events, ["saved", "dashboard"]);
});
