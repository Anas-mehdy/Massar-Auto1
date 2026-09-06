import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function requestFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
