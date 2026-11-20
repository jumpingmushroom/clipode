// Replaces personal and instance data in a recorded response, so it can be committed as a fixture.
// Keeps structure, enum values, timestamps, numbers and booleans; everything else becomes invented text.

// Keys whose values are enums or codes. They are kept only when the value also looks like a token.
const ENUM_KEYS = new Set([
  "sourceKind", "kind", "status", "severity", "type", "priority", "role", "adapterType", "approvalType",
  "requestedResolverPolicy", "effectiveResolverPolicy", "effectiveResolverPolicySource", "resolverPolicyProvenance",
  "outcome", "livenessState", "invocationSource", "entityType", "action", "actorType", "errorCode", "deploymentMode",
  "deploymentExposure", "bootstrapStatus", "version", "scopeKind", "logStore", "lastOutputStream", "state",
  "decideBy", "reason", "sort", "authKind", "stream", "level", "originKind", "workMode", "selectionMode",
  "continuationPolicy", "answerMode", "schema", "resolverPolicy", "requested", "effective", "displayStatus",
  "visibility", "reviewPolicy", "approvalStatus", "triggerDetail", "model", "provider", "billingType", "source",
  "capabilities", "pauseReason", "wakeReason", "contextKind", "biller",
])
const TOKEN = /^[a-z0-9][a-z0-9_.:+-]{0,63}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IDENTIFIER = /^[A-Z][A-Z0-9]{1,9}-\d+$/

export function createScrubber() {
  const ids = new Map<string, string>()
  const identifiers = new Map<string, string>()

  const fakeUuid = (real: string) => {
    if (!ids.has(real)) ids.set(real, `00000000-0000-4000-8000-${(ids.size + 1).toString(16).padStart(12, "0")}`)
    return ids.get(real)!
  }
  const fakeIdentifier = (real: string) => {
    if (!identifiers.has(real)) identifiers.set(real, `DEMO-${identifiers.size + 1}`)
    return identifiers.get(real)!
  }

  const scrubString = (key: string, value: string, parentKey: string): string => {
    if (value === "") return value
    if (UUID.test(value)) return fakeUuid(value)
    if (ISO.test(value)) return value
    if ((ENUM_KEYS.has(key) || (parentKey === "decisionVerbs" && key === "id")) && TOKEN.test(value)) return value
    if (EMAIL.test(value)) return "user@example.com"
    if (IDENTIFIER.test(value)) return fakeIdentifier(value)
    if (key === "href" || key === "url" || key.endsWith("Url")) return "/demo/path"
    return `example ${key || parentKey || "text"}`
  }

  const scrub = (value: unknown, key = "", parentKey = ""): unknown => {
    if (Array.isArray(value)) return value.map((v) => scrub(v, key, parentKey))
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [UUID.test(k) ? fakeUuid(k) : k, scrub(v, k, key)]),
      )
    }
    if (typeof value === "string") return scrubString(key, value, parentKey)
    return value
  }

  return { scrub, fakeUuid }
}
