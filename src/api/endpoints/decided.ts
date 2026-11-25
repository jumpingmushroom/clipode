// What has been decided: resolved inbox items (questions, confirmations, decisions) and decided approvals, newest first.
import type { Client } from "../client.ts"
import type { DecidedEntry } from "../model.ts"

const id = encodeURIComponent
/** The most the history route returns in one page. */
export const DECIDED_LIMIT = 100

type HistoryItem = {
  id: string
  sourceKind: string
  title: string
  label: string | null
  outcome: string
  resolvedAt: string
  resolvedByUserId: string | null
  resolvedByAgentId: string | null
  issueId: string | null
  issueIdentifier: string | null
}
type Approval = {
  id: string
  type: string
  status: string
  payload?: { title?: unknown } | null
  decisionNote: string | null
  decidedByUserId: string | null
  decidedAt: string | null
}

const KINDS: Record<string, DecidedEntry["kind"]> = { issue_thread_interaction: "interaction", decision: "decision", approval: "approval" }
const words = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())

export async function listDecided(client: Client, companyId: string): Promise<DecidedEntry[]> {
  const [history, approvals] = await Promise.all([
    client.get<{ items: HistoryItem[] }>(`/api/companies/${id(companyId)}/attention/history`, { limit: DECIDED_LIMIT }),
    client.get<Approval[]>(`/api/companies/${id(companyId)}/approvals`),
  ])
  const resolved: DecidedEntry[] = history.items.map((h) => ({
    id: h.id,
    kind: KINDS[h.sourceKind] ?? "other",
    title: h.title,
    result: h.label || words(h.outcome),
    outcome: h.outcome,
    at: h.resolvedAt,
    by: h.resolvedByUserId ? { type: "user", id: h.resolvedByUserId } : h.resolvedByAgentId ? { type: "agent", id: h.resolvedByAgentId } : null,
    issueId: h.issueId,
    identifier: h.issueIdentifier,
    note: null,
  }))
  const decided: DecidedEntry[] = approvals
    .filter((a) => a.decidedAt)
    .map((a) => ({
      id: a.id,
      kind: "approval",
      title: typeof a.payload?.title === "string" && a.payload.title ? a.payload.title : `${words(a.type)}`,
      result: words(a.status),
      outcome: a.status,
      at: a.decidedAt!,
      by: a.decidedByUserId ? { type: "user", id: a.decidedByUserId } : null,
      // Its task is read when the entry is opened.
      issueId: null,
      identifier: null,
      note: a.decisionNote,
    }))
  return [...resolved, ...decided].sort((a, b) => b.at.localeCompare(a.at))
}

/** The first task an approval is linked to, if any. */
export async function approvalTask(client: Client, approvalId: string): Promise<string | null> {
  const issues = await client.get<{ id: string }[]>(`/api/approvals/${id(approvalId)}/issues`)
  return issues[0]?.id ?? null
}
