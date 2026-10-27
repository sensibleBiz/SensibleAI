import { DocumentReference, GeoPoint, Timestamp } from "firebase-admin/firestore";
import type { FirestoreValueType } from "./types.js";

export function detectFirestoreType(value: unknown): FirestoreValueType {
  if (value === null) return "null";
  if (value instanceof Timestamp || isTimestampLike(value)) return "Timestamp";
  if (value instanceof GeoPoint || isGeoPointLike(value)) return "GeoPoint";
  if (value instanceof DocumentReference || isDocumentReferenceLike(value)) return "DocumentReference";
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return "bytes";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "string": return "string";
    case "number": return "number";
    case "boolean": return "boolean";
    case "object": return "map/object";
    default: return "unknown";
  }
}

const isTimestampLike = (value: unknown): boolean => Boolean(value && typeof value === "object" &&
  typeof (value as { toDate?: unknown }).toDate === "function" &&
  typeof (value as { seconds?: unknown }).seconds === "number");
const isGeoPointLike = (value: unknown): boolean => Boolean(value && typeof value === "object" &&
  typeof (value as { latitude?: unknown }).latitude === "number" &&
  typeof (value as { longitude?: unknown }).longitude === "number");
const isDocumentReferenceLike = (value: unknown): boolean => Boolean(value && typeof value === "object" &&
  typeof (value as { path?: unknown }).path === "string" &&
  typeof (value as { get?: unknown }).get === "function");

