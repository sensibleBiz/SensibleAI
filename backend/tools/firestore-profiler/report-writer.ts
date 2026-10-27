import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FirestoreProfileReport, ProfileFinding } from "./types.js";

export async function writeReports(report: FirestoreProfileReport, outputDirectory: string): Promise<{ json: string; summary: string; findings: string }> {
  await mkdir(outputDirectory, { recursive: true });
  const json = path.join(outputDirectory, "firestore-profile.json");
  const summary = path.join(outputDirectory, "firestore-profile-summary.md");
  const findings = path.join(outputDirectory, "phase-4.2-findings.md");
  await writeFile(json, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "w", mode: 0o600 });
  await writeFile(summary, renderSummary(report), { encoding: "utf8", flag: "w", mode: 0o600 });
  await writeFile(findings, renderFindings(report.findings), { encoding: "utf8", flag: "w", mode: 0o600 });
  return { json, summary, findings };
}

const table = (rows: string[][]): string => rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`).join("\n");
const escapeCell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
const list = (values: string[]) => values.length ? values.map((value) => `- ${value}`).join("\n") : "None.";

function renderSummary(report: FirestoreProfileReport): string {
  const mixed = report.collections.flatMap((item) => item.mixedTypeFields.map((field) => `${item.collectionName}.${field}: ${item.detectedTypesPerField[field]?.join(", ")}`));
  const missing = report.collections.flatMap((item) => item.missingExpectedFields.map((field) => `${item.collectionName}.${field}`));
  const unexpected = report.collections.flatMap((item) => item.unexpectedFields.map((field) => `${item.collectionName}.${field}`));
  const enumDrift = report.collections.flatMap((item) => Object.values(item.enumProfiles).filter((profile) => profile.unknownValues.length).map((profile) => `${item.collectionName}.${profile.field}: ${profile.unknownValues.join(", ")}`));
  const orphans = report.collections.flatMap((item) => item.relationshipProfiles.filter((profile) => profile.orphanCount).map((profile) => `${item.collectionName}.${profile.field} -> ${profile.targetCollection}: ${profile.orphanCount}`));
  const tenant = report.collections.filter((item) => item.tenantOutletInconsistencyCount).map((item) => `${item.collectionName}: ${item.tenantOutletInconsistencyCount}`);
  const security = report.collections.find((item) => item.collectionName === "USER_PROFILE")?.legacyPasswordAudit;
  const large = report.collections.filter((item) => item.largeDocumentCount).map((item) => `${item.collectionName}: ${item.largeDocumentCount} large documents`);
  const blockers = report.findings.filter((item) => item.priority === "P0").map(findingLine);
  const amendments = [...new Set(report.findings.filter((item) => item.priority === "P0" || item.priority === "P1").map((item) => item.schemaContractImpact))];
  return `# Firestore Production Profile Summary\n\nGenerated: ${report.metadata.generatedAt}\n\n## 1. Executive summary\n\n${report.totalRecordsAnalyzed} records analyzed across ${report.collections.length} discovered collection types. P0: ${report.findings.filter((item) => item.priority === "P0").length}; P1: ${report.findings.filter((item) => item.priority === "P1").length}. Read-only profile; no credential values exported.\n\n## 2. Collection inventory\n\n${list(report.inventory.discoveredCollections)}\n\nUnexpected collections:\n\n${list(report.inventory.unexpectedCollections)}\n\n## 3. Record counts\n\n${table([["Collection", "Documents", "Drift"], ["---", "---:", "---"], ...report.collections.map((item) => [item.collectionName, String(item.totalDocumentCount), item.driftClassification])])}\n\n## 4. Schema drift\n\n${list(report.collections.filter((item) => item.driftClassification !== "MATCH").map((item) => `${item.collectionName}: ${item.driftClassification} — ${item.driftReasons.join("; ")}`))}\n\n## 5. Mixed types\n\n${list(mixed)}\n\n## 6. Missing fields\n\n${list(missing)}\n\n## 7. Unexpected fields\n\n${list(unexpected)}\n\n## 8. Enum/status drift\n\n${list(enumDrift)}\n\n## 9. Orphan relationships\n\n${list(orphans)}\n\n## 10. Tenant/outlet inconsistencies\n\n${list(tenant)}\n\n## 11. Security findings\n\n${security ? `Legacy password present: ${security.present}; missing: ${security.missing}; null/empty: ${security.empty}; types: ${security.types.join(", ") || "none"}. Values were not read into output or logs.` : "USER_PROFILE was not discovered."}\n\n## 12. Large document risks\n\n${list(large)}\n\n## 13. SHIFT findings\n\nEstimated volume: ${report.shiftContractProposal.estimatedRecordVolume}. Fields: ${report.shiftContractProposal.fields.join(", ") || "none"}. Proposed table: ${report.shiftContractProposal.proposedTable}. Risks: ${report.shiftContractProposal.risks.join("; ") || "none"}.\n\n## 14. Blocking migration issues\n\n${list(blockers)}\n\n## 15. Recommended contract amendments\n\n${list(amendments)}\n`;
}

function renderFindings(findings: ProfileFinding[]): string {
  const sections = (["P0", "P1", "P2", "P3"] as const).map((priority) => {
    const selected = findings.filter((finding) => finding.priority === priority);
    return `## ${priority}\n\n${selected.length ? selected.map((finding) => `### ${finding.collection}${finding.field ? `.${finding.field}` : ""}\n\n- Actual: ${finding.actualCondition}\n- Expected: ${finding.expectedCondition}\n- Affected records: ${finding.affectedRecordCount}\n- Recommended action: ${finding.recommendedAction}\n- Contract impact: ${finding.schemaContractImpact}`).join("\n\n") : "None."}`;
  });
  return `# Phase 4.2 Findings\n\nProduction source data was not modified. Sensitive credential values are excluded.\n\n${sections.join("\n\n")}\n`;
}

const findingLine = (finding: ProfileFinding): string => `${finding.collection}${finding.field ? `.${finding.field}` : ""}: ${finding.actualCondition} (${finding.affectedRecordCount}) — ${finding.recommendedAction}`;

