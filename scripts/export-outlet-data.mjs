import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { initializeApp } from "firebase/app";
import {
  Bytes,
  DocumentReference,
  GeoPoint,
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  terminate,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCZ-qNuzdfc2BtorkZQ-IUoh6OWJnuZ_vM",
  authDomain: "sensiblecrm.firebaseapp.com",
  projectId: "sensiblecrm",
  storageBucket: "sensiblecrm.firebasestorage.app",
  messagingSenderId: "700529442570",
  appId: "1:700529442570:web:286030337f189f5cefc4f3",
};

const DEFAULT_OUTLET_ID = "uefD786xcJf9DxgLUm0U";
const EVENT_API_URL = "https://events-401022448274.asia-south1.run.app/event/get";

const OUTLET_COLLECTIONS = {
  ATTENDANCE: "dated",
  TEAM_TREE: "master",
  LEAD_TAG: "master",
  LEADS_MANAGEMENT: "dated",
  LEAD_ACTIVITIES: "dated",
  OUTLET_LEADS: "dated",
  CALL_LOGS: "dated",
  WHATSAPP_MESSAGES: "dated",
  PRODUCT: "master",
  EXPENSE: "dated",
  TRACKING_HISTORY: "dated",
  LEAVE_APPLICATION: "dated",
  EMPLOYEE_TARGETING: "dated",
  HOLIDAY: "dated",
  LEAVE_TYPE: "master",
  LEAVE_BALANCE: "master",
  SALARY_MASTER: "master",
  PAYROLL_CONFIG: "master",
  PAYROLL: "dated",
  PAYROLL_RULE_MASTER: "master",
  PF_RULE_MASTER: "master",
  ESI_RULE_MASTER: "master",
  PT_STATE_SLAB_MASTER: "master",
  LWF_STATE_RULE_MASTER: "master",
  BONUS_RULE_MASTER: "master",
  GRATUITY_RULE_MASTER: "master",
  EMPLOYEE_SALARY_STRUCTURE: "master",
  PAYROLL_RUN: "dated",
  PAYSLIP: "dated",
  PAYROLL_SETTINGS: "master",
  CATEGORY: "master",
  TRANSFER_REQUEST: "dated",
  SHIFT: "dated",
  MODULE_SUBSCRIPTION: "master",
  EVENTS: "dated",
  events: "dated",
  EVENT: "dated",
  event: "dated",
};

const PLURAL_OUTLET_COLLECTIONS = {
  SALARY_STRUCTURES: "master",
  PAYROLL_RUNS: "dated",
  PAYSLIPS: "dated",
  PAYROLL_SETTINGS: "master",
};

const DATE_KEY =
  /(?:^|_)(?:at|date|datetime|time|timestamp|month|day|year|from|to|start|end|expiry|renewal|scheduled|uploaded|modified|updated|created|checkin|checkout|paid|period)(?:$|_)/i;
const MIN_DATE_MS = Date.parse("2000-01-01T00:00:00.000Z");
const MAX_DATE_MS = Date.parse("2100-01-01T00:00:00.000Z");

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith("--")) continue;
    const [key, ...valueParts] = item.slice(2).split("=");
    args[key] = valueParts.length ? valueParts.join("=") : true;
  }
  return args;
}

function parseDate(value, label) {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${label} date: ${value}`);
  }
  return parsed;
}

function defaultStartDate(endDate, months) {
  const result = new Date(endDate);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function dateLabelInTimeZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function serialize(value) {
  if (value instanceof Timestamp) {
    return {
      __type: "firestore_timestamp",
      iso: value.toDate().toISOString(),
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (value instanceof GeoPoint) {
    return {
      __type: "firestore_geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }
  if (value instanceof DocumentReference) {
    return { __type: "firestore_reference", path: value.path };
  }
  if (value instanceof Bytes) {
    return { __type: "firestore_bytes", base64: value.toBase64() };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)])
    );
  }
  return value;
}

function numericDate(value) {
  if (!Number.isFinite(value)) return undefined;
  const milliseconds = value >= 10_000_000_000 ? value : value * 1000;
  return milliseconds >= MIN_DATE_MS && milliseconds <= MAX_DATE_MS
    ? milliseconds
    : undefined;
}

function stringDate(value, key) {
  const text = value.trim();
  if (!text) return undefined;

  let normalized = text;
  let match = text.match(/^(\d{2})-(\d{4})$/);
  if (match) normalized = `${match[2]}-${match[1]}-01`;

  match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) normalized = `${match[3]}-${match[2]}-${match[1]}`;

  const hasDateShape =
    /^\d{4}-\d{2}(?:-\d{2})?/.test(normalized) ||
    /^\d{4}\/\d{2}\/\d{2}/.test(normalized) ||
    /^\d{2}\/\d{2}\/\d{4}/.test(normalized) ||
    /^\d{4}-\d{2}-\d{2}T/.test(normalized);

  if (!DATE_KEY.test(key) && !hasDateShape) return undefined;

  const milliseconds = Date.parse(normalized);
  return Number.isFinite(milliseconds) &&
    milliseconds >= MIN_DATE_MS &&
    milliseconds <= MAX_DATE_MS
    ? milliseconds
    : undefined;
}

function collectDates(value, key = "", output = []) {
  if (value instanceof Timestamp) {
    output.push(value.toMillis());
    return output;
  }
  if (value instanceof Date) {
    output.push(value.getTime());
    return output;
  }
  if (typeof value === "number") {
    const parsed = numericDate(value);
    if (parsed !== undefined) output.push(parsed);
    return output;
  }
  if (typeof value === "string") {
    const parsed = stringDate(value, key);
    if (parsed !== undefined) output.push(parsed);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectDates(item, key, output));
    return output;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, item]) =>
      collectDates(item, childKey, output)
    );
  }
  return output;
}

function toExportRecord(snapshot) {
  return {
    __firestore: {
      documentId: snapshot.id,
      path: snapshot.ref.path,
    },
    ...serialize(snapshot.data()),
  };
}

function filterSnapshots(snapshots, mode, fromMs, toMs) {
  if (mode === "master") {
    return {
      records: snapshots.map(toExportRecord),
      sourceCount: snapshots.length,
      exportedCount: snapshots.length,
      excludedBeforeRange: 0,
      excludedAfterRange: 0,
      includedUndated: 0,
    };
  }

  const records = [];
  let excludedBeforeRange = 0;
  let excludedAfterRange = 0;
  let includedUndated = 0;

  for (const snapshot of snapshots) {
    const dates = collectDates(snapshot.data()).filter(Number.isFinite);
    if (!dates.length) {
      records.push(toExportRecord(snapshot));
      includedUndated += 1;
      continue;
    }

    if (dates.some((date) => date >= fromMs && date <= toMs)) {
      records.push(toExportRecord(snapshot));
    } else if (Math.max(...dates) < fromMs) {
      excludedBeforeRange += 1;
    } else {
      excludedAfterRange += 1;
    }
  }

  return {
    records,
    sourceCount: snapshots.length,
    exportedCount: records.length,
    excludedBeforeRange,
    excludedAfterRange,
    includedUndated,
  };
}

function profileBelongsToOutlet(data, documentId, outletId, teamProfileIds) {
  if (teamProfileIds.has(documentId) || teamProfileIds.has(String(data.id ?? ""))) {
    return true;
  }
  if (data.outletId === outletId) return true;
  if (Array.isArray(data.outlets) && data.outlets.includes(outletId)) return true;
  if (Array.isArray(data.outletIds) && data.outletIds.includes(outletId)) return true;
  if (
    Array.isArray(data.permissions) &&
    data.permissions.some((item) => item?.outletId === outletId)
  ) {
    return true;
  }
  if (
    Array.isArray(data.outletRoles) &&
    data.outletRoles.some((item) => item?.outletId === outletId)
  ) {
    return true;
  }
  return Boolean(
    data.sidebarMenuOrderByOutlet &&
      typeof data.sidebarMenuOrderByOutlet === "object" &&
      outletId in data.sidebarMenuOrderByOutlet
  );
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readCollection(db, segments) {
  const snapshot = await getDocs(collection(db, segments[0], ...segments.slice(1)));
  return snapshot.docs;
}

async function exportCollection({
  db,
  segments,
  mode,
  fromMs,
  toMs,
  outputRoot,
  relativeFile,
  manifest,
}) {
  const firestorePath = segments.join("/");
  try {
    const snapshots = await readCollection(db, segments);
    const result = filterSnapshots(snapshots, mode, fromMs, toMs);
    await writeJson(path.join(outputRoot, relativeFile), result.records);
    manifest.collections.push({
      firestorePath,
      file: relativeFile.replaceAll("\\", "/"),
      mode,
      ...Object.fromEntries(
        Object.entries(result).filter(([key]) => key !== "records")
      ),
      status: "exported",
    });
    console.log(`${firestorePath}: ${result.exportedCount}/${result.sourceCount}`);
    return snapshots;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    manifest.collections.push({
      firestorePath,
      file: relativeFile.replaceAll("\\", "/"),
      mode,
      status: "error",
      error: message,
    });
    console.warn(`${firestorePath}: ERROR - ${message}`);
    return [];
  }
}

async function exportDocument({ db, segments, outputRoot, relativeFile, manifest }) {
  const firestorePath = segments.join("/");
  try {
    const snapshot = await getDoc(doc(db, segments[0], ...segments.slice(1)));
    await writeJson(
      path.join(outputRoot, relativeFile),
      snapshot.exists() ? [toExportRecord(snapshot)] : []
    );
    manifest.collections.push({
      firestorePath,
      file: relativeFile.replaceAll("\\", "/"),
      mode: "master",
      sourceCount: snapshot.exists() ? 1 : 0,
      exportedCount: snapshot.exists() ? 1 : 0,
      status: "exported",
    });
    return snapshot;
  } catch (error) {
    manifest.collections.push({
      firestorePath,
      file: relativeFile.replaceAll("\\", "/"),
      mode: "master",
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

async function exportEventApi(outletId, fromDate, toDate, outputRoot, manifest) {
  const url = new URL(EVENT_API_URL);
  url.searchParams.set("outletId", outletId);
  url.searchParams.set("fromDate", fromDate.toISOString());
  url.searchParams.set("toDate", toDate.toISOString());
  const relativeFile = "external/event-api.json";

  try {
    const response = await fetch(url);
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    await writeJson(path.join(outputRoot, relativeFile), body);
    manifest.externalSources.push({
      source: "event API",
      url: url.toString(),
      file: relativeFile,
      status: "exported",
    });
  } catch (error) {
    manifest.externalSources.push({
      source: "event API",
      url: url.toString(),
      file: relativeFile,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outletId = String(args.outlet ?? DEFAULT_OUTLET_ID);
  const months = Number(args.months ?? 2);
  const toDate = parseDate(args.to, "to") ?? new Date();
  const fromDate = parseDate(args.from, "from") ?? defaultStartDate(toDate, months);

  if (!Number.isFinite(months) || months <= 0) throw new Error("--months must be positive");
  if (fromDate > toDate) throw new Error("--from must be earlier than --to");

  const outputRoot = path.resolve(
    String(
      args.output ??
        path.join(
          "exports",
          `outlet-${safeName(outletId)}-${dateLabelInTimeZone(
            fromDate,
            "Asia/Kolkata"
          )}-to-${dateLabelInTimeZone(toDate, "Asia/Kolkata")}`
        )
    )
  );
  await mkdir(outputRoot, { recursive: true });

  const app = initializeApp(firebaseConfig, `outlet-export-${Date.now()}`);
  const db = getFirestore(app);
  const manifest = {
    schemaVersion: 1,
    projectId: firebaseConfig.projectId,
    outletId,
    generatedAt: new Date().toISOString(),
    requestedRange: {
      fromInclusive: fromDate.toISOString(),
      toInclusive: toDate.toISOString(),
      timezoneRequested: "Asia/Kolkata",
    },
    policy: {
      masterCollections: "All records included so exported transactions retain their references.",
      datedCollections:
        "Records with any date in range are included. Undated records are included and counted to avoid silent loss.",
      userProfiles:
        "All fields are included for profiles linked by outlet fields/roles/permissions or TEAM_TREE references.",
    },
    discovery: {
      status: "static_application_audit",
      note:
        "Administrative listCollectionIds access was unavailable; paths were assembled from application constants, event fallbacks, and payroll schema/rules.",
    },
    collections: [],
    externalSources: [],
  };

  await exportDocument({
    db,
    segments: ["OUTLET", outletId],
    outputRoot,
    relativeFile: "outlet/OUTLET.json",
    manifest,
  });

  let teamSnapshots = [];
  for (const [collectionName, mode] of Object.entries(OUTLET_COLLECTIONS)) {
    const snapshots = await exportCollection({
      db,
      segments: ["OUTLET", outletId, collectionName],
      mode,
      fromMs: fromDate.getTime(),
      toMs: toDate.getTime(),
      outputRoot,
      relativeFile: `outlet/subcollections/${safeName(collectionName)}.json`,
      manifest,
    });
    if (collectionName === "TEAM_TREE") teamSnapshots = snapshots;
  }

  await exportDocument({
    db,
    segments: ["OUTLETS", outletId],
    outputRoot,
    relativeFile: "outlets_plural/OUTLETS.json",
    manifest,
  });

  const salaryStructures = [];
  const payrollRuns = [];
  for (const [collectionName, mode] of Object.entries(PLURAL_OUTLET_COLLECTIONS)) {
    const snapshots = await exportCollection({
      db,
      segments: ["OUTLETS", outletId, collectionName],
      mode,
      fromMs: fromDate.getTime(),
      toMs: toDate.getTime(),
      outputRoot,
      relativeFile: `outlets_plural/subcollections/${safeName(collectionName)}.json`,
      manifest,
    });
    if (collectionName === "SALARY_STRUCTURES") salaryStructures.push(...snapshots);
    if (collectionName === "PAYROLL_RUNS") payrollRuns.push(...snapshots);
  }

  for (const structure of salaryStructures) {
    await exportCollection({
      db,
      segments: ["OUTLETS", outletId, "SALARY_STRUCTURES", structure.id, "REVISIONS"],
      mode: "master",
      fromMs: fromDate.getTime(),
      toMs: toDate.getTime(),
      outputRoot,
      relativeFile: `outlets_plural/nested/SALARY_STRUCTURES/${safeName(
        structure.id
      )}/REVISIONS.json`,
      manifest,
    });
  }

  for (const run of payrollRuns) {
    for (const nestedCollection of ["EMPLOYEE_PAYROLLS", "AUDIT_LOGS"]) {
      await exportCollection({
        db,
        segments: ["OUTLETS", outletId, "PAYROLL_RUNS", run.id, nestedCollection],
        mode: "dated",
        fromMs: fromDate.getTime(),
        toMs: toDate.getTime(),
        outputRoot,
        relativeFile: `outlets_plural/nested/PAYROLL_RUNS/${safeName(
          run.id
        )}/${nestedCollection}.json`,
        manifest,
      });
    }
  }

  const teamProfileIds = new Set();
  for (const snapshot of teamSnapshots) {
    const data = snapshot.data();
    for (const candidate of [data.userProfileId, data.userId, data.uid]) {
      if (candidate) teamProfileIds.add(String(candidate));
    }
  }

  try {
    const allProfiles = await readCollection(db, ["USER_PROFILE"]);
    const profiles = allProfiles.filter((snapshot) =>
      profileBelongsToOutlet(snapshot.data(), snapshot.id, outletId, teamProfileIds)
    );
    await writeJson(
      path.join(outputRoot, "top_level/USER_PROFILE.json"),
      profiles.map(toExportRecord)
    );
    manifest.collections.push({
      firestorePath: "USER_PROFILE (filtered for outlet)",
      file: "top_level/USER_PROFILE.json",
      mode: "master",
      sourceCount: allProfiles.length,
      exportedCount: profiles.length,
      status: "exported",
    });
    console.log(`USER_PROFILE: ${profiles.length} outlet profiles`);
  } catch (error) {
    manifest.collections.push({
      firestorePath: "USER_PROFILE (filtered for outlet)",
      file: "top_level/USER_PROFILE.json",
      mode: "master",
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }

  for (const collectionName of ["INTEGRATION", "EVENTS", "events", "EVENT", "event"]) {
    try {
      const snapshots = await readCollection(db, [collectionName]);
      const outletSnapshots = snapshots.filter((snapshot) => {
        const data = snapshot.data();
        return (
          data.outletId === outletId ||
          (Array.isArray(data.outlets) && data.outlets.includes(outletId)) ||
          (Array.isArray(data.outletIds) && data.outletIds.includes(outletId))
        );
      });
      const mode = collectionName === "INTEGRATION" ? "master" : "dated";
      const result = filterSnapshots(
        outletSnapshots,
        mode,
        fromDate.getTime(),
        toDate.getTime()
      );
      const relativeFile = `top_level/${safeName(collectionName)}.json`;
      await writeJson(path.join(outputRoot, relativeFile), result.records);
      manifest.collections.push({
        firestorePath: `${collectionName} (filtered for outlet)`,
        file: relativeFile,
        mode,
        sourceCount: snapshots.length,
        outletSourceCount: outletSnapshots.length,
        exportedCount: result.exportedCount,
        excludedBeforeRange: result.excludedBeforeRange,
        excludedAfterRange: result.excludedAfterRange,
        includedUndated: result.includedUndated,
        status: "exported",
      });
    } catch (error) {
      manifest.collections.push({
        firestorePath: `${collectionName} (filtered for outlet)`,
        file: `top_level/${safeName(collectionName)}.json`,
        mode: collectionName === "INTEGRATION" ? "master" : "dated",
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await exportEventApi(outletId, fromDate, toDate, outputRoot, manifest);

  const exportedRecords = manifest.collections.reduce(
    (total, item) => total + Number(item.exportedCount ?? 0),
    0
  );
  const sourceRecords = manifest.collections.reduce(
    (total, item) => total + Number(item.sourceCount ?? 0),
    0
  );
  manifest.summary = {
    pathsChecked: manifest.collections.length,
    pathsExported: manifest.collections.filter((item) => item.status === "exported").length,
    pathsWithErrors: manifest.collections.filter((item) => item.status === "error").length,
    sourceRecordsChecked: sourceRecords,
    recordsExported: exportedRecords,
  };

  await writeJson(path.join(outputRoot, "manifest.json"), manifest);
  console.log(`Export complete: ${outputRoot}`);
  console.log(JSON.stringify(manifest.summary));
  await terminate(db);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
