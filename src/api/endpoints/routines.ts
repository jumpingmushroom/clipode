// Routines: scheduled work the company runs on its own. Running one now and pausing or resuming it are phase 3 writes,
// as probed in the scratch company on 2026-11-25.
import type { RoutineListItem } from "@paperclipai/shared"
import type { Client } from "../client.ts"
import type { RoutineDetail, RoutineRun, RoutineSummary } from "../model.ts"

const id = encodeURIComponent
const iso = (d: Date | string | null | undefined) => (d ? String(d) : null)

export async function listRoutines(client: Client, companyId: string): Promise<RoutineSummary[]> {
  const rows = await client.get<RoutineListItem[]>(`/api/companies/${id(companyId)}/routines`)
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

type WireDetail = Omit<RoutineListItem, "lastRun"> & {
  description: string | null
  descriptionDocument?: { body: string } | null
  catchUpPolicy: string
  recentRuns?: RoutineListItem["lastRun"][]
}

export async function getRoutine(client: Client, routineId: string): Promise<RoutineDetail> {
  const r = await client.get<WireDetail>(`/api/routines/${id(routineId)}`)
  return {
    ...toRoutine({ ...r, lastRun: r.recentRuns?.[0] ?? null } as RoutineListItem),
    description: r.descriptionDocument?.body ?? r.description,
    triggers: r.triggers.map((t) => ({ label: t.label ?? t.cronExpression ?? t.kind, enabled: t.enabled, nextRunAt: iso(t.nextRunAt), timezone: t.timezone ?? null })),
    catchUp: r.catchUpPolicy,
  }
}

type WireRun = {
  id: string
  status: string
  source: string
  triggeredAt: string | null
  createdAt: string
  linkedIssueId: string | null
  linkedIssue?: { id: string; identifier: string | null } | null
  failureReason: string | null
}

/** The routine's runs, newest first. */
export async function listRoutineRuns(client: Client, routineId: string): Promise<RoutineRun[]> {
  const rows = await client.get<WireRun[]>(`/api/routines/${id(routineId)}/runs`, { limit: 50 })
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    source: r.source,
    at: r.triggeredAt ?? r.createdAt,
    taskId: r.linkedIssue?.id ?? r.linkedIssueId,
    identifier: r.linkedIssue?.identifier ?? null,
    failure: r.failureReason,
  }))
}

/**
 * Runs a routine now, also a paused one. Answers 202 with the run: "issue_created", or "coalesced" when a run is
 * still going and the routine joins new runs to it. The same key replays the first answer.
 */
export function runRoutine(client: Client, routineId: string, idempotencyKey: string) {
  return client.post<{ status: string; linkedIssueId: string | null }>(`/api/routines/${id(routineId)}/run`, { source: "manual", idempotencyKey })
}

/** Pauses or resumes a routine's triggers. The route takes many fields; clipode sends only the status. */
export function setRoutineStatus(client: Client, routineId: string, status: "active" | "paused") {
  return client.request("PATCH", `/api/routines/${id(routineId)}`, { body: { status } })
}
