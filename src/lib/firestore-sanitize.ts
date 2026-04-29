function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Firestore rejects undefined values anywhere in a document payload.
 * Remove them while preserving null, Dates, FieldValues, and other non-plain objects.
 */
export function stripUndefinedForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedForFirestore(item))
      .filter((item) => item !== undefined) as T;
  }

  if (!isPlainObject(value)) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    sanitized[key] = stripUndefinedForFirestore(item);
  }
  return sanitized as T;
}
