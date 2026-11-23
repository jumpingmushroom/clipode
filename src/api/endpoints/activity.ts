// Company activity: what agents, people and the system did, newest first. Read-only.
import type { ActivityEvent } from "@paperclipai/shared"
import { activityVerb, isMinor } from "../activity-format.ts"
import type { Client } from "../client.ts"
import type { ActivityEntry } from "../model.ts"

/** Bookkeeping makes up most entries, so ask for more than the server's default of 100 (its most is 500). */
export const ACTIVITY_LIMIT = 300

export async function listActivity(client: Client, companyId: string): Promise<ActivityEntry[]> {
  const rows = await client.get<ActivityEvent[]>(`/api/companies/${encodeURIComponent(companyId)}/activity`, { limit: ACTIVITY_LIMIT })
  return rows.map(toEntry)
}

export function toEntry(e: ActivityEvent): ActivityEntry {
  const d = e.details ?? {}
  const str = (k: string) => (typeof d[k] === "string" && d[k] ? (d[k] as string) : null)
  const linked = Array.isArray(d.issueIds) && typeof d.issueIds[0] === "string" ? d.issueIds[0] : null
  const issueId = e.entityType === "issue" ? e.entityId : (str("issueId") ?? linked)
  const target: ActivityEntry["target"] =
    e.entityType === "agent"
      ? { kind: "agent", id: e.entityId }
      : e.entityType === "heartbeat_run"
        ? { kind: "run", id: e.entityId, agentId: str("agentId") ?? undefined }
        : issueId
          ? { kind: "task", id: issueId }
          : null
  const task = [str("identifier"), str("issueTitle")].filter(Boolean).join(" ")
  return {
    id: e.id,
    at: String(e.createdAt),
    actor: { type: e.actorType, id: e.actorId },
    verb: activityVerb(e.action, e.details),
    subject: task || str("title") || str("name") || (e.entityType === "approval" ? `${(str("type") ?? "an").replace(/_/g, " ")} approval` : null),
    target,
    minor: isMinor(e.action),
    action: e.action,
  }
}
