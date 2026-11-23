// Client-side shapes for the stores and screens. They hold no wire fields; src/api maps responses onto them.

export type ItemKind = "question" | "confirmation" | "approval" | "review" | "failed_run" | "blocked" | "other"

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
  /** The key for dismissing or snoozing this item. */
  dismissalKey: string
  /** For a review item: no reviewer, approval or monitor is left, so it is decided in the inbox. */
  reviewStalled: boolean
  /** Server-side source kind, for kinds shown as a generic row. */
  sourceKind: string
}

export type Question = {
  id: string
  prompt: string
  options: { id: string; label: string }[]
  multiple: boolean
  allowOther: boolean
  required: boolean
}

/** One answer per question: the chosen option ids, and free text for "Something else". */
export type Answer = { questionId: string; optionIds: string[]; otherText?: string }

export type ItemDetail =
  /** `context`: what the agent wrote alongside the question, from the comments named in originCommentIds. */
  | { kind: "question"; questions: Question[]; context: string | null }
  | { kind: "confirmation"; prompt: string; detailsMarkdown: string | null; acceptLabel: string; rejectLabel: string }
  | { kind: "approval"; summary: string; identifier: string | null }
  | { kind: "failed_run"; error: string; runId: string }
  | { kind: "blocked"; description: string | null; blockers: { identifier: string | null; title: string; status: string }[] }
  /** A task in review. Only a stalled review is decided here; otherwise its decision lives elsewhere (approval, reviewer). */
  | { kind: "review"; stalled: boolean; whyNow: string }
  | { kind: "other"; summary: string | null }

export type AgentSummary = {
  id: string
  name: string
  role: string
  title: string | null
  status: string
  adapterType: string
  /** The configured model, when the adapter config names one. */
  model: string | null
  reportsTo: string | null
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

/** One company search hit. A task hit also stands for a match in its comments, documents or files. */
export type SearchResult = {
  type: "task" | "agent" | "project"
  /** The task, agent or project to open. */
  id: string
  title: string
  identifier: string | null
  /** Where the match is: "Title", "Comment", a document's title, and so on. */
  where: string | null
  /** Text around the first match, for matches outside the title. */
  excerpt: string | null
}

export type RoutineSummary = {
  id: string
  title: string
  /** "active" or "paused". */
  status: string
  assigneeAgentId: string | null
  projectId: string | null
  /** The first trigger's label or cron expression, and how many more triggers there are. */
  schedule: string | null
  moreTriggers: number
  timezone: string | null
  /** The soonest next run of an enabled trigger. */
  nextRunAt: string | null
  lastRun: { at: string; status: string; taskId: string | null; identifier: string | null } | null
  /** The open task of a run still in progress. */
  activeTask: { id: string; identifier: string | null } | null
  concurrency: string
}

/** One line of company activity, already worded; names of agents are looked up by the screen. */
export type ActivityEntry = {
  id: string
  at: string
  actor: { type: "agent" | "user" | "system" | "plugin"; id: string }
  /** "commented on", "changed status from todo to done on", … */
  verb: string
  /** What the entry is about, as the details name it: a task identifier and title, or a name. */
  subject: string | null
  /** What enter opens. */
  target: { kind: "task" | "agent" | "run"; id: string; agentId?: string } | null
  /** Bookkeeping (leases, costs, read marks) the web UI hides by default. */
  minor: boolean
  action: string
}

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
