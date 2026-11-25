// The inbox: attention items for the selected company, the badge count, and item details fetched on open.
import { createSignal } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import {
  approvalDetail,
  blockedDetail,
  confirmationDetail,
  decisionDetail,
  getInbox,
  dismissItem,
  getInteractions,
  questionContext,
  questionDetail,
  restoreItem,
  snoozeItem,
  type InboxFeed,
} from "../api/endpoints/attention.ts"
import type { Answer, InboxItem, ItemDetail } from "../api/model.ts"
import { clearAgentError, retryRun } from "../api/endpoints/agents.ts"
import {
  acceptConfirmation,
  answerQuestions,
  commentOnApproval,
  decideApproval,
  decideDecision,
  decideStalledReview,
  dismissDecision,
  rejectConfirmation,
  resolveRecovery,
  retryTask,
  type ApprovalDecision,
  type RecoveryOutcome,
  type ReviewDecision,
} from "../api/endpoints/decisions.ts"
import { ApiError } from "../api/client.ts"
import { createResource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { Answer, DecisionOption, InboxItem, ItemDetail, Question } from "../api/model.ts"
export { RECOVERY_OUTCOMES, type ApprovalDecision, type RecoveryOutcome, type ReviewDecision } from "../api/endpoints/decisions.ts"

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
      case "question": {
        const interaction = item.issueId ? (await forIssue(item.issueId)).find((i) => i.id === item.subjectId) : undefined
        // The context is a nicety: without it the question still shows.
        const context = item.issueId ? await questionContext(client, item.issueId, interaction).catch(() => null) : null
        return questionDetail(interaction, context)
      }
      case "confirmation":
        return confirmationDetail(item.issueId ? (await forIssue(item.issueId)).find((i) => i.id === item.subjectId) : undefined, item.summary)
      case "approval":
        return approvalDetail(client, item.subjectId)
      case "decision":
        return decisionDetail(client, item.subjectId)
      case "failed_run":
        return { kind: "failed_run", error: item.summary ?? item.whyNow, runId: item.subjectId }
      case "agent_error":
        return { kind: "agent_error", error: item.summary ?? item.whyNow }
      case "recovery":
        return { kind: "recovery", summary: item.summary ?? item.title, cause: item.cause }
      case "review":
        return { kind: "review", stalled: item.reviewStalled, whyNow: item.whyNow }
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
    /**
     * The header badge: items that need you, without snoozed or dismissed ones and those being decided; null before the
     * first load. The feed is loaded whole (all=true), so counting it is exact; the server's total includes dismissals.
     */
    badge: () => (feed.loadedAt ? items().filter((i) => !i.snoozed).length : null),
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
        throw err instanceof ApiError ? session.notSent(err) : err
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
    review(item: InboxItem, action: ReviewDecision, note?: string) {
      return this.act(item, () => decideStalledReview(session.client(), item.issueId!, action, note))
    },
    decide(item: InboxItem, decision: ApprovalDecision, note?: string) {
      return this.act(item, () => decideApproval(session.client(), item.subjectId, decision, note))
    },
    /** Chooses a decision's option; the key makes a resend after a lost answer replay the first outcome. */
    choose(item: InboxItem, optionId: string, inputs: Record<string, string>) {
      const key = crypto.randomUUID()
      return this.act(item, () => decideDecision(session.client(), item.subjectId, optionId, inputs, key))
    },
    dismissDecision(item: InboxItem, reason?: string) {
      return this.act(item, () => dismissDecision(session.client(), item.subjectId, reason))
    },
    /** Retries a failed run: through its task when it had one, else by waking its agent on that run. */
    retry(item: InboxItem) {
      const key = crypto.randomUUID()
      return this.act(item, async () => {
        if (!item.issueId) return void (await retryRun(session.client(), item.agentId!, item.subjectId, key))
        const result = await retryTask(session.client(), item.issueId, item.subjectId, key)
        // Not an HTTP error, so act would not report it: the task moved on since the run failed.
        if (!result.accepted) throw new Error("Not retried: the task has a newer run, or is closed or unassigned")
      })
    },
    clearError(item: InboxItem) {
      return this.act(item, () => clearAgentError(session.client(), item.subjectId))
    },
    resolveRecovery(item: InboxItem, choice: RecoveryOutcome, note?: string) {
      return this.act(item, () => resolveRecovery(session.client(), item.issueId!, item.subjectId, choice, note))
    },
    /** Comments on an approval; the item stays, and its discussion is read again. */
    async commentOnApproval(item: InboxItem, body: string) {
      await commentOnApproval(session.client(), item.subjectId, body).catch((err) => Promise.reject(session.notSent(err)))
      setDetails(item.id, { status: "ready", detail: await approvalDetail(session.client(), item.subjectId) })
    },
    dismiss(item: InboxItem) {
      return this.act(item, () => dismissItem(session.client(), companyId, item.dismissalKey))
    },
    snooze(item: InboxItem, until: Date) {
      return this.act(item, () => snoozeItem(session.client(), companyId, item.dismissalKey, until))
    },
    /** Brings a dismissed or snoozed item back onto its shelf. */
    restore(item: InboxItem) {
      return this.act(item, () => restoreItem(session.client(), companyId, item.dismissalKey))
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
      // reconcile replaces the store; setDetails({}) would merge nothing into it and keep every cached detail.
      setDetails(reconcile({}))
      return feed.refresh()
    },
  }
}

export type AttentionStore = ReturnType<typeof createAttentionStore>
