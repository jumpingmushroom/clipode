// Tasks: the full list for the Tasks screen and the sidebars, projects, and a cache of opened threads.
import { createStore } from "solid-js/store"
import { createTask, getTask, getTaskCost, getThread, listProjects, listTasks, postComment, updateTask, type NewTask, type TaskPatch } from "../api/endpoints/issues.ts"
import { ApiError } from "../api/client.ts"
import type { ProjectSummary, TaskCost, TaskDetail, TaskSummary, ThreadEntry } from "../api/model.ts"
import { createResource, type Resource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { ProjectSummary, TaskCost, TaskDetail, TaskSummary, ThreadEntry } from "../api/model.ts"
export type { NewTask, TaskPatch } from "../api/endpoints/issues.ts"

export const IN_FLIGHT = ["in_progress", "in_review", "blocked"]

export type Thread = { detail: Resource<TaskDetail | null>; entries: Resource<ThreadEntry[]>; cost: Resource<TaskCost | null> }

/** The server's own reason reads better than the request line; a 401 still ends the session. */
function notSentError(session: Session, err: unknown): Error {
  session.handleError(err)
  const reason = (err as { body?: { error?: unknown } }).body?.error
  return new Error(`Not sent: ${typeof reason === "string" ? reason : (err as Error).message}`)
}

export function createIssuesStore(session: Session, companyId: string) {
  const notSent = (err: unknown) => notSentError(session, err)
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
      await send()
        .catch((err) => (err instanceof ApiError && err.kind === "network" ? send() : Promise.reject(err)))
        .catch((err) => Promise.reject(notSent(err)))
      if (threads[issueId]) void threads[issueId]!.entries.refresh()
    },
    /** Creates a task, retrying once after a network error with the same idempotency key, then refreshes the list. */
    async create(task: NewTask): Promise<TaskSummary> {
      const key = crypto.randomUUID()
      const send = () => createTask(session.client(), companyId, task, key)
      const created = await send()
        .catch((err) => (err instanceof ApiError && err.kind === "network" ? send() : Promise.reject(err)))
        .catch((err) => Promise.reject(notSent(err)))
      void list.refresh()
      return created
    },
    /** Changes a task's fields, then refreshes the list and, if open, its thread. */
    async update(issueId: string, patch: TaskPatch): Promise<void> {
      await updateTask(session.client(), issueId, patch).catch((err) => Promise.reject(notSent(err)))
      void list.refresh()
      if (threads[issueId]) void threads[issueId]!.detail.refresh()
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
