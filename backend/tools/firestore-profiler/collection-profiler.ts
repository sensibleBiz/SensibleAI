import { FieldPath, type CollectionReference, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { ProfilerConfig } from "./config.js";
import { CONTRACT, compareSchema } from "./schema-comparator.js";
import { detectFirestoreType } from "./type-detector.js";
import { estimateDocumentBytes, flattenFields, idFormat, isEmptyObject, parseTimestamp } from "./field-profiler.js";
import type { ArrayProfile, CollectionProfileReport, FieldProfile, FirestoreValueType, ProfileFinding, TimestampProfile } from "./types.js";

interface FieldStats { present: number; nulls: number; emptyStrings: number; emptyArrays: number; emptyObjects: number; types: Set<FirestoreValueType> }
interface ArrayStats { count: number; empty: number; totalLength: number; maxLength: number; elementTypes: Set<FirestoreValueType> }
interface TimestampStats { representations: Set<string>; min?: string; max?: string; invalid: number; future: number; old: number }
export interface ReferenceObservation { sourceCollection: string; sourceId: string; outletId?: string; field: string; value: string; targetCollection: string }
export interface DocumentObservation { collection: string; id: string; outletId?: string; identities: string[]; references: ReferenceObservation[] }

const REFERENCE_TARGETS: Record<string, string> = {
  assignedTo: "USER_PROFILE", userId: "USER_PROFILE", employeeId: "USER_PROFILE", managerId: "USER_PROFILE",
  reportingManagerId: "USER_PROFILE", approvedBy: "USER_PROFILE", requestedBy: "USER_PROFILE",
  customerId: "CUSTOMERS", leadId: "LEADS_MANAGEMENT", leadRefId: "LEADS_MANAGEMENT",
  productId: "PRODUCT", product: "PRODUCT", categoryId: "CATEGORY", leaveTypeId: "LEAVE_TYPE",
  outletId: "OUTLET", outletID: "OUTLET", fromOutletId: "OUTLET", toOutletId: "OUTLET",
  businessId: "BUSINESSS_MASTER", businessID: "BUSINESSS_MASTER",
};
const IDENTITY_FIELDS: Record<string, Set<string>> = {
  USER_PROFILE: new Set(["uid", "userId", "employeeId", "id"]),
  LEADS_MANAGEMENT: new Set(["leadId", "id"]), CUSTOMERS: new Set(["customerId", "id"]),
  PRODUCT: new Set(["productId", "id"]), CATEGORY: new Set(["categoryId", "id"]),
  LEAVE_TYPE: new Set(["leaveTypeId", "id"]), OUTLET: new Set(["outletId", "id"]),
  BUSINESSS_MASTER: new Set(["businessId", "id"]),
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9\s()-]{5,19}$/;

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class CollectionProfiler {
  private readonly fields = new Map<string, FieldStats>();
  private readonly arrays = new Map<string, ArrayStats>();
  private readonly timestamps = new Map<string, TimestampStats>();
  private readonly enumValues = new Map<string, Map<string, number>>();
  private readonly paths = new Set<string>();
  private readonly idFormats = new Map<string, number>();
  private readonly logicalIds = new Map<string, Map<string, number>>();
  private readonly observations: DocumentObservation[] = [];
  private totalCount = 0;
  private scannedCount = 0;
  private maxSize = 0;
  private largeDocuments = 0;
  private malformed = 0;
  private maximumIdLength = 0;
  private longIds = 0;
  private compositeIds = 0;
  private outletInconsistencies = 0;
  private readonly outletSamples: string[] = [];
  private readonly sizeDistribution = { "0-10KB": 0, "10-100KB": 0, "100-500KB": 0, "500KB-1MB": 0, ">=1MB": 0 };
  private passwordPresent = 0;
  private passwordMissing = 0;
  private passwordEmpty = 0;
  private readonly passwordTypes = new Set<string>();

  constructor(private readonly collectionName: string, private readonly config: ProfilerConfig) {}

  async profile(references: CollectionReference<DocumentData>[]): Promise<{ report: CollectionProfileReport; findings: ProfileFinding[]; observations: DocumentObservation[] }> {
    for (const reference of references) {
      this.paths.add(reference.path);
      this.totalCount += (await reference.count().get()).data().count;
      let last: QueryDocumentSnapshot<DocumentData> | undefined;
      do {
        let query = reference.orderBy(FieldPath.documentId()).limit(this.config.batchSize);
        if (last) query = query.startAfter(last);
        const snapshot = await query.get();
        for (const document of snapshot.docs) this.observe(document, outletFromPath(reference.path));
        last = snapshot.docs.at(-1);
        if (snapshot.size === this.config.batchSize) await wait(this.config.pauseMs);
        if (snapshot.size < this.config.batchSize) break;
      } while (last);
    }
    const report = this.finalize();
    const comparison = compareSchema(report);
    report.driftClassification = comparison.classification;
    report.driftReasons = comparison.reasons;
    return { report, findings: comparison.findings, observations: this.observations };
  }

  private observe(document: QueryDocumentSnapshot<DocumentData>, parentOutletId?: string): void {
    const data = document.data() as Record<string, unknown>;
    this.scannedCount++;
    const format = idFormat(document.id);
    this.idFormats.set(format, (this.idFormats.get(format) ?? 0) + 1);
    this.maximumIdLength = Math.max(this.maximumIdLength, document.id.length);
    if (document.id.length > 64) this.longIds++;
    if (format === "composite") this.compositeIds++;

    const size = estimateDocumentBytes(document.id, data);
    this.maxSize = Math.max(this.maxSize, size);
    if (size >= this.config.largeDocumentBytes) this.largeDocuments++;
    const bucket = size < 10_000 ? "0-10KB" : size < 100_000 ? "10-100KB" : size < 500_000 ? "100-500KB" : size < 1_000_000 ? "500KB-1MB" : ">=1MB";
    this.sizeDistribution[bucket]++;

    const embeddedOutlet = stringValue(data.outletId) ?? stringValue(data.outletID);
    if (parentOutletId && embeddedOutlet && embeddedOutlet !== parentOutletId) {
      this.outletInconsistencies++;
      if (this.outletSamples.length < 20) this.outletSamples.push(document.id);
    }

    if (this.collectionName === "USER_PROFILE") {
      if (!("password" in data)) this.passwordMissing++;
      else {
        this.passwordPresent++;
        const password = data.password;
        this.passwordTypes.add(detectFirestoreType(password));
        if (password === null || password === "") this.passwordEmpty++;
      }
    }

    let badRecord = false;
    const flat = flattenFields(data);
    const references: ReferenceObservation[] = [];
    const identities = new Set<string>([document.id]);
    for (const [field, value] of Object.entries(flat)) {
      const stats = this.fields.get(field) ?? { present: 0, nulls: 0, emptyStrings: 0, emptyArrays: 0, emptyObjects: 0, types: new Set<FirestoreValueType>() };
      stats.present++;
      const type = detectFirestoreType(value);
      stats.types.add(type);
      if (value === null) stats.nulls++;
      if (value === "") stats.emptyStrings++;
      if (Array.isArray(value) && value.length === 0) stats.emptyArrays++;
      if (isEmptyObject(value)) stats.emptyObjects++;
      this.fields.set(field, stats);

      if (Array.isArray(value)) {
        const array = this.arrays.get(field) ?? { count: 0, empty: 0, totalLength: 0, maxLength: 0, elementTypes: new Set<FirestoreValueType>() };
        array.count++; array.totalLength += value.length; array.maxLength = Math.max(array.maxLength, value.length);
        if (!value.length) array.empty++;
        for (const item of value) array.elementTypes.add(detectFirestoreType(item));
        this.arrays.set(field, array);
      }

      if (field !== "password") {
        const parsed = parseTimestamp(value, field);
        if (parsed) {
          const timestamp = this.timestamps.get(field) ?? { representations: new Set<string>(), invalid: 0, future: 0, old: 0 };
          timestamp.representations.add(parsed.representation);
          if (parsed.invalid) timestamp.invalid++;
          else if (parsed.iso) {
            timestamp.min = !timestamp.min || parsed.iso < timestamp.min ? parsed.iso : timestamp.min;
            timestamp.max = !timestamp.max || parsed.iso > timestamp.max ? parsed.iso : timestamp.max;
            const milliseconds = Date.parse(parsed.iso);
            if (milliseconds > Date.now() + 86_400_000) timestamp.future++;
            if (milliseconds < Date.UTC(1990, 0, 1)) timestamp.old++;
          }
          this.timestamps.set(field, timestamp);
        }
      }

      const leaf = field.split(".").at(-1) ?? field;
      if (/^(status|stage|priority|role|customerType|enquiryType|attendanceStatus)$/i.test(leaf) && typeof value === "string") {
        const values = this.enumValues.get(field) ?? new Map<string, number>();
        if (values.has(value) || values.size < 1_000) values.set(value, (values.get(value) ?? 0) + 1);
        this.enumValues.set(field, values);
      }
      if (/email/i.test(leaf) && typeof value === "string" && value && !EMAIL.test(value)) badRecord = true;
      if (/(mobile|phone)/i.test(leaf) && typeof value === "string" && value && !PHONE.test(value)) badRecord = true;

      if (/Id$/i.test(leaf) && typeof value === "string") {
        const ids = this.logicalIds.get(field) ?? new Map<string, number>();
        ids.set(value, (ids.get(value) ?? 0) + 1);
        this.logicalIds.set(field, ids);
      }
      if ((IDENTITY_FIELDS[this.collectionName] ?? new Set(["id"])).has(leaf) && typeof value === "string" && value) identities.add(value);
      const target = REFERENCE_TARGETS[leaf] ?? REFERENCE_TARGETS[leaf.replace(/Ids$/, "Id")];
      const referenceValues = Array.isArray(value) ? value.map(stringValue).filter((item): item is string => Boolean(item)) : [stringValue(value)].filter((item): item is string => Boolean(item));
      if (target) for (const referenceValue of referenceValues) references.push({ sourceCollection: this.collectionName, sourceId: document.id, ...(parentOutletId ? { outletId: parentOutletId } : {}), field, value: referenceValue, targetCollection: target });
    }
    if (badRecord) this.malformed++;
    this.observations.push({ collection: this.collectionName, id: document.id, ...(parentOutletId ? { outletId: parentOutletId } : {}), identities: [...identities], references });
  }

  private finalize(): CollectionProfileReport {
    const contract = CONTRACT[this.collectionName] ?? { required: [], optional: [] };
    const expected = new Set([...contract.required, ...contract.optional]);
    const fieldProfiles: Record<string, FieldProfile> = {};
    const frequencies: Record<string, number> = {};
    const types: Record<string, string[]> = {};
    const nullOrEmpty: Record<string, number> = {};
    for (const [field, stats] of this.fields) {
      const percent = percentage(stats.present, this.scannedCount);
      const classification = expected.has(field) ? (percent >= 99 ? "DEFINITE" : "CONDITIONAL") : (/(legacy|old|deprecated)/i.test(field) ? "LEGACY" : "UNKNOWN");
      frequencies[field] = stats.present;
      types[field] = [...stats.types].sort();
      nullOrEmpty[field] = stats.nulls + stats.emptyStrings + stats.emptyArrays + stats.emptyObjects;
      fieldProfiles[field] = { presentCount: stats.present, presentPercentage: percent, nullCount: stats.nulls, nullPercentage: percentage(stats.nulls, stats.present), emptyStringCount: stats.emptyStrings, emptyStringPercentage: percentage(stats.emptyStrings, stats.present), emptyArrayCount: stats.emptyArrays, emptyArrayPercentage: percentage(stats.emptyArrays, stats.present), emptyObjectCount: stats.emptyObjects, emptyObjectPercentage: percentage(stats.emptyObjects, stats.present), types: [...stats.types].sort(), classification };
    }
    const arrayProfiles: Record<string, ArrayProfile> = {};
    for (const [field, stats] of this.arrays) arrayProfiles[field] = { field, count: stats.count, emptyCount: stats.empty, emptyPercentage: percentage(stats.empty, stats.count), maximumLength: stats.maxLength, averageLength: round(stats.totalLength / stats.count), elementTypes: [...stats.elementTypes].sort(), mixedElementTypes: stats.elementTypes.size > 1, largeArrayWarning: stats.maxLength >= this.config.largeArrayLength };
    const timestampProfiles: Record<string, TimestampProfile> = {};
    for (const [field, stats] of this.timestamps) timestampProfiles[field] = { field, representations: [...stats.representations].sort(), ...(stats.min ? { minimum: stats.min } : {}), ...(stats.max ? { maximum: stats.max } : {}), invalidCount: stats.invalid, futureCount: stats.future, veryOldCount: stats.old, proposedConversion: "Validate representation, convert deterministically to UTC, then load as PostgreSQL TIMESTAMPTZ/DATE" };
    const enumProfiles: CollectionProfileReport["enumProfiles"] = {};
    const enumFields = new Set([...Object.keys(contract.enums ?? {}), ...this.enumValues.keys()]);
    for (const field of enumFields) {
      const leaf = field.split(".").at(-1) ?? field;
      const expectedValues = contract.enums?.[field] ?? contract.enums?.[leaf] ?? [];
      const actualValueCounts = Object.fromEntries(this.enumValues.get(field) ?? new Map<string, number>());
      const actualValues = Object.keys(actualValueCounts).sort();
      enumProfiles[field] = { field, expectedValues, actualValues, unknownValues: expectedValues.length ? actualValues.filter((value) => !expectedValues.includes(value)) : [], deprecatedValues: [], actualValueCounts };
    }
    const duplicateLogicalIds: Record<string, number> = {};
    for (const [field, values] of this.logicalIds) duplicateLogicalIds[field] = [...values.values()].filter((count) => count > 1).length;
    const allTimestampValues = Object.values(timestampProfiles).flatMap((profile) => [profile.minimum, profile.maximum]).filter((value): value is string => Boolean(value)).sort();
    return {
      collectionName: this.collectionName, collectionPaths: [...this.paths].sort(), totalDocumentCount: this.totalCount,
      distinctFieldNames: [...this.fields.keys()].sort(), fieldFrequencies: frequencies, detectedTypesPerField: types,
      nullOrEmptyFrequencies: nullOrEmpty, unexpectedFields: [...this.fields.keys()].filter((field) => !expected.has(field) && !field.includes(".")).sort(),
      missingExpectedFields: contract.required.filter((field) => !this.fields.has(field)), distinctStatusValues: [...new Set([...this.enumValues.entries()].filter(([key]) => /status/i.test(key)).flatMap(([, values]) => [...values.keys()]))].sort(),
      ...(allTimestampValues[0] ? { minTimestamp: allTimestampValues[0] } : {}), ...(allTimestampValues.at(-1) ? { maxTimestamp: allTimestampValues.at(-1) } : {}),
      maxDocumentSizeBytes: this.maxSize, documentSizeDistribution: this.sizeDistribution, maxArrayLengthPerField: Object.fromEntries([...this.arrays].map(([field, stats]) => [field, stats.maxLength])),
      malformedRecordCount: this.malformed, sampledDocumentCount: this.scannedCount, fieldProfiles, arrayProfiles, timestampProfiles,
      identifierProfile: { documentIdFormats: Object.fromEntries(this.idFormats), maximumDocumentIdLength: this.maximumIdLength, idsExceeding64Count: this.longIds, duplicateLogicalIds, compositeIdPatternCount: this.compositeIds },
      enumProfiles, relationshipProfiles: [], mixedTypeFields: [...this.fields].filter(([, stats]) => stats.types.size > 1).map(([field]) => field).sort(), largeDocumentCount: this.largeDocuments,
      tenantOutletInconsistencyCount: this.outletInconsistencies, sampleTenantOutletIssues: this.outletSamples,
      ...(this.collectionName === "USER_PROFILE" ? { legacyPasswordAudit: { present: this.passwordPresent, missing: this.passwordMissing, empty: this.passwordEmpty, types: [...this.passwordTypes].sort() } } : {}),
      driftClassification: "MATCH", driftReasons: [],
    };
  }
}

const percentage = (part: number, total: number): number => total ? round(part * 100 / total) : 0;
const round = (value: number): number => Math.round(value * 100) / 100;
const stringValue = (value: unknown): string | undefined => typeof value === "string" && value ? value : value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : undefined;
const outletFromPath = (path: string): string | undefined => { const parts = path.split("/"); return parts[0] === "OUTLET" && parts.length >= 3 ? parts[1] : undefined; };
