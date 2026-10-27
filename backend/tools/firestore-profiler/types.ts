export type FirestoreValueType =
  | "string" | "number" | "boolean" | "null" | "Timestamp"
  | "GeoPoint" | "DocumentReference" | "array" | "map/object" | "bytes" | "unknown";

export type FieldClassification = "DEFINITE" | "CONDITIONAL" | "LEGACY" | "UNKNOWN";
export type DriftClassification = "MATCH" | "MINOR DRIFT" | "MAJOR DRIFT" | "BLOCKING DRIFT";
export type FindingPriority = "P0" | "P1" | "P2" | "P3";

export interface FieldProfile {
  presentCount: number;
  presentPercentage: number;
  nullCount: number;
  nullPercentage: number;
  emptyStringCount: number;
  emptyStringPercentage: number;
  emptyArrayCount: number;
  emptyArrayPercentage: number;
  emptyObjectCount: number;
  emptyObjectPercentage: number;
  types: FirestoreValueType[];
  classification: FieldClassification;
}

export interface ArrayProfile {
  field: string;
  count: number;
  emptyCount: number;
  emptyPercentage: number;
  maximumLength: number;
  averageLength: number;
  elementTypes: FirestoreValueType[];
  mixedElementTypes: boolean;
  largeArrayWarning: boolean;
}

export interface TimestampProfile {
  field: string;
  representations: string[];
  minimum?: string;
  maximum?: string;
  invalidCount: number;
  futureCount: number;
  veryOldCount: number;
  proposedConversion: string;
}

export interface IdentifierProfile {
  documentIdFormats: Record<string, number>;
  maximumDocumentIdLength: number;
  idsExceeding64Count: number;
  duplicateLogicalIds: Record<string, number>;
  compositeIdPatternCount: number;
}

export interface RelationshipProfile {
  field: string;
  targetCollection: string;
  validReferences: number;
  missingReferences: number;
  orphanCount: number;
  sampleOrphanIds: string[];
}

export interface EnumProfile {
  field: string;
  expectedValues: string[];
  actualValues: string[];
  unknownValues: string[];
  deprecatedValues: string[];
  actualValueCounts: Record<string, number>;
}

export interface CollectionProfileReport {
  collectionName: string;
  collectionPaths: string[];
  totalDocumentCount: number;
  distinctFieldNames: string[];
  fieldFrequencies: Record<string, number>;
  detectedTypesPerField: Record<string, string[]>;
  nullOrEmptyFrequencies: Record<string, number>;
  unexpectedFields: string[];
  missingExpectedFields: string[];
  distinctStatusValues: string[];
  minTimestamp?: string | number;
  maxTimestamp?: string | number;
  maxDocumentSizeBytes: number;
  documentSizeDistribution: Record<string, number>;
  maxArrayLengthPerField: Record<string, number>;
  malformedRecordCount: number;
  sampledDocumentCount: number;
  fieldProfiles: Record<string, FieldProfile>;
  arrayProfiles: Record<string, ArrayProfile>;
  timestampProfiles: Record<string, TimestampProfile>;
  identifierProfile: IdentifierProfile;
  enumProfiles: Record<string, EnumProfile>;
  relationshipProfiles: RelationshipProfile[];
  mixedTypeFields: string[];
  largeDocumentCount: number;
  tenantOutletInconsistencyCount: number;
  sampleTenantOutletIssues: string[];
  legacyPasswordAudit?: { present: number; missing: number; empty: number; types: string[] };
  driftClassification: DriftClassification;
  driftReasons: string[];
}

export interface ProfileFinding {
  priority: FindingPriority;
  collection: string;
  field?: string;
  actualCondition: string;
  expectedCondition: string;
  affectedRecordCount: number;
  recommendedAction: string;
  schemaContractImpact: string;
}

export interface ShiftContractProposal {
  estimatedRecordVolume: number;
  fields: string[];
  statusValues: string[];
  userReferenceFields: string[];
  timestampFields: string[];
  monetaryFields: string[];
  posAndInvoiceFields: string[];
  nestedFields: string[];
  proposedTable: string;
  proposedIndexes: string[];
  proposedForeignKeys: string[];
  tenantScoping: string;
  risks: string[];
}

export interface FirestoreProfileReport {
  metadata: {
    generatedAt: string;
    projectId: string;
    profileMode: "READ_ONLY";
    environment: string;
    batchSize: number;
    pauseMs: number;
    credentialValuesExported: false;
  };
  inventory: { expectedCollections: string[]; discoveredCollections: string[]; unexpectedCollections: string[] };
  collections: CollectionProfileReport[];
  totalRecordsAnalyzed: number;
  findings: ProfileFinding[];
  shiftContractProposal: ShiftContractProposal;
}
