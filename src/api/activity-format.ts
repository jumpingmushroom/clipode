// Ported from paperclip ui/src/lib/activity-format.ts and ui/src/components/ActivityFeed.tsx (MIT): the words for
// activity actions and which actions are bookkeeping. A subset: actions clipode has seen, plus their close relatives.

const VERBS: Record<string, string> = {
  "issue.created": "created",
  "issue.updated": "updated",
  "issue.read_marked": "read",
  "issue.checked_out": "checked out",
  "issue.released": "released",
  "issue.comment_added": "commented on",
  "issue.commented": "commented on",
  "issue.queued_comment_discarded": "discarded a queued comment on",
  "issue.attachment_added": "attached a file to",
  "issue.document_created": "created a document for",
  "issue.document_updated": "updated a document on",
  "issue.deleted": "deleted",
  "issue.blockers_updated": "changed blockers on",
  "issue.recovery_action_resolved": "resolved the recovery action on",
  "issue.thread_interaction_created": "asked for a decision on",
  "issue.thread_interaction_accepted": "accepted the request on",
  "issue.thread_interaction_rejected": "rejected the request on",
  "issue.thread_interaction_answered": "answered the request on",
  "issue.thread_interaction_cancelled": "cancelled the request on",
  "issue.stalled_review_decided": "recorded a review verdict on",
  "agent.created": "created",
  "agent.updated": "updated",
  "agent.paused": "paused",
  "agent.resumed": "resumed",
  "agent.terminated": "terminated",
  "heartbeat.invoked": "started a run of",
  "heartbeat.cancelled": "cancelled a run of",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
  "approval.revision_requested": "requested a revision of",
  "project.created": "created",
  "project.updated": "updated",
  "goal.created": "created",
  "goal.updated": "updated",
  "routine.run_triggered": "started",
  "routine.updated": "updated",
  "cost.reported": "reported cost for",
  "company.created": "created organization",
}

const REVIEW_DECISIONS: Record<string, string> = {
  approve: "approved the review on",
  request_changes: "requested changes on",
  send_back: "sent back to work",
}
const ACCEPTED: Record<string, string> = {
  request_confirmation: "approved the request on",
  suggest_tasks: "accepted the task suggestions on",
  ask_user_questions: "accepted the answers on",
}
const REJECTED: Record<string, string> = {
  request_confirmation: "rejected the request on",
  suggest_tasks: "declined the task suggestions on",
  ask_user_questions: "declined the questions on",
}

// The web UI shows these by default. It also hides decisions on interactions and reviews; clipode shows them, since
// they are what an operator does.
const SHOWN = new Set([
  "issue.created",
  "issue.document_created",
  "issue.document_updated",
  "issue.work_product_created",
  "issue.updated",
  "issue.checked_out",
  "issue.comment_added",
  "issue.commented",
  "issue.thread_interaction_created",
  "issue.thread_interaction_accepted",
  "issue.thread_interaction_rejected",
  "issue.thread_interaction_answered",
  "issue.stalled_review_decided",
  "approval.created",
  "approval.approved",
  "approval.rejected",
  "approval.revision_requested",
  "agent.created",
  "agent.updated",
  "agent.paused",
  "agent.resumed",
  "agent.terminated",
  "heartbeat.invoked",
  "heartbeat.cancelled",
  "project.created",
  "goal.created",
])

export const isMinor = (action: string) => !SHOWN.has(action)

const human = (v: unknown) => String(v ?? "none").replace(/_/g, " ")

export function activityVerb(action: string, details: Record<string, unknown> | null): string {
  const d = details ?? {}
  const previous = (d._previous && typeof d._previous === "object" ? d._previous : {}) as Record<string, unknown>
  if (action === "issue.updated") {
    for (const field of ["status", "priority"]) {
      if (d[field] === undefined) continue
      return previous[field] ? `changed ${field} from ${human(previous[field])} to ${human(d[field])} on` : `changed ${field} to ${human(d[field])} on`
    }
  }
  if (action === "issue.stalled_review_decided" && typeof d.action === "string" && REVIEW_DECISIONS[d.action]) return REVIEW_DECISIONS[d.action]!
  const kind = typeof d.interactionKind === "string" ? d.interactionKind : ""
  if (action === "issue.thread_interaction_accepted" && ACCEPTED[kind]) return ACCEPTED[kind]!
  if (action === "issue.thread_interaction_rejected" && REJECTED[kind]) return REJECTED[kind]!
  return VERBS[action] ?? action.replace(/[._]/g, " ")
}
