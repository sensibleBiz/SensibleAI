import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { TransactionDatabase } from "../src/db/context.js";
import { postgresAuthorizationRepository } from "../src/modules/authorization/postgresAuthorization.repository.js";
import { postgresLeadRepository } from "../src/modules/leads/postgresLead.repository.js";
import { postgresLeadService } from "../src/modules/leads/postgresLead.service.js";
import type { LeadBulkCreateInput } from "../src/types/lead.types.js";

const originalGetOutletBusinessId = postgresLeadRepository.getOutletBusinessId;
const originalLockBulkImport = postgresLeadRepository.lockBulkImport;
const originalFindExistingExternalRefs = postgresLeadRepository.findExistingExternalRefs;
const originalCreate = postgresLeadRepository.create;
const originalRecordStageHistory = postgresLeadRepository.recordStageHistory;
const originalHasOutletPermission = postgresAuthorizationRepository.hasOutletPermission;

afterEach(() => {
  postgresLeadRepository.getOutletBusinessId = originalGetOutletBusinessId;
  postgresLeadRepository.lockBulkImport = originalLockBulkImport;
  postgresLeadRepository.findExistingExternalRefs = originalFindExistingExternalRefs;
  postgresLeadRepository.create = originalCreate;
  postgresLeadRepository.recordStageHistory = originalRecordStageHistory;
  postgresAuthorizationRepository.hasOutletPermission = originalHasOutletPermission;
});

const bulkLead = (
  externalId: string,
  customerName: string,
): LeadBulkCreateInput["leads"][number] => ({
  rowNumber: 2,
  externalId,
  adId: "ad-1",
  originalCreatedAt: Date.UTC(2026, 8, 29, 8),
  customerName,
  mobile: "9999999999",
  city: "Pune",
  source: "Facebook",
  requirement: "New Leads ad",
  leadCampaign: "September campaign",
  inboxUrl: "https://business.facebook.com/latest/example",
});

test("PostgreSQL bulk import authenticates once and safely skips duplicate external IDs", async () => {
  const createdValues: Record<string, unknown>[] = [];
  let lockCount = 0;

  postgresLeadRepository.getOutletBusinessId = async () => "business-1";
  postgresAuthorizationRepository.hasOutletPermission = async () => true;
  postgresLeadRepository.lockBulkImport = async () => { lockCount += 1; };
  postgresLeadRepository.findExistingExternalRefs = async () => new Set(["existing"]);
  postgresLeadRepository.create = async (_database, values) => { createdValues.push(values); };
  postgresLeadRepository.recordStageHistory = async () => {};

  const result = await postgresLeadService.createBulk(
    {} as TransactionDatabase,
    "tenant-1",
    "user-1",
    {
      outletId: "outlet-1",
      leads: [
        bulkLead("new", "First copy"),
        bulkLead("new", "Duplicate copy"),
        bulkLead("existing", "Already imported"),
      ],
    },
  );

  assert.equal(lockCount, 1);
  assert.deepEqual(result, { created: 1, skippedDuplicates: 2 });
  assert.equal(createdValues.length, 1);
  assert.equal(createdValues[0]?.customerName, "First copy");
  assert.equal(createdValues[0]?.externalRef, "new");
  assert.equal(createdValues[0]?.campaign, "September campaign");
  assert.match(String(createdValues[0]?.comments), /Original lead time:/);
});
