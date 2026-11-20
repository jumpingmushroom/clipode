// Tasks (Paperclip calls them issues): the list, one task with its thread, and its cost.
import type { Issue, IssueComment } from "@paperclipai/shared"
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
  const rows = await client.get<{ id: string; name: string }[]>(`/api/companies/${id(companyId)}/projects`)
  return rows.map((p) => ({ id: p.id, name: p.name }))
}
