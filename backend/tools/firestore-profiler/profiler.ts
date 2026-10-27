import type { Firestore } from "firebase-admin/firestore";
import { EXPECTED_COLLECTIONS } from "./config.js";
import type { ProfilerConfig } from "./config.js";
import { CollectionProfiler, type DocumentObservation } from "./collection-profiler.js";
import { discoverCollections } from "./subcollection-profiler.js";
import { validateRelationships } from "./relationship-validator.js";
import type { FirestoreProfileReport, ProfileFinding, ShiftContractProposal } from "./types.js";

export async function profileFirestore(firestore: Firestore, config: ProfilerConfig): Promise<FirestoreProfileReport> {
  const inventory = await discoverCollections(firestore, config);
  const collections = [];
  const findings: ProfileFinding[] = [];
  const observations: DocumentObservation[] = [];
  for (const name of [...inventory.references.keys()].sort()) {
    const result = await new CollectionProfiler(name, config).profile(inventory.references.get(name) ?? []);
    collections.push(result.report);
    findings.push(...result.findings);
    observations.push(...result.observations);
  }
  findings.push(...validateRelationships(collections, observations, config.orphanSampleLimit));
  for (const collection of collections) {
    for (const relationship of collection.relationshipProfiles) {
      if (relationship.orphanCount && collection.driftClassification !== "BLOCKING DRIFT") collection.driftClassification = "MAJOR DRIFT";
    }
  }
  const discoveredCollections = [...inventory.discoveredCollections].sort();
  const shiftContractProposal = shiftProposal(collections.find((item) => item.collectionName === "SHIFT"));
  if (shiftContractProposal.estimatedRecordVolume === 0) findings.push({ priority: "P1", collection: "SHIFT", actualCondition: "No production records were available for empirical schema discovery", expectedCondition: "Production samples sufficient to validate fields, types, relationships and values", affectedRecordCount: 0, recommendedAction: "Review the proposed amendment with POS owners and profile a representative fixture before creating SQL", schemaContractImpact: "SHIFT contract remains provisional" });
  return {
    metadata: { generatedAt: new Date().toISOString(), projectId: config.projectId, profileMode: "READ_ONLY", environment: config.environment, batchSize: config.batchSize, pauseMs: config.pauseMs, credentialValuesExported: false },
    inventory: { expectedCollections: [...EXPECTED_COLLECTIONS], discoveredCollections, unexpectedCollections: discoveredCollections.filter((name) => !EXPECTED_COLLECTIONS.includes(name as never)) },
    collections,
    totalRecordsAnalyzed: collections.reduce((sum, collection) => sum + collection.sampledDocumentCount, 0),
    findings,
    shiftContractProposal,
  };
}

function shiftProposal(shift: FirestoreProfileReport["collections"][number] | undefined): ShiftContractProposal {
  const fields = shift?.distinctFieldNames ?? [];
  const matches = (pattern: RegExp) => fields.filter((field) => pattern.test(field));
  const risks = !shift || shift.totalDocumentCount === 0 ? ["No production SHIFT records were available; schema proposal is provisional"] : [...shift.mixedTypeFields.map((field) => `mixed type: ${field}`), ...(shift.identifierProfile.idsExceeding64Count ? ["IDs exceed 64 characters"] : []), ...Object.values(shift.arrayProfiles).filter((profile) => profile.largeArrayWarning).map((profile) => `large array: ${profile.field}`)];
  return {
    estimatedRecordVolume: shift?.totalDocumentCount ?? 0, fields, statusValues: shift?.distinctStatusValues ?? [],
    userReferenceFields: matches(/(^|\.)(user|employee|openedBy|closedBy).*id$/i), timestampFields: matches(/date|time|created|updated|opened|closed/i),
    monetaryFields: matches(/cash|amount|total|opening|closing|balance/i), posAndInvoiceFields: matches(/pos|invoice|payment/i), nestedFields: fields.filter((field) => field.includes(".") || shift?.detectedTypesPerField[field]?.some((type) => type === "array" || type === "map/object")),
    proposedTable: "inventory.shifts (id uuid, tenant_id uuid, outlet_id uuid, legacy_id varchar, opened_by uuid, closed_by uuid, opened_at timestamptz, closed_at timestamptz, opening_cash numeric, closing_cash numeric, status text, source_payload jsonb)",
    proposedIndexes: ["(tenant_id, outlet_id, opened_at DESC)", "(tenant_id, outlet_id, status)", "UNIQUE (tenant_id, outlet_id, legacy_id)"],
    proposedForeignKeys: ["tenant_id -> tenancy.tenants", "outlet_id -> tenancy.outlets", "opened_by/closed_by -> iam.users"], tenantScoping: "Mandatory tenant_id and outlet_id with forced RLS; preserve source outlet parent path", risks,
  };
}
