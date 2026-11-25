// Client-side shapes for the stores and screens. They hold no wire fields; src/api maps responses onto them.

export type ItemKind =
  | "question"
  | "confirmation"
  | "approval"
  | "review"
  | "decision"
  | "failed_run"
  | "agent_error"
  | "recovery"
  | "blocked"
  | "other"

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
  /** Why a recovery action exists, as the server names it ("stranded_assigned_issue", …). */
  cause: string | null
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
  | { kind: "approval"; summary: string; identifier: string | null; comments: ApprovalComment[] }
  /** An agent's decision: choosing an option runs its effects (comment, create, reassign, cancel tasks). */
  | { kind: "decision"; body: string; options: DecisionOption[]; inputs: DecisionInput[] }
  | { kind: "failed_run"; error: string; runId: string }
  | { kind: "agent_error"; error: string }
  /** A stalled task a person must settle; `summary` is the next step the server suggests. */
  | { kind: "recovery"; summary: string; cause: string | null }
  | { kind: "blocked"; description: string | null; blockers: { identifier: string | null; title: string; status: string }[] }
  /** A task in review. Only a stalled review is decided here; otherwise its decision lives elsewhere (approval, reviewer). */
  | { kind: "review"; stalled: boolean; whyNow: string }
  | { kind: "other"; summary: string | null }

export type ApprovalComment = { id: string; agentId: string | null; body: string; at: string }

export type DecisionOption = {
  id: string
  label: string
  description: string | null
  /** The server's destructive style; cancelling a task tree always has it. */
  destructive: boolean
  /** What choosing it does, in words: "comment on the task", "cancel the task tree", … */
  effects: string[]
  cancelsTree: boolean
}

export type DecisionInput = { id: string; label: string; placeholder: string | null; required: boolean; maxLength: number | null }

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

export type ProjectSummary = {
  id: string
  name: string
  /** "backlog", "planned", "in_progress", "completed" or "cancelled". */
  status: string
  description: string | null
  leadAgentId: string | null
  targetDate: string | null
  archived: boolean
}

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

/** Tokens and spend for one row of the cost report; runs are the server's cost events, one per run. */
export type Usage = { runs: number | null; input: number; cached: number; output: number; cents: number }

export type CostReport = {
  total: Usage & { budgetCents: number; budgetUsedPercent: number; pendingRuns: number; pricingComplete: boolean; subscriptionOnly: boolean }
  byAgent: (Usage & { agentId: string | null; name: string })[]
  byModel: (Usage & { provider: string; model: string; billing: string })[]
  byProject: (Usage & { projectId: string | null; name: string | null })[]
  /** Rolling windows, such as 5h, 24h and 7d. */
  windows: (Usage & { provider: string; window: string })[]
  quotas: { provider: string; account: string | null; error: string | null; windows: { label: string; usedPercent: number | null; resetsAt: string | null; value: string | null }[] }[]
  budgets: { policies: number; incidents: number; pausedAgents: number; pausedProjects: number }
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
