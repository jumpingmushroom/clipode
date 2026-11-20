// Client-side shapes for the stores and screens. They hold no wire fields; src/api maps responses onto them.

export type ItemKind = "question" | "confirmation" | "approval" | "failed_run" | "blocked" | "other"

export type InboxItem = {
  id: string
  kind: ItemKind
  title: string
  /** Task identifier such as SKO-12; for a blocked task, the blocker. */
  identifier: string | null
  issueId: string | null
  agentName: string | null
  agentId: string | null
  whyNow: string
  severity: "low" | "medium" | "high" | string
  createdAt: string
  activityAt: string
  decideBy: string | null
  expiresAt: string | null
  /** An active dismissal or snooze. */
  snoozed: boolean
  snoozedUntil: string | null
  /** For kinds without a card: the summary the server wrote. */
  summary: string | null
  /** The blocked task, for blocked-task items. */
  blocked: { identifier: string | null; title: string } | null
  blockedTaskCount: number | null
  /** The subject's own id: interaction, approval or run id. */
  subjectId: string
  /** Server-side source kind, for kinds shown as a generic row. */
  sourceKind: string
}

export type Question = { prompt: string; options: string[]; multiple: boolean; allowOther: boolean }

export type ItemDetail =
  | { kind: "question"; questions: Question[] }
  | { kind: "confirmation"; prompt: string; detailsMarkdown: string | null; acceptLabel: string; rejectLabel: string }
  | { kind: "approval"; summary: string; identifier: string | null }
  | { kind: "failed_run"; error: string; runId: string }
  | { kind: "blocked"; description: string | null; blockers: { identifier: string | null; title: string; status: string }[] }
  | { kind: "other"; summary: string | null }

export type AgentSummary = {
  id: string
  name: string
  role: string
  title: string | null
  status: string
  adapterType: string
}

export type LiveRunSummary = {
  id: string
  agentId: string
  agentName: string
  issueId: string | null
  status: string
  startedAt: string | null
  createdAt: string
}

export type TaskSummary = {
  id: string
  identifier: string | null
  title: string
  status: string
  priority: string
  assigneeAgentId: string | null
  assigneeUserId: string | null
  parentId: string | null
  projectId: string | null
  updatedAt: string
}

export type TaskDetail = TaskSummary & {
  description: string | null
  projectName: string | null
  goalTitle: string | null
  parent: { identifier: string | null; title: string } | null
  blockers: { identifier: string | null; title: string; status: string }[]
  createdAt: string
}

export type ThreadEntry =
  | { kind: "comment"; id: string; at: string; agentId: string | null; userId: string | null; body: string }
  | { kind: "run"; id: string; at: string; agentId: string; status: string; startedAt: string | null; finishedAt: string | null; costUsd: number | null }

export type TaskCost = { costUsd: number; runCount: number; inputTokens: number; outputTokens: number }

export type ProjectSummary = { id: string; name: string }

export type CompanySummary = { id: string; name: string; prefix: string | null }

export type RunDetail = {
  id: string
  status: string
  agentId: string
  issueId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  error: string | null
  costUsd: number | null
  inputTokens: number | null
  outputTokens: number | null
}
