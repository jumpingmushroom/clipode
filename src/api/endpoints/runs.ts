import type { Client } from "../client.ts"
import type { LiveRunSummary } from "../model.ts"

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
