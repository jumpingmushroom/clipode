// Tasks (Paperclip calls them issues): the list, one task with its thread, and its cost.
import type { Issue, IssueComment, Project } from "@paperclipai/shared"
import { basename } from "node:path"
import type { Client } from "../client.ts"
import type { ProjectSummary, TaskCost, TaskDetail, TaskSummary, ThreadEntry } from "../model.ts"

const id = encodeURIComponent

type IssueRow = Pick<Issue, "id" | "identifier" | "title" | "status" | "priority" | "assigneeAgentId" | "assigneeUserId" | "parentId" | "projectId"> & {
  updatedAt: string | Date
}

export function toTask(i: IssueRow): TaskSummary {
  return {
    id: i.id,
    identifier: i.identifier,
    title: i.title,
    status: i.status,
    priority: i.priority,
    assigneeAgentId: i.assigneeAgentId,
    assigneeUserId: i.assigneeUserId,
    parentId: i.parentId,
    projectId: i.projectId,
    updatedAt: String(i.updatedAt),
  }
}

/** Tasks without bodies, optionally filtered by status ("in_progress,in_review"). */
export async function listTasks(client: Client, companyId: string, status?: string): Promise<TaskSummary[]> {
  const rows = await client.get<IssueRow[]>(`/api/companies/${id(companyId)}/issues`, { status, view: "index" })
  return rows.map(toTask)
}

type IssueDetail = IssueRow & {
  description: string | null
  createdAt: string | Date
  project?: { name: string } | null
  goal?: { title: string } | null
  ancestors?: { identifier: string | null; title: string }[]
  blockedBy?: { identifier: string | null; title: string; status: string }[]
}

export async function getTask(client: Client, issueId: string): Promise<TaskDetail> {
  const i = await client.get<IssueDetail>(`/api/issues/${id(issueId)}`)
  const parent = i.ancestors?.[0]
  return {
    ...toTask(i),
    description: i.description,
    projectName: i.project?.name ?? null,
    goalTitle: i.goal?.title ?? null,
    parent: parent ? { identifier: parent.identifier, title: parent.title } : null,
    blockers: (i.blockedBy ?? []).map((b) => ({ identifier: b.identifier, title: b.title, status: b.status })),
    createdAt: String(i.createdAt),
  }
}

type RunRow = { runId: string; agentId: string; status: string; createdAt: string; startedAt: string | null; finishedAt: string | null; usageJson?: { costUsd?: number } | null }

/** Comments and runs of one task, oldest first. */
export async function getThread(client: Client, issueId: string): Promise<ThreadEntry[]> {
  const [comments, runs] = await Promise.all([
    client.get<IssueComment[]>(`/api/issues/${id(issueId)}/comments`),
    client.get<RunRow[]>(`/api/issues/${id(issueId)}/runs`).catch(() => [] as RunRow[]),
  ])
  const entries: ThreadEntry[] = [
    ...comments.map((c): ThreadEntry => ({
      kind: "comment",
      id: c.id,
      at: String(c.createdAt),
      agentId: c.authorAgentId,
      userId: c.authorUserId,
      body: c.body,
    })),
    ...runs.map((r): ThreadEntry => ({
      kind: "run",
      id: r.runId,
      at: r.startedAt ?? r.createdAt,
      agentId: r.agentId,
      status: r.status,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      costUsd: typeof r.usageJson?.costUsd === "number" ? r.usageJson.costUsd : null,
    })),
  ]
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
}

export async function getTaskCost(client: Client, issueId: string): Promise<TaskCost> {
  const c = await client.get<{ costCents: number; runCount: number; inputTokens: number; outputTokens: number }>(`/api/issues/${id(issueId)}/cost-summary`)
  return { costUsd: c.costCents / 100, runCount: c.runCount, inputTokens: c.inputTokens, outputTokens: c.outputTokens }
}

export async function listProjects(client: Client, companyId: string): Promise<ProjectSummary[]> {
  const rows = await client.get<Project[]>(`/api/companies/${id(companyId)}/projects`)
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    description: p.description,
    leadAgentId: p.leadAgentId,
    targetDate: p.targetDate ? String(p.targetDate) : null,
    archived: !!p.archivedAt,
  }))
}

/** Posts a comment. The same clientRequestId makes a retry safe: the server creates no second comment. */
export function postComment(client: Client, issueId: string, body: string, clientRequestId: string, attachmentIds: string[] = []) {
  return client.post(`/api/issues/${id(issueId)}/comments`, { body, clientRequestId, ...(attachmentIds.length ? { attachmentIds } : {}) })
}

/**
 * Comments and reassigns in one request, as the web UI's composer does when it hands a task back: the server adds the
 * comment and wakes the new assignee. commentClientRequestId makes a retry safe, as with a plain comment.
 */
export function commentAndAssign(client: Client, issueId: string, body: string, clientRequestId: string, attachmentIds: string[], assigneeAgentId: string) {
  return client.request("PATCH", `/api/issues/${id(issueId)}`, {
    body: { comment: body, commentClientRequestId: clientRequestId, ...(attachmentIds.length ? { attachmentIds } : {}), assigneeAgentId, assigneeUserId: null },
  })
}

type AssignmentEvent = { actorType: string; actorId: string; action: string; createdAt: string; details: Record<string, unknown> | null }

/**
 * The agent a comment on a task assigned to you should hand it back to: the agent that last assigned it to you, else
 * the agent that commented last; null when the last other comment is a person's or there is none. Ported from Paperclip
 * ui/src/lib/assignees.ts (suggestedCommentAssigneeValue), agents only.
 */
export async function handBackAgent(client: Client, issueId: string, userId: string): Promise<string | null> {
  const [activity, comments] = await Promise.all([
    client.get<AssignmentEvent[]>(`/api/issues/${id(issueId)}/activity`),
    client.get<{ authorAgentId?: string | null; authorUserId?: string | null; createdAt: string }[]>(`/api/issues/${id(issueId)}/comments`),
  ])
  const handedOver = activity
    .filter((e) => {
      const d = e.details
      if (e.actorType !== "agent" || !e.actorId || !d || d.assigneeUserId !== userId) return false
      if (e.action === "issue.created" || e.action === "issue.child_created") return true
      if (e.action === "issue.reassigned") return d.changed === true && Object.hasOwn(d, "previousAssigneeUserId") && d.previousAssigneeUserId !== userId
      // Updates can resend unchanged fields; only a real assignment counts.
      const previous = d._previous as Record<string, unknown> | null | undefined
      return e.action === "issue.updated" && !!previous && typeof previous === "object" && Object.hasOwn(previous, "assigneeUserId") && previous.assigneeUserId !== userId
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0]
  if (handedOver) return handedOver.actorId
  // The comments route answers newest first.
  for (const c of [...comments].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))) {
    if (c.authorAgentId) return c.authorAgentId
    if (c.authorUserId && c.authorUserId !== userId) return null
  }
  return null
}

/** A new task. Without a title the server takes one from the description and generates a better one later. */
export type NewTask = {
  title?: string
  description?: string
  priority?: string
  assigneeAgentId?: string | null
  projectId?: string | null
  workMode?: "standard" | "planning" | "ask"
  private?: boolean
  /** A model for the assignee's run, instead of the agent's default. */
  model?: string | null
}
/** The task fields clipode changes; PATCH /api/issues/{id} accepts many more, and none of them are sent. */
export type TaskPatch = { title?: string; description?: string | null; status?: string; priority?: string; assigneeAgentId?: string | null; projectId?: string | null }
const PATCH_FIELDS = ["title", "description", "status", "priority", "assigneeAgentId", "projectId"]

/** Creates a task. The same idempotencyKey makes a retry return the first task instead of a second one. */
export async function createTask(client: Client, companyId: string, task: NewTask, idempotencyKey: string): Promise<TaskSummary> {
  const { model, private: isPrivate, workMode, ...fields } = task
  const body = {
    // Unset fields are left out, so the server applies its defaults (no project, unassigned).
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== null && v !== "")),
    ...(workMode && workMode !== "standard" ? { workMode } : {}),
    ...(isPrivate ? { visibility: "private" } : {}),
    ...(model ? { assigneeAdapterOverrides: { adapterConfig: { model } } } : {}),
    idempotencyKey,
  }
  return toTask(await client.post<IssueRow>(`/api/companies/${id(companyId)}/issues`, body))
}

export async function updateTask(client: Client, issueId: string, patch: TaskPatch): Promise<TaskSummary> {
  const body = Object.fromEntries(Object.entries(patch).filter(([k, v]) => v !== undefined && PATCH_FIELDS.includes(k)))
  return toTask(await client.request<IssueRow>("PATCH", `/api/issues/${id(issueId)}`, { body }))
}

/** Uploads a local file to a task. The server decides which types and sizes it accepts. */
/** Uploads one file to a task and returns the attachment's id, which a comment can then carry. */
export async function uploadAttachment(client: Client, companyId: string, issueId: string, path: string): Promise<string> {
  const form = new FormData()
  form.append("file", Bun.file(path), basename(path))
  const attachment = await client.post<{ id: string }>(`/api/companies/${id(companyId)}/issues/${id(issueId)}/attachments`, form)
  return attachment.id
}
