// The attention feed (the inbox) and the extra request each kind of item needs when it is opened.
import type { Approval, AttentionFeed, AttentionItem, Issue } from "@paperclipai/shared"
import type { Client } from "../client.ts"
import type { InboxItem, ItemDetail, ItemKind, Question } from "../model.ts"

const id = encodeURIComponent

export type InboxFeed = { items: InboxItem[]; totalCount: number }

/** Loads the whole feed at once, dismissed and snoozed items included (the server drops them otherwise). */
export async function getInbox(client: Client, companyId: string, sort: "activity" | "decide"): Promise<InboxFeed> {
  const feed = await client.get<AttentionFeed>(`/api/companies/${id(companyId)}/attention`, { all: true, includeDismissed: true, sort })
  return { items: feed.items.map(toInboxItem), totalCount: feed.totalCount }
}

/** Badge count. Servers before 2026.1117.0 have no summary route; the caller then counts the feed. */
export async function getInboxCount(client: Client, companyId: string): Promise<number> {
  const summary = await client.get<{ totalCount: number }>(`/api/companies/${id(companyId)}/attention/summary`)
  return summary.totalCount
}

function kindOf(item: AttentionItem): ItemKind {
  switch (item.detail?.kind) {
    case "questions":
      return "question"
    case "confirmation":
      return "confirmation"
    case "approval":
      return "approval"
    case "failed_run":
      return "failed_run"
    case "blocker":
      return "blocked"
  }
  return "other"
}

export function toInboxItem(item: AttentionItem): InboxItem {
  const kind = kindOf(item)
  const meta = (item.subject.metadata ?? {}) as Record<string, unknown>
  const detail = item.detail as Record<string, unknown> | null
  const str = (v: unknown) => (typeof v === "string" ? v : null)
  // A blocked-task item's subject is the stalled blocker; the task it holds up is relatedIssue.
  const blocked = kind === "blocked" && item.relatedIssue ? { identifier: item.relatedIssue.identifier, title: item.relatedIssue.title ?? "" } : null
  return {
    id: item.id,
    kind,
    title: item.subject.title ?? item.whyNow,
    identifier: item.subject.identifier ?? item.relatedIssue?.identifier ?? null,
    issueId: kind === "blocked" ? (item.relatedIssue?.id ?? null) : (str(meta.issueId) ?? item.relatedIssue?.id ?? (item.subject.kind === "issue" ? item.subject.id : null)),
    agentName: item.originAgentName ?? str(detail?.agentName),
    agentId: str(meta.createdByAgentId) ?? str(meta.assigneeAgentId) ?? str(meta.requestedByAgentId),
    whyNow: item.whyNow,
    severity: item.severity,
    createdAt: item.createdAt,
    activityAt: item.activityAt,
    decideBy: item.decideBy,
    expiresAt: item.expiresAt,
    snoozed: item.dismissal?.isActive === true,
    snoozedUntil: item.dismissal?.snoozedUntil ?? item.snoozedUntil,
    summary:
      kind === "failed_run"
        ? (str(meta.error) ?? str(detail?.failureReasonExcerpt))
        : (str(detail?.summaryExcerpt) ?? str(detail?.promptExcerpt) ?? str(detail?.firstQuestionText)),
    blocked,
    blockedTaskCount: typeof detail?.blockedTaskCount === "number" ? detail.blockedTaskCount : null,
    subjectId: item.subject.id,
    dismissalKey: item.dismissalKey,
    sourceKind: item.sourceKind,
  }
}

type Interaction = { id: string; kind: string; payload: Record<string, unknown>; originCommentIds?: string[]; sourceRunId?: string | null }
type QuestionPayload = { id?: string; prompt?: string; selectionMode?: string; allowOther?: boolean; required?: boolean; options?: { id?: string; label?: string }[] }

/** Every interaction on a task. One request serves all inbox items on that task, so the store caches it. */
export function getInteractions(client: Client, issueId: string): Promise<Interaction[]> {
  return client.get<Interaction[]>(`/api/issues/${id(issueId)}/interactions`)
}

/**
 * What the agent wrote alongside a question, as one Markdown text, or null. Agents do not always link it: the comments
 * named in originCommentIds come first; without any, the comments written by the same run that asked the question.
 */
export async function questionContext(client: Client, issueId: string, interaction: Interaction | undefined): Promise<string | null> {
  if (!interaction) return null
  const linked = interaction.originCommentIds ?? []
  if (!linked.length && !interaction.sourceRunId) return null
  const comments = await client.get<{ id: string; body: string; createdByRunId?: string | null }[]>(`/api/issues/${id(issueId)}/comments`)
  const chosen = linked.length
    ? linked.map((cid) => comments.find((c) => c.id === cid)).filter((c) => !!c)
    : comments.filter((c) => c.createdByRunId === interaction.sourceRunId)
  const bodies = chosen.map((c) => c!.body).filter(Boolean)
  return bodies.length ? bodies.join("\n\n") : null
}

export function questionDetail(interaction: Interaction | undefined, context: string | null = null): ItemDetail {
  const questions = (interaction?.payload.questions ?? []) as QuestionPayload[]
  return {
    kind: "question",
    context,
    questions: questions.map(
      (q, i): Question => ({
        id: q.id ?? String(i),
        prompt: q.prompt ?? "",
        options: (q.options ?? []).filter((o) => o.label).map((o, j) => ({ id: o.id ?? String(j), label: o.label! })),
        multiple: q.selectionMode === "multi",
        allowOther: q.allowOther === true,
        required: q.required !== false,
      }),
    ),
  }
}

export function confirmationDetail(interaction: Interaction | undefined, fallbackPrompt: string | null): ItemDetail {
  const p = (interaction?.payload ?? {}) as Record<string, unknown>
  const s = (v: unknown, d: string) => (typeof v === "string" && v ? v : d)
  return {
    kind: "confirmation",
    prompt: s(p.prompt, fallbackPrompt ?? ""),
    detailsMarkdown: typeof p.detailsMarkdown === "string" ? p.detailsMarkdown : null,
    acceptLabel: s(p.acceptLabel, "Accept"),
    rejectLabel: s(p.rejectLabel, "Reject"),
  }
}

// From source, not observed on the test instance.
export async function approvalDetail(client: Client, approvalId: string): Promise<ItemDetail> {
  const [approval, issues] = await Promise.all([
    client.get<Approval>(`/api/approvals/${id(approvalId)}`),
    client.get<Pick<Issue, "identifier">[]>(`/api/approvals/${id(approvalId)}/issues`).catch(() => []),
  ])
  const p = approval.payload
  const text = [p.title, p.summary, p.description, p.body].filter((v): v is string => typeof v === "string" && v.length > 0)
  return { kind: "approval", summary: text.join("\n\n") || approval.type, identifier: issues[0]?.identifier ?? null }
}

export async function blockedDetail(client: Client, issueId: string): Promise<ItemDetail> {
  const issue = await client.get<Issue & { blockedBy?: { identifier: string | null; title: string; status: string }[] }>(
    `/api/issues/${id(issueId)}`,
  )
  return {
    kind: "blocked",
    description: issue.description,
    blockers: (issue.blockedBy ?? []).map((b) => ({ identifier: b.identifier, title: b.title, status: b.status })),
  }
}

// Dismiss, snooze and restore: phase 2 writes, as probed in the scratch company.
const dismissals = (companyId: string) => `/api/companies/${id(companyId)}/inbox-dismissals`

export function dismissItem(client: Client, companyId: string, itemKey: string) {
  return client.post(dismissals(companyId), { itemKey, kind: "dismiss" })
}

export function snoozeItem(client: Client, companyId: string, itemKey: string, until: Date) {
  return client.post(dismissals(companyId), { itemKey, kind: "snooze", snoozedUntil: until.toISOString() })
}

/** Undoes a dismissal or snooze. The server answers 204 with no body. */
export function restoreItem(client: Client, companyId: string, itemKey: string) {
  return client.delete(`${dismissals(companyId)}/${id(itemKey)}`)
}
