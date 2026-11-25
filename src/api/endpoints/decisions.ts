// Phase 2 writes: answering questions, deciding confirmations and approvals. Bodies as probed in the scratch company.
import type { Client } from "../client.ts"
import type { Answer } from "../model.ts"

const id = encodeURIComponent
const interaction = (issueId: string, interactionId: string, verb: string) => `/api/issues/${id(issueId)}/interactions/${id(interactionId)}/${verb}`

export function answerQuestions(client: Client, issueId: string, interactionId: string, answers: Answer[]) {
  return client.post(interaction(issueId, interactionId, "respond"), { answers })
}

export function acceptConfirmation(client: Client, issueId: string, interactionId: string) {
  return client.post(interaction(issueId, interactionId, "accept"), {})
}

export function rejectConfirmation(client: Client, issueId: string, interactionId: string, reason?: string) {
  return client.post(interaction(issueId, interactionId, "reject"), reason ? { reason } : {})
}

export type ApprovalDecision = "approve" | "reject" | "request-revision"

export function decideApproval(client: Client, approvalId: string, decision: ApprovalDecision, note?: string) {
  return client.post(`/api/approvals/${id(approvalId)}/${decision}`, note ? { decisionNote: note } : {})
}

export type ReviewDecision = "approve" | "request_changes" | "send_back"

/** Decides a stalled review: approve marks the task done; the others return it to the assignee with the note. */
export function decideStalledReview(client: Client, issueId: string, action: ReviewDecision, note?: string) {
  return client.post(`/api/issues/${id(issueId)}/stalled-review-decision`, note ? { action, note } : { action })
}

// The inbox's other decisions (phase 3), as probed in the scratch company on 2026-11-25.

/** Decides an agent's decision. The same idempotency key replays the stored outcome; a decided one answers 409. */
export function decideDecision(client: Client, decisionId: string, optionId: string, inputValues: Record<string, string>, idempotencyKey: string) {
  const values = Object.keys(inputValues).length ? { inputValues } : {}
  return client.post(`/api/decisions/${id(decisionId)}/decide`, { optionId, ...values, idempotencyKey })
}

/** Closes a decision without running any option's effects. */
export function dismissDecision(client: Client, decisionId: string, reason?: string) {
  return client.post(`/api/decisions/${id(decisionId)}/dismiss`, reason ? { reason } : {})
}

export function commentOnApproval(client: Client, approvalId: string, body: string) {
  return client.post(`/api/approvals/${id(approvalId)}/comments`, { body })
}

export type RetryResult = { accepted: boolean; stale: boolean }

/**
 * Retries a task's failed run. The server answers 202 when it queues the retry, and 200 with accepted false when the
 * run is no longer the task's latest, or the task is closed or unassigned.
 */
export function retryTask(client: Client, issueId: string, observedRunId: string, idempotencyKey: string) {
  return client.post<RetryResult>(`/api/issues/${id(issueId)}/retry`, { idempotencyKey, observedRunId })
}

/** The web UI's ways to resolve a recovery action: the outcome and the status the task moves to. */
export const RECOVERY_OUTCOMES = [
  { outcome: "restored", status: "todo", label: "Try again: the task goes back to todo" },
  { outcome: "restored", status: "done", label: "Mark the task done" },
  { outcome: "restored", status: "in_review", label: "Send the task for review" },
  { outcome: "false_positive", status: "done", label: "False positive: the task is done" },
  { outcome: "false_positive", status: "in_review", label: "False positive: send it for review" },
] as const

export type RecoveryOutcome = (typeof RECOVERY_OUTCOMES)[number]

export function resolveRecovery(client: Client, issueId: string, actionId: string, choice: RecoveryOutcome, note?: string) {
  return client.post(`/api/issues/${id(issueId)}/recovery-actions/resolve`, {
    actionId,
    outcome: choice.outcome,
    sourceIssueStatus: choice.status,
    ...(note ? { resolutionNote: note } : {}),
  })
}
