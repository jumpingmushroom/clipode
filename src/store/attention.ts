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
import type { InboxItem, ItemDetail } from "../api/model.ts"
import { createResource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { InboxItem, ItemDetail, Question } from "../api/model.ts"

export type Sort = "activity" | "decide"

export function createAttentionStore(session: Session, companyId: string) {
  const [sort, setSort] = createSignal<Sort>("activity")
  const feed = createResource<InboxFeed>(
    () => getInbox(session.client(), companyId, sort()),
    { items: [], totalCount: 0 },
    session.handleError,
  )
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

  return {
    feed,
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
