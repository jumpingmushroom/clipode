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
  "capabilities", "pauseReason", "wakeReason", "contextKind", "biller", "authorType", "origin", "derivedAuthorSource",
])
const TOKEN = /^[a-z0-9][a-z0-9_.:+-]{0,63}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IDENTIFIER = /^[A-Z][A-Z0-9]{1,9}-\d+$/
// Field names look like this. Other keys (env var names, skill paths, map keys) describe the instance, so they are replaced.
export const FIELD_KEY = /^[a-z_][A-Za-z0-9_]*$/

// Inside run-log chunks these are tool names and tags, kept when they look like tokens.
const LOG_KEYS = new Set(["name", "tag", "subtype", "role", "event", "method", "tool", "stop_reason"])

export function createScrubber() {
  const ids = new Map<string, string>()
  const identifiers = new Map<string, string>()
  const keys = new Map<string, string>()
  const tokens = new Map<string, string>()
  // Ids and keys that are not UUIDs (composite ids, dedup keys) stay distinct, so lists keep their identity.
  const fakeToken = (key: string, real: string) => {
    if (!tokens.has(real)) tokens.set(real, `${key}-${tokens.size + 1}`)
    return tokens.get(real)!
  }

  const fakeUuid = (real: string) => {
    if (!ids.has(real)) ids.set(real, `00000000-0000-4000-8000-${(ids.size + 1).toString(16).padStart(12, "0")}`)
    return ids.get(real)!
  }
  const fakeIdentifier = (real: string) => {
    if (!identifiers.has(real)) identifiers.set(real, `DEMO-${identifiers.size + 1}`)
    return identifiers.get(real)!
  }

  const scrubKey = (k: string) => {
    if (UUID.test(k)) return fakeUuid(k)
    if (FIELD_KEY.test(k)) return k
    if (!keys.has(k)) keys.set(k, `example_key_${keys.size + 1}`)
    return keys.get(k)!
  }

  const scrubString = (key: string, value: string, parentKey: string, log: boolean): string => {
    if (value === "") return value
    if (UUID.test(value)) return fakeUuid(value)
    if (ISO.test(value)) return value
    if ((ENUM_KEYS.has(key) || (log && LOG_KEYS.has(key)) || (parentKey === "decisionVerbs" && key === "id")) && TOKEN.test(value)) return value
    if (key === "id" || key.endsWith("Id") || key.endsWith("Key")) return fakeToken(key, value)
    if (EMAIL.test(value)) return "user@example.com"
    if (IDENTIFIER.test(value)) return fakeIdentifier(value)
    if (key === "href" || key === "url" || key.endsWith("Url")) return "/demo/path"
    return `example ${key || parentKey || "text"}`
  }

  const walk = (value: unknown, key: string, parentKey: string, log: boolean): unknown => {
    if (Array.isArray(value)) return value.map((v) => walk(v, key, parentKey, log))
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [scrubKey(k), walk(v, k, key, log)]),
      )
    }
    if (typeof value === "string") return scrubString(key, value, parentKey, log)
    return value
  }
  const scrub = (value: unknown): unknown => walk(value, "", "", false)

  // A JSON-lines string: each line is parsed and scrubbed, non-JSON lines become invented text.
  const scrubJsonLines = (text: string, key: string): string =>
    text
      .split("\n")
      .map((line) => {
        if (!line.trim()) return line
        try {
          return JSON.stringify(scrubLogValue(JSON.parse(line)))
        } catch {
          return `example ${key}`
        }
      })
      .join("\n")

  // Run-log records keep their structure: a chunk that holds JSON lines is scrubbed inside.
  const scrubLogValue = (value: unknown): unknown => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          scrubKey(k),
          typeof v === "string" && v.trimStart().startsWith("{") ? scrubJsonLines(v, k) : walk(v, k, "", true),
        ]),
      )
    }
    return walk(value, "", "", true)
  }

  /** Scrubs the `content` of a run log: newline-separated JSON records whose chunks may hold JSON. */
  const scrubLog = (content: string): string => scrubJsonLines(content, "chunk")

  return { scrub, scrubLog, fakeUuid }
}
