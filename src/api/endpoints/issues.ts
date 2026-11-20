import type { Issue } from "@paperclipai/shared"
import type { Client } from "../client.ts"
import type { TaskSummary } from "../model.ts"

export function toTask(i: Pick<Issue, "id" | "identifier" | "title" | "status" | "priority" | "assigneeAgentId">): TaskSummary {
  return { id: i.id, identifier: i.identifier, title: i.title, status: i.status, priority: i.priority, assigneeAgentId: i.assigneeAgentId }
}

/** Tasks without bodies, optionally filtered by status ("in_progress,in_review"). */
export async function listTasks(client: Client, companyId: string, status?: string): Promise<TaskSummary[]> {
  const rows = await client.get<Issue[]>(`/api/companies/${encodeURIComponent(companyId)}/issues`, { status, view: "index" })
  return rows.map(toTask)
}
