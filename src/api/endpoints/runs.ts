import type { Client } from "../client.ts"
import type { HeartbeatRun } from "@paperclipai/shared"
import type { LiveRunSummary, RunDetail } from "../model.ts"

// The live-runs row is typed in Paperclip's web UI package, not in @paperclipai/shared; these are the fields used.
type LiveRunRow = {
  id: string
  status: string
  agentId: string
  agentName: string
  issueId?: string | null
  startedAt: string | null
  createdAt: string
}

export async function listLiveRuns(client: Client, companyId: string): Promise<LiveRunSummary[]> {
  const rows = await client.get<LiveRunRow[]>(`/api/companies/${encodeURIComponent(companyId)}/live-runs`)
  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    agentName: r.agentName,
    issueId: r.issueId ?? null,
    status: r.status,
    startedAt: r.startedAt,
    createdAt: r.createdAt,
  }))
}

export async function getRun(client: Client, runId: string): Promise<RunDetail> {
  const r = await client.get<HeartbeatRun & { issueId?: string | null }>(`/api/heartbeat-runs/${encodeURIComponent(runId)}`)
  const usage = (r.usageJson ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === "number" ? v : null)
  return {
    id: r.id,
    status: r.status,
    agentId: r.agentId,
    issueId: r.issueId ?? null,
    createdAt: String(r.createdAt),
    startedAt: r.startedAt ? String(r.startedAt) : null,
    finishedAt: r.finishedAt ? String(r.finishedAt) : null,
    error: r.error ?? null,
    costUsd: num(usage.costUsd),
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
  }
}

/** One byte range of a run's log. `next` is where the following read starts. */
export async function getRunLog(client: Client, runId: string, offset: number, limitBytes = 256_000): Promise<{ content: string; next: number; more: boolean }> {
  const log = await client.get<{ content: string; nextOffset?: number }>(`/api/heartbeat-runs/${encodeURIComponent(runId)}/log`, { offset, limitBytes })
  // nextOffset is set only when the read stopped at limitBytes; otherwise it reached the end of the log.
  // shortcut: a multi-byte character cut at limitBytes decodes as a replacement character; raise limitBytes if that shows up.
  if (typeof log.nextOffset === "number") return { content: log.content, next: log.nextOffset, more: true }
  return { content: log.content, next: offset + Buffer.byteLength(log.content, "utf8"), more: false }
}
