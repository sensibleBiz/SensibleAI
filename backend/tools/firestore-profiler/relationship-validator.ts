import type { CollectionProfileReport, ProfileFinding, RelationshipProfile } from "./types.js";
import type { DocumentObservation } from "./collection-profiler.js";

export function validateRelationships(reports: CollectionProfileReport[], observations: DocumentObservation[], sampleLimit: number): ProfileFinding[] {
  const globallyScopedTargets = new Set(["USER_PROFILE", "OUTLET", "BUSINESSS_MASTER"]);
  const ids = new Set<string>();
  for (const observation of observations) {
    for (const identity of observation.identities) {
      ids.add(`${observation.collection}::${identity}`);
      if (observation.outletId) ids.add(`${observation.collection}:${observation.outletId}:${identity}`);
    }
  }
  const grouped = new Map<string, RelationshipProfile>();
  for (const observation of observations) {
    for (const reference of observation.references) {
      const key = `${reference.sourceCollection}|${reference.field}|${reference.targetCollection}`;
      const profile = grouped.get(key) ?? { field: reference.field, targetCollection: reference.targetCollection, validReferences: 0, missingReferences: 0, orphanCount: 0, sampleOrphanIds: [] };
      const globalKey = `${reference.targetCollection}::${reference.value}`;
      const scopedKey = reference.outletId ? `${reference.targetCollection}:${reference.outletId}:${reference.value}` : "";
      const isValid = reference.outletId && !globallyScopedTargets.has(reference.targetCollection) ? Boolean(scopedKey && ids.has(scopedKey)) : ids.has(globalKey) || Boolean(scopedKey && ids.has(scopedKey));
      if (isValid) profile.validReferences++;
      else {
        profile.missingReferences++; profile.orphanCount++;
        if (profile.sampleOrphanIds.length < sampleLimit) profile.sampleOrphanIds.push(reference.value);
      }
      grouped.set(key, profile);
    }
  }
  const findings: ProfileFinding[] = [];
  for (const [key, profile] of grouped) {
    const collection = key.split("|")[0] ?? "UNKNOWN";
    const report = reports.find((item) => item.collectionName === collection);
    report?.relationshipProfiles.push(profile);
    if (profile.orphanCount) findings.push({ priority: "P1", collection, field: profile.field, actualCondition: `${profile.orphanCount} orphan references to ${profile.targetCollection}`, expectedCondition: "Every logical reference resolves", affectedRecordCount: profile.orphanCount, recommendedAction: "Review and map or quarantine orphan records during ETL", schemaContractImpact: "Foreign-key load would fail" });
  }
  return findings;
}
