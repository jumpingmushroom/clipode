// Tasks: the full list for the Tasks screen and the sidebars, projects, and a cache of opened threads.
import { createStore } from "solid-js/store"
import { getTask, getTaskCost, getThread, listProjects, listTasks, postComment } from "../api/endpoints/issues.ts"
import { ApiError } from "../api/client.ts"
import type { ProjectSummary, TaskCost, TaskDetail, TaskSummary, ThreadEntry } from "../api/model.ts"
import { createResource, type Resource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { ProjectSummary, TaskCost, TaskDetail, TaskSummary, ThreadEntry } from "../api/model.ts"

export const IN_FLIGHT = ["in_progress", "in_review", "blocked"]

export type Thread = { detail: Resource<TaskDetail | null>; entries: Resource<ThreadEntry[]>; cost: Resource<TaskCost | null> }

export function createIssuesStore(session: Session, companyId: string) {
  const list = createResource<TaskSummary[]>(() => listTasks(session.client(), companyId), [], session.handleError)
  const projects = createResource<ProjectSummary[]>(() => listProjects(session.client(), companyId), [], session.handleError)
  const [threads, setThreads] = createStore<Record<string, Thread>>({})

  const byId = (id: string | null | undefined) => (id ? list.data.find((t) => t.id === id) : undefined)
  const children = (id: string) => list.data.filter((t) => t.parentId === id)

  return {
    list,
    projects,
    byId,
    children,
    inFlight: () => list.data.filter((t) => IN_FLIGHT.includes(t.status)),
    /** Done and total sub-tasks, or null for a task without any. */
    progress(id: string): [done: number, total: number] | null {
      const kids = children(id)
      return kids.length ? [kids.filter((k) => k.status === "done").length, kids.length] : null
    },
    projectName: (id: string | null) => (id ? projects.data.find((p) => p.id === id)?.name : undefined),
    /** Posts a comment, retrying once after a network error with the same request id, then refreshes the thread. */
    async comment(issueId: string, body: string) {
      const requestId = crypto.randomUUID()
      const send = () => postComment(session.client(), issueId, body, requestId)
      try {
        await send().catch((err) => (err instanceof ApiError && err.kind === "network" ? send() : Promise.reject(err)))
      } catch (err) {
        session.handleError(err)
        const reason = (err as { body?: { error?: unknown } }).body?.error
        throw new Error(`Not sent: ${typeof reason === "string" ? reason : (err as Error).message}`)
      }
      if (threads[issueId]) void threads[issueId]!.entries.refresh()
    },
    /** Refetches a thread that has been opened; other tasks are left alone. */
    refreshThread(id: string) {
      const t = threads[id]
      if (!t) return
      void t.detail.refresh()
      void t.entries.refresh()
      void t.cost.refresh()
    },
    /** The thread of one task, created on first use and kept for the session. */
    thread(id: string): Thread {
      if (!threads[id]) {
        const client = () => session.client()
        setThreads(id, {
          detail: createResource<TaskDetail | null>(() => getTask(client(), id), null, session.handleError),
          entries: createResource<ThreadEntry[]>(() => getThread(client(), id), [], session.handleError),
          cost: createResource<TaskCost | null>(() => getTaskCost(client(), id), null),
        })
      }
      return threads[id]!
    },
  }
}

export type IssuesStore = ReturnType<typeof createIssuesStore>
