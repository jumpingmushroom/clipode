// Routines: scheduled work the company runs on its own. Read-only.
import type { RoutineListItem } from "@paperclipai/shared"
import type { Client } from "../client.ts"
import type { RoutineSummary } from "../model.ts"

const iso = (d: Date | string | null | undefined) => (d ? String(d) : null)

export async function listRoutines(client: Client, companyId: string): Promise<RoutineSummary[]> {
  const rows = await client.get<RoutineListItem[]>(`/api/companies/${encodeURIComponent(companyId)}/routines`)
  return rows.map(toRoutine)
}

export function toRoutine(r: RoutineListItem): RoutineSummary {
  const first = r.triggers[0]
  const next = r.triggers
    .filter((t) => t.enabled && t.nextRunAt)
    .map((t) => iso(t.nextRunAt)!)
    .sort()[0]
  const run = r.lastRun
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    assigneeAgentId: r.assigneeAgentId,
    projectId: r.projectId,
    schedule: first ? (first.label ?? first.cronExpression ?? first.kind) : null,
    moreTriggers: Math.max(0, r.triggers.length - 1),
    timezone: first?.timezone ?? null,
    nextRunAt: next ?? null,
    lastRun: run
      ? { at: iso(run.triggeredAt ?? run.createdAt)!, status: run.status, taskId: run.linkedIssue?.id ?? run.linkedIssueId, identifier: run.linkedIssue?.identifier ?? null }
      : null,
    activeTask: r.activeIssue ? { id: r.activeIssue.id, identifier: r.activeIssue.identifier } : null,
    concurrency: r.concurrencyPolicy,
  }
}
