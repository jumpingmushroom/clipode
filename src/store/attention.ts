// The inbox: attention items for the selected company, the badge count, and item details fetched on open.
import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import {
  approvalDetail,
  blockedDetail,
  confirmationDetail,
  getInbox,
  getInteractions,
  questionDetail,
  type InboxFeed,
} from "../api/endpoints/attention.ts"
import type { Answer, InboxItem, ItemDetail } from "../api/model.ts"
import { acceptConfirmation, answerQuestions, decideApproval, rejectConfirmation, type ApprovalDecision } from "../api/endpoints/decisions.ts"
import { createResource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { Answer, InboxItem, ItemDetail, Question } from "../api/model.ts"
export type { ApprovalDecision } from "../api/endpoints/decisions.ts"

export type Sort = "activity" | "decide"

export function createAttentionStore(session: Session, companyId: string) {
  const [sort, setSort] = createSignal<Sort>("activity")
  const feed = createResource<InboxFeed>(
    () => getInbox(session.client(), companyId, sort()),
    { items: [], totalCount: 0 },
    session.handleError,
  )
  // Items whose answer or decision is on its way: hidden at once, shown again if the server refuses.
  const [hidden, setHidden] = createSignal<string[]>([])
  const [details, setDetails] = createStore<Record<string, { status: "loading" | "ready" | "error"; detail?: ItemDetail; error?: string }>>({})
  const interactions = new Map<string, ReturnType<typeof getInteractions>>()

  async function fetchDetail(item: InboxItem): Promise<ItemDetail> {
    const client = session.client()
    const forIssue = (issueId: string) => {
      if (!interactions.has(issueId)) interactions.set(issueId, getInteractions(client, issueId))
      return interactions.get(issueId)!
    }
    switch (item.kind) {
      case "question":
        return questionDetail(item.issueId ? (await forIssue(item.issueId)).find((i) => i.id === item.subjectId) : undefined)
      case "confirmation":
        return confirmationDetail(item.issueId ? (await forIssue(item.issueId)).find((i) => i.id === item.subjectId) : undefined, item.summary)
      case "approval":
        return approvalDetail(client, item.subjectId)
      case "failed_run":
        return { kind: "failed_run", error: item.summary ?? item.whyNow, runId: item.subjectId }
      case "blocked":
        return item.issueId ? blockedDetail(client, item.issueId) : { kind: "blocked", description: null, blockers: [] }
      default:
        return { kind: "other", summary: item.summary }
    }
  }

  const items = () => feed.data.items.filter((i) => !hidden().includes(i.id))
  return {
    feed,
    /** The inbox without items whose decision is being sent. */
    items,
    /** The header badge: the server's total minus items being decided, or null before the first load. */
    badge: () => (feed.loadedAt ? Math.max(0, feed.data.totalCount - hidden().length) : null),
    /**
     * Sends a decision for an item optimistically: the item leaves the inbox at once and the feed is refetched after
     * the server accepts. If the server refuses, the item comes back and the error is thrown to the caller.
     */
    async act(item: InboxItem, send: () => Promise<unknown>) {
      setHidden((h) => [...h, item.id])
      try {
        await send()
        await feed.refresh()
      } catch (err) {
        session.handleError(err)
        // The server's own reason ("Interaction already resolved") reads better than the request line.
        const body = (err as { body?: { error?: unknown } }).body
        throw new Error(`Not sent: ${typeof body?.error === "string" ? body.error : (err as Error).message}`)
      } finally {
        setHidden((h) => h.filter((id) => id !== item.id))
      }
    },
    answer(item: InboxItem, answers: Answer[]) {
      return this.act(item, () => answerQuestions(session.client(), item.issueId!, item.subjectId, answers))
    },
    accept(item: InboxItem) {
      return this.act(item, () => acceptConfirmation(session.client(), item.issueId!, item.subjectId))
    },
    reject(item: InboxItem, reason?: string) {
      return this.act(item, () => rejectConfirmation(session.client(), item.issueId!, item.subjectId, reason))
    },
    decide(item: InboxItem, decision: ApprovalDecision, note?: string) {
      return this.act(item, () => decideApproval(session.client(), item.subjectId, decision, note))
    },
    sort,
    setSort(next: Sort) {
      setSort(next)
      void feed.refresh()
    },
    /** Loads the detail behind an item once; later calls return the cached copy. */
    open(item: InboxItem) {
      if (details[item.id]?.status === "ready" || details[item.id]?.status === "loading") return
      setDetails(item.id, { status: "loading" })
      fetchDetail(item).then(
        (detail) => setDetails(item.id, { status: "ready", detail }),
        (err: unknown) => {
          session.handleError(err)
          setDetails(item.id, { status: "error", error: err instanceof Error ? err.message : String(err) })
        },
      )
    },
    detail: (id: string) => details[id],
    /** Drops cached details, for a refresh after a live event. */
    refresh() {
      interactions.clear()
      setDetails({})
      return feed.refresh()
    },
  }
}

export type AttentionStore = ReturnType<typeof createAttentionStore>
