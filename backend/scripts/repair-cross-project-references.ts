import { DocumentReference } from "firebase-admin/firestore";
import { firestore } from "../src/config/firebase.js";

// Firestore's Web SDK cannot retain references to another database. After a
// project migration it therefore logs a warning and treats an old reference as
// a reference to the same path in the active database. Re-saving each reference
// with the active Admin SDK client fixes the encoded project/database name.
//
// Dry run:
// npm run repair:cross-project-refs -- --document=USER_PROFILE/user-id
//
// Apply:
// npm run repair:cross-project-refs -- --document=USER_PROFILE/user-id --write

const args = process.argv.slice(2);
const shouldWrite = args.includes("--write");
const documentPaths = args
  .filter((argument) => argument.startsWith("--document="))
  .map((argument) => argument.slice("--document=".length).trim())
  .filter(Boolean);

if (documentPaths.length === 0) {
  throw new Error(
    "Pass at least one --document=<collection/document> argument. No documents were changed.",
  );
}

const uniqueDocumentPaths = [...new Set(documentPaths)];

for (const documentPath of uniqueDocumentPaths) {
  const segments = documentPath.split("/").filter(Boolean);
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new Error(`Invalid Firestore document path: ${documentPath}`);
  }
}

type RepairResult = {
  value: unknown;
  referenceCount: number;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const repairReferences = (value: unknown): RepairResult => {
  if (value instanceof DocumentReference) {
    return {
      value: firestore.doc(value.path),
      referenceCount: 1,
    };
  }

  if (Array.isArray(value)) {
    let referenceCount = 0;
    const repaired = value.map((item) => {
      const result = repairReferences(item);
      referenceCount += result.referenceCount;
      return result.value;
    });
    return { value: repaired, referenceCount };
  }

  if (isPlainObject(value)) {
    let referenceCount = 0;
    const repaired = Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const result = repairReferences(item);
        referenceCount += result.referenceCount;
        return [key, result.value];
      }),
    );
    return { value: repaired, referenceCount };
  }

  return { value, referenceCount: 0 };
};

let checked = 0;
let repaired = 0;
let references = 0;
let missing = 0;

for (const documentPath of uniqueDocumentPaths) {
  const documentReference = firestore.doc(documentPath);

  if (!shouldWrite) {
    const snapshot = await documentReference.get();
    checked += 1;

    if (!snapshot.exists) {
      missing += 1;
      console.warn(`Missing: ${documentPath}`);
      continue;
    }

    const result = repairReferences(snapshot.data());
    references += result.referenceCount;
    if (result.referenceCount > 0) repaired += 1;
    console.log(
      `${result.referenceCount > 0 ? "Would repair" : "No references in"} ${documentPath} (${result.referenceCount} reference(s))`,
    );
    continue;
  }

  const result = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(documentReference);
    if (!snapshot.exists) return { exists: false, referenceCount: 0 };

    const repair = repairReferences(snapshot.data());
    if (repair.referenceCount > 0) {
      transaction.set(documentReference, repair.value as Record<string, unknown>);
    }

    return { exists: true, referenceCount: repair.referenceCount };
  });

  checked += 1;
  if (!result.exists) {
    missing += 1;
    console.warn(`Missing: ${documentPath}`);
    continue;
  }

  references += result.referenceCount;
  if (result.referenceCount > 0) repaired += 1;
  console.log(
    `${result.referenceCount > 0 ? "Repaired" : "No references in"} ${documentPath} (${result.referenceCount} reference(s))`,
  );
}

console.log(
  `${shouldWrite ? "Repair" : "Dry run"} complete: ${checked} checked, ${repaired} ${
    shouldWrite ? "repaired" : "to repair"
  }, ${references} reference(s), ${missing} missing.`,
);
