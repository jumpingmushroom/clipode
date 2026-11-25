// Tasks: the full list for the Tasks screen and the sidebars, projects, and a cache of opened threads.
import { basename } from "node:path"
import { createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { checkMonitorNow, commentAndAssign, createTask, getDocument, getHeldComments, getTask, getTaskCost, getThread, handBackAgent, listMine, listProjects, listTasks, markRead, postComment, retryNow, sendHeldComments, updateTask, uploadAttachment, type NewTask, type TaskPatch } from "../api/endpoints/issues.ts"
import { ApiError } from "../api/client.ts"
import type { HeldComments, MineTask, ProjectSummary, TaskCost, TaskDetail, TaskDocument, TaskSummary, ThreadEntry } from "../api/model.ts"
import { createResource, type Resource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { DocumentSummary, HeldComments, MineTask, Waiting, ProjectSummary, TaskCost, TaskDetail, TaskDocument, TaskSummary, ThreadEntry } from "../api/model.ts"
export type { NewTask, TaskPatch } from "../api/endpoints/issues.ts"

export const IN_FLIGHT = ["in_progress", "in_review", "blocked"]

export type Thread = { detail: Resource<TaskDetail | null>; entries: Resource<ThreadEntry[]>; cost: Resource<TaskCost | null>; held: Resource<HeldComments | null> }

/** What a comment did: files the server refused, and the reason the server holds the comment from the agent, if it does. */
export type CommentResult = { failed: { path: string; reason: string }[]; held: string | null }

export function createIssuesStore(session: Session, companyId: string) {
  const notSent = (err: unknown) => session.notSent(err)
  const list = createResource<TaskSummary[]>(() => listTasks(session.client(), companyId), [], session.handleError)
  const mine = createResource<MineTask[]>(() => listMine(session.client(), companyId), [], session.handleError)
  const projects = createResource<ProjectSummary[]>(() => listProjects(session.client(), companyId), [], session.handleError)
  const [threads, setThreads] = createStore<Record<string, Thread>>({})
  const documents = new Map<string, Resource<TaskDocument | null>>()

  /** Uploads files to a task one by one; returns the new attachments' ids and the files the server did not take. */
  async function attach(issueId: string, paths: string[]): Promise<{ ids: string[]; failed: { path: string; reason: string }[] }> {
    const ids: string[] = []
    const failed: { path: string; reason: string }[] = []
    for (const path of paths) {
      await uploadAttachment(session.client(), companyId, issueId, path).then(
        (attachmentId) => ids.push(attachmentId),
        (err) => failed.push({ path, reason: notSent(err).message.replace(/^Not sent: /, "") }),
      )
    }
    return { ids, failed }
  }
  const byId = (id: string | null | undefined) => (id ? list.data.find((t) => t.id === id) : undefined)
  const children = (id: string) => list.data.filter((t) => t.parentId === id)
  // Done and total sub-tasks per parent, counted once per list rather than once per row on screen.
  const counts = createMemo(() => {
    const map = new Map<string, [done: number, total: number]>()
    for (const t of list.data) {
      if (!t.parentId) continue
      const c = map.get(t.parentId) ?? [0, 0]
      map.set(t.parentId, [c[0] + (t.status === "done" ? 1 : 0), c[1] + 1])
    }
    return map
  })

  return {
    list,
    /** Tasks you have touched, as in the web UI's Mine inbox. */
    mine,
    projects,
    unreadCount: () => mine.data.filter((t) => t.unread).length,
    isUnread: (id: string) => mine.data.some((t) => t.id === id && t.unread),
    /** Marks a task read, then reads Mine again; a refusal (read-only mode, say) changes nothing and is not reported. */
    async markRead(issueId: string) {
      await markRead(session.client(), issueId).then(() => mine.refresh(), () => {})
    },
    byId,
    children,
    inFlight: () => list.data.filter((t) => IN_FLIGHT.includes(t.status)),
    /** Done and total sub-tasks, or null for a task without any. */
    progress: (id: string): [done: number, total: number] | null => counts().get(id) ?? null,
    projectName: (id: string | null) => (id ? projects.data.find((p) => p.id === id)?.name : undefined),
    /**
     * Posts a comment with files: the files are uploaded first and the comment carries the ones the server took. With an
     * agent to assign, the comment hands the task to it in the same request, which wakes it. Retries once after a
     * network error with the same request id, refreshes the thread, and returns the files that were not attached.
     */
    async comment(issueId: string, body: string, files: string[] = [], assignTo: string | null = null): Promise<CommentResult> {
      const { ids, failed } = files.length ? await attach(issueId, files) : { ids: [], failed: [] }
      if (files.length && !ids.length && !body) throw new Error(`Not sent: no file was attached (${failed.map((f) => f.reason).join(", ")})`)
      const requestId = crypto.randomUUID()
      // The server needs some text; a comment of files alone names them.
      const text = body || `Attached ${files.filter((f) => !failed.some((x) => x.path === f)).map((f) => basename(f)).join(", ")}`
      const send = () => (assignTo ? commentAndAssign(session.client(), issueId, text, requestId, ids, assignTo) : postComment(session.client(), issueId, text, requestId, ids))
      await send()
        .catch((err) => (err instanceof ApiError && err.kind === "network" ? send() : Promise.reject(err)))
        .catch((err) => Promise.reject(notSent(err)))
      if (threads[issueId]) void threads[issueId]!.entries.refresh()
      if (assignTo) {
        void list.refresh()
        if (threads[issueId]) void threads[issueId]!.detail.refresh()
      }
      // The server may keep the comment from the agent (SKO-226, 2026-11-25); say so rather than report it delivered.
      const held = await getHeldComments(session.client(), issueId).catch(() => null)
      if (threads[issueId]) void threads[issueId]!.held.refresh()
      const mine = held?.comments.some((c) => c.clientRequestId === requestId)
      return { failed, held: mine && held!.reason ? held!.reason : null }
    },
    /**
     * For a task assigned to you, the agent a comment should hand it back to, as the web UI suggests; null for other
     * tasks, or when there is no agent to suggest.
     */
    async handBackTo(issueId: string): Promise<string | null> {
      const me = session.state.userId
      const task = threads[issueId]?.detail.data ?? byId(issueId)
      if (!me || task?.assigneeUserId !== me) return null
      return handBackAgent(session.client(), issueId, me).catch(() => null)
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
    attach,
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
      void t.held.refresh()
    },
    /** Wakes the agent now for its scheduled monitor check or retry; the thread is read again after. */
    async wakeNow(issueId: string, kind: "monitor" | "retry") {
      await (kind === "monitor" ? checkMonitorNow(session.client(), issueId) : retryNow(session.client(), issueId)).catch((err) =>
        Promise.reject(err instanceof ApiError ? notSent(err) : err),
      )
      this.refreshThread(issueId)
    },
    /** Sends the task's held comments now; the thread is read again after. */
    async sendHeld(issueId: string, held: HeldComments) {
      await sendHeldComments(session.client(), issueId, held).catch((err) => Promise.reject(notSent(err)))
      this.refreshThread(issueId)
    },
    /** One document of a task, created on first use; the screen reads it again on every visit. */
    document(issueId: string, key: string): Resource<TaskDocument | null> {
      const k = `${issueId}/${key}`
      if (!documents.has(k)) documents.set(k, createResource<TaskDocument | null>(() => getDocument(session.client(), issueId, key), null, session.handleError))
      return documents.get(k)!
    },
    /** The thread of one task, created on first use and kept for the session. */
    thread(id: string): Thread {
      if (!threads[id]) {
        const client = () => session.client()
        setThreads(id, {
          detail: createResource<TaskDetail | null>(() => getTask(client(), id), null, session.handleError),
          entries: createResource<ThreadEntry[]>(() => getThread(client(), id), [], session.handleError),
          cost: createResource<TaskCost | null>(() => getTaskCost(client(), id), null),
          held: createResource<HeldComments | null>(() => getHeldComments(client(), id), null),
        })
      }
      return threads[id]!
    },
  }
}

export type IssuesStore = ReturnType<typeof createIssuesStore>
