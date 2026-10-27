import { Timestamp } from "firebase-admin/firestore";
import { detectFirestoreType } from "./type-detector.js";
import type { FirestoreValueType } from "./types.js";

export const flattenFields = (value: Record<string, unknown>, prefix = ""): Record<string, unknown> => {
  const flattened: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    flattened[name] = child;
    if (detectFirestoreType(child) === "map/object") Object.assign(flattened, flattenFields(child as Record<string, unknown>, name));
  }
  return flattened;
};

export const isEmptyObject = (value: unknown): boolean => detectFirestoreType(value) === "map/object" && Object.keys(value as object).length === 0;

export function estimateDocumentBytes(id: string, data: Record<string, unknown>): number {
  return Buffer.byteLength(id, "utf8") + estimateValueBytes(data);
}

function estimateValueBytes(value: unknown): number {
  const type = detectFirestoreType(value);
  if (type === "null") return 1;
  if (type === "string") return Buffer.byteLength(value as string, "utf8");
  if (type === "number" || type === "Timestamp" || type === "GeoPoint") return 16;
  if (type === "boolean") return 1;
  if (type === "bytes") return (value as Uint8Array).byteLength;
  if (type === "DocumentReference") return Buffer.byteLength((value as { path: string }).path, "utf8");
  if (type === "array") return (value as unknown[]).reduce<number>((sum, item) => sum + estimateValueBytes(item), 0);
  if (type === "map/object") return Object.entries(value as Record<string, unknown>).reduce((sum, [key, item]) => sum + Buffer.byteLength(key) + estimateValueBytes(item), 0);
  return 0;
}

export interface ParsedTimestamp { representation: string; iso?: string; invalid: boolean }

export function parseTimestamp(value: unknown, fieldName: string): ParsedTimestamp | undefined {
  if (!/(date|time|created|updated|start|end|month|year|checkin|checkout|expires|effective)/i.test(fieldName)) return undefined;
  if (value instanceof Timestamp || (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function")) {
    const date = (value as { toDate(): Date }).toDate();
    return { representation: "Firestore Timestamp", iso: date.toISOString(), invalid: false };
  }
  if (typeof value === "number") {
    const representation = Math.abs(value) < 100_000_000_000 ? "epoch seconds" : "epoch milliseconds";
    const date = new Date(representation === "epoch seconds" ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? { representation, invalid: true } : { representation, iso: date.toISOString(), invalid: false };
  }
  if (typeof value === "string") {
    let representation = "date string";
    let date: Date;
    const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
    const my = /^(\d{2})-(\d{2}|\d{4})$/.exec(value);
    if (dmy) { representation = "DD-MM-YYYY"; date = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))); }
    else if (my) { representation = "MM-YY"; const year = Number(my[2]) < 100 ? 2000 + Number(my[2]) : Number(my[2]); date = new Date(Date.UTC(year, Number(my[1]) - 1, 1)); }
    else { representation = "ISO/string"; date = new Date(value); }
    return Number.isNaN(date.getTime()) ? { representation, invalid: true } : { representation, iso: date.toISOString(), invalid: false };
  }
  return undefined;
}

export function idFormat(id: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return "UUID";
  if (/^[A-Za-z0-9]{20}$/.test(id)) return "Firestore auto-ID";
  if (/^\d+$/.test(id)) return "numeric";
  if (/^[^/]+[_:-][^/]+/.test(id)) return "composite";
  return "other";
}

export function valueTypes(values: Iterable<unknown>): FirestoreValueType[] {
  return [...new Set([...values].map(detectFirestoreType))].sort();
}
