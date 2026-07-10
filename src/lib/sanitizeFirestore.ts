import { DocumentReference, FieldValue, GeoPoint, Timestamp } from "firebase/firestore";

/**
 * Values Firestore accepts as-is and must not be walked as plain objects.
 * (Walking `serverTimestamp()` as a POJO breaks the sentinel and causes "invalid data".)
 */
function isFirestoreDocumentValue(v: unknown): boolean {
  if (v === null || typeof v !== "object") return false;
  return (
    v instanceof FieldValue ||
    v instanceof Timestamp ||
    v instanceof GeoPoint ||
    v instanceof DocumentReference
  );
}

/**
 * Firestore rejects `undefined` in document data (including nested objects for some fields).
 * Use this for shallow top-level payloads before addDoc/setDoc/updateDoc when values may be optional.
 */
export function dropUndefinedFields<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    const v = data[key as keyof T];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function isPlainObject(o: unknown): o is Record<string, unknown> {
  if (o === null || typeof o !== "object") return false;
  return Object.getPrototypeOf(o) === Object.prototype;
}

/**
 * Recursively removes keys whose value is `undefined` (nested plain objects only).
 * Does not traverse Firestore FieldValue, Timestamp, Date, arrays of non-plain objects, etc.
 */
/**
 * Recursive Firestore-safe object: omits `undefined` keys (nested plain objects only).
 * Prefer this for `addDoc` / `setDoc` payloads that may contain optional nested fields.
 */
export function sanitizeForFirestore<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return stripUndefinedDeep(obj) as Record<string, unknown>;
}

export function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (isFirestoreDocumentValue(value)) return value;
  if (Array.isArray(value)) {
    return value.map((x) => stripUndefinedDeep(x));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      const v = stripUndefinedDeep(value[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return value;
}
