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
