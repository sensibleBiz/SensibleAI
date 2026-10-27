import type { CollectionProfileReport, DriftClassification, ProfileFinding } from "./types.js";

export interface CollectionContract {
  required: string[];
  optional: string[];
  enums?: Record<string, string[]>;
}

// Contract v1.0 inputs available in this repository: Phase 4.1 SQL and current application schemas.
// Unknown fields are reported for review; this map is never changed from production observations.
export const CONTRACT: Record<string, CollectionContract> = {
  BUSINESSS_MASTER: { required: ["name"], optional: ["businessName", "ownerId", "createdAt", "updatedAt", "status"] },
  OUTLET: { required: ["name"], optional: ["outletName", "businessId", "businessRef", "ownerId", "address", "createdAt", "updatedAt", "status"] },
  USER_PROFILE: { required: [], optional: ["uid", "email", "mobile", "phone", "displayName", "name", "role", "roles", "permissions", "outletId", "outletIds", "businessId", "password", "createdAt", "updatedAt", "status", "isActive"] },
  QR_SESSIONS: { required: [], optional: ["userId", "outletId", "status", "createdAt", "expiresAt", "updatedAt"], enums: { status: ["ACTIVE", "EXPIRED", "CANCELLED"] } },
  TEAM_TREE: { required: [], optional: ["userId", "uid", "employeeId", "outletId", "businessId", "managerId", "reportingManagerId", "name", "email", "mobile", "role", "roleInZone", "department", "designation", "permissions", "stageAccessList", "status", "isActive", "createdAt", "updatedAt"] },
  MODULE_SUBSCRIPTION: { required: [], optional: ["module", "moduleId", "name", "enabled", "status", "createdAt", "updatedAt"] },
  LEADS_MANAGEMENT: { required: [], optional: ["leadId", "customerId", "assignedTo", "assignedHistory", "customerType", "enquiryType", "priority", "stage", "status", "name", "mobile", "phone", "email", "source", "createdDate", "createdAt", "updatedAt", "outletId", "businessId", "tags", "activities"] , enums: { customerType: ["PROSPECT", "CUSTOMER"], enquiryType: ["NEW_LEAD", "CUSTOMER_ENQUIRY"] } },
  LEAD_SHARE_TOKENS: { required: [], optional: ["leadId", "token", "createdBy", "expiresAt", "createdAt", "status"] },
  CUSTOMERS: { required: [], optional: ["customerId", "leadId", "name", "mobile", "phone", "email", "priority", "status", "outletId", "businessId", "createdAt", "updatedAt"], enums: { status: ["ACTIVE", "INACTIVE"] } },
  CUSTOMER_IDENTITIES: { required: [], optional: ["customerId", "type", "value", "normalizedValue", "outletId", "createdAt", "updatedAt"] },
  LEAD_ACTIVITIES: { required: [], optional: ["leadRefId", "leadId", "userId", "assignedTo", "type", "title", "description", "priority", "status", "dueDate", "createdAt", "updatedAt"], enums: { status: ["PENDING", "DONE"] } },
  CALL_LOGS: { required: [], optional: ["leadId", "customerId", "userId", "assignedTo", "phone", "mobile", "duration", "status", "direction", "timestamp", "createdAt", "outletId"] },
  ATTENDANCE: { required: [], optional: ["userId", "employeeId", "outletId", "attendanceStatus", "date", "checkIn", "checkOut", "location", "checkInLocation", "checkOutLocation", "createdAt", "updatedAt"], enums: { attendanceStatus: ["PRESENT", "ON_LEAVE", "ABSENT"] } },
  LEAVE_APPLICATION: { required: [], optional: ["userId", "employeeId", "leaveTypeId", "startDate", "endDate", "reason", "status", "outletId", "createdAt", "updatedAt", "approvedBy"], enums: { status: ["REQUESTED", "APPROVED", "REJECTED"] } },
  LEAVE_BALANCE: { required: [], optional: ["userId", "employeeId", "leaveTypeId", "year", "balance", "used", "outletId", "createdAt", "updatedAt"] },
  LEAVE_TYPE: { required: [], optional: ["name", "code", "days", "status", "isActive", "outletId", "createdAt", "updatedAt"] },
  HOLIDAY: { required: [], optional: ["name", "date", "description", "outletId", "createdAt", "updatedAt"] },
  SALARY_MASTER: { required: [], optional: ["userId", "employeeId", "salary", "components", "salaryRevisions", "effectiveFrom", "status", "outletId", "createdAt", "updatedAt"] },
  PAYROLL: { required: [], optional: ["payrollKey", "userId", "employeeId", "month", "year", "status", "grossSalary", "netSalary", "components", "audit", "auditTrail", "outletId", "createdAt", "updatedAt"], enums: { status: ["DRAFT", "GENERATED", "CALCULATED", "APPROVED", "PAID", "CANCELLED"] } },
  EXPENSE: { required: [], optional: ["userId", "employeeId", "amount", "categoryId", "description", "status", "outletId", "createdAt", "updatedAt", "statusChangedBy", "statusChangedAt", "statusVersion"], enums: { status: ["PENDING", "REVIEWED", "APPROVED", "REJECTED"] } },
  EXPENSE_BUDGET: { required: [], optional: ["name", "amount", "allocatedAmount", "spentAmount", "categoryId", "userId", "status", "outletId", "period", "createdAt", "updatedAt"], enums: { status: ["ACTIVE"] } },
  PRODUCT: { required: [], optional: ["name", "sku", "uid", "uids", "uidMap", "categoryId", "quantity", "price", "status", "outletId", "createdAt", "updatedAt"] },
  CATEGORY: { required: [], optional: ["name", "description", "status", "outletId", "createdAt", "updatedAt"] },
  TRANSFER_REQUEST: { required: [], optional: ["productId", "product", "fromOutletId", "toOutletId", "quantity", "status", "requestedBy", "approvedBy", "createdAt", "updatedAt"], enums: { status: ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"] } },
  TRACKING_HISTORY: { required: [], optional: ["userId", "employeeId", "latitude", "longitude", "location", "timestamp", "outletId", "createdAt"] },
  WHATSAPP_MESSAGES: { required: [], optional: ["leadId", "customerId", "mobile", "phone", "sentMsgList", "replyMsgList", "status", "outletId", "createdAt", "updatedAt"], enums: { status: ["sent", "delivered", "read", "failed"] } },
  AUTOLEAD_ASSIGN: { required: [], optional: ["userId", "assignedTo", "rules", "enabled", "status", "outletId", "createdAt", "updatedAt"] },
  ContactKeyword: { required: [], optional: ["keyword", "category", "status", "outletId", "createdAt", "updatedAt"] },
  CONTACTS: { required: [], optional: ["name", "mobile", "phone", "email", "company", "status", "outletId", "createdAt", "updatedAt"] },
  SHIFT: { required: [], optional: [] },
};

export function compareSchema(report: CollectionProfileReport): { classification: DriftClassification; reasons: string[]; findings: ProfileFinding[] } {
  const reasons: string[] = [];
  const findings: ProfileFinding[] = [];
  if (report.identifierProfile.idsExceeding64Count > 0) {
    reasons.push(`${report.identifierProfile.idsExceeding64Count} document IDs exceed legacy_id VARCHAR(64)`);
    findings.push({ priority: "P0", collection: report.collectionName, field: "__name__", actualCondition: "IDs longer than 64 characters", expectedCondition: "legacy_id length <= 64", affectedRecordCount: report.identifierProfile.idsExceeding64Count, recommendedAction: "Amend contract width or introduce a lossless ID mapping", schemaContractImpact: "Blocking VARCHAR(64) incompatibility" });
  }
  if (report.mixedTypeFields.length) {
    reasons.push(`mixed types: ${report.mixedTypeFields.join(", ")}`);
    findings.push({ priority: "P2", collection: report.collectionName, actualCondition: `Mixed types in ${report.mixedTypeFields.join(", ")}`, expectedCondition: "One SQL-compatible type per field", affectedRecordCount: report.sampledDocumentCount, recommendedAction: "Define explicit lossless ETL conversions", schemaContractImpact: "Column conversion rules required" });
  }
  if (report.missingExpectedFields.length) reasons.push(`missing expected fields: ${report.missingExpectedFields.join(", ")}`);
  if (report.unexpectedFields.length) reasons.push(`unexpected fields: ${report.unexpectedFields.join(", ")}`);
  for (const enumProfile of Object.values(report.enumProfiles)) {
    if (enumProfile.unknownValues.length) {
      reasons.push(`${enumProfile.field} unknown enums: ${enumProfile.unknownValues.join(", ")}`);
      const affected = enumProfile.unknownValues.reduce((sum, value) => sum + (enumProfile.actualValueCounts[value] ?? 0), 0);
      findings.push({ priority: "P1", collection: report.collectionName, field: enumProfile.field, actualCondition: `Unknown values: ${enumProfile.unknownValues.join(", ")}`, expectedCondition: `Allowed: ${enumProfile.expectedValues.join(", ")}`, affectedRecordCount: affected, recommendedAction: "Review values and approve ETL mapping; do not normalize source", schemaContractImpact: "Enum amendment or mapping decision required" });
    }
  }
  if (report.tenantOutletInconsistencyCount) findings.push({ priority: "P1", collection: report.collectionName, field: "outletId", actualCondition: "Record scope disagrees with parent outlet", expectedCondition: "Parent and embedded outlet IDs agree", affectedRecordCount: report.tenantOutletInconsistencyCount, recommendedAction: "Resolve ownership before migration", schemaContractImpact: "Tenant isolation integrity risk" });
  if (report.largeDocumentCount) findings.push({ priority: "P2", collection: report.collectionName, actualCondition: "Large Firestore documents", expectedCondition: "Rows/nested children fit target design", affectedRecordCount: report.largeDocumentCount, recommendedAction: "Split large nested arrays into child tables during ETL", schemaContractImpact: "Child table may be required" });
  const classification: DriftClassification = report.identifierProfile.idsExceeding64Count ? "BLOCKING DRIFT" :
    report.tenantOutletInconsistencyCount || Object.values(report.enumProfiles).some((value) => value.unknownValues.length) ? "MAJOR DRIFT" :
    reasons.length ? "MINOR DRIFT" : "MATCH";
  return { classification, reasons, findings };
}
