export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}
export const asString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback)
export const asNumber = (value: unknown, fallback = 0): number => (typeof value === "number" && Number.isFinite(value) ? value : fallback)
export function stringify(value: unknown): string {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
export function errorText(value: unknown): string {
  if (typeof value === "string") return value
  const rec = asRecord(value)
  if (!rec) return ""
  return asString(rec.message) || asString(rec.error) || asString(rec.code) || stringify(rec)
}
