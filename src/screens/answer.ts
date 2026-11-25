// What can be chosen in an opened inbox item, and the answers built from those choices.
import { RECOVERY_OUTCOMES, type Answer, type ApprovalDecision, type DecisionOption, type ItemDetail, type Question, type RecoveryOutcome, type ReviewDecision } from "../store/attention.ts"

export type Choice =
  | { kind: "option"; questionId: string; optionId: string; label: string }
  | { kind: "other"; questionId: string; label: string }
  | { kind: "accept" | "reject"; label: string }
  | { kind: "approval"; decision: ApprovalDecision; label: string }
  | { kind: "review"; action: ReviewDecision; label: string }
  | { kind: "approval-comment"; label: string }
  | { kind: "decision"; option: DecisionOption; label: string }
  | { kind: "decision-dismiss"; label: string }
  | { kind: "retry" | "clear-error"; label: string }
  | { kind: "recovery"; outcome: RecoveryOutcome; label: string }

/** An option's label with what choosing it does, so effects are never a surprise. */
const optionLabel = (o: DecisionOption) =>
  `${o.label}${o.description ? `: ${o.description}` : ""} (${o.effects.length ? o.effects.join(", ") : "no effects"})`

/** Every choice in display order, so one cursor can move through all of them. */
export function choicesFor(detail: ItemDetail): Choice[] {
  if (detail.kind === "question") {
    return detail.questions.flatMap((q): Choice[] => [
      ...q.options.map((o): Choice => ({ kind: "option", questionId: q.id, optionId: o.id, label: o.label })),
      ...(q.allowOther ? [{ kind: "other" as const, questionId: q.id, label: "Something else, with a written reply" }] : []),
    ])
  }
  if (detail.kind === "confirmation") {
    return [
      { kind: "accept", label: detail.acceptLabel },
      { kind: "reject", label: detail.rejectLabel },
    ]
  }
  if (detail.kind === "approval") {
    return [
      { kind: "approval", decision: "approve", label: "Approve" },
      { kind: "approval", decision: "reject", label: "Reject" },
      { kind: "approval", decision: "request-revision", label: "Request revision" },
      { kind: "approval-comment", label: "Comment on the approval" },
    ]
  }
  if (detail.kind === "decision") {
    return [
      ...detail.options.map((option): Choice => ({ kind: "decision", option, label: optionLabel(option) })),
      { kind: "decision-dismiss", label: "Dismiss: close it, and nothing happens" },
    ]
  }
  if (detail.kind === "failed_run") return [{ kind: "retry", label: "Retry the run" }]
  if (detail.kind === "agent_error") return [{ kind: "clear-error", label: "Clear the error and return the agent to idle" }]
  if (detail.kind === "recovery") return RECOVERY_OUTCOMES.map((outcome): Choice => ({ kind: "recovery", outcome, label: outcome.label }))
  if (detail.kind === "review" && detail.stalled) {
    return [
      { kind: "review", action: "approve", label: "Approve, and mark the task done" },
      { kind: "review", action: "request_changes", label: "Request changes" },
      { kind: "review", action: "send_back", label: "Send back to work" },
    ]
  }
  return []
}

/** Chosen options and written text per question id. */
export type Selection = Record<string, { optionIds: string[]; otherText?: string }>

/** Picks an option: a single-choice question replaces its answer, a multiple-choice question toggles it. */
export function toggle(selection: Selection, question: Question, optionId: string): Selection {
  const current = selection[question.id] ?? { optionIds: [] }
  const optionIds = question.multiple
    ? current.optionIds.includes(optionId)
      ? current.optionIds.filter((id) => id !== optionId)
      : [...current.optionIds, optionId]
    : [optionId]
  return { ...selection, [question.id]: { optionIds, otherText: question.multiple ? current.otherText : undefined } }
}

/** Sets the written answer; on a single-choice question it replaces the chosen option. */
export function writeOther(selection: Selection, question: Question, text: string): Selection {
  const current = selection[question.id] ?? { optionIds: [] }
  return { ...selection, [question.id]: { optionIds: question.multiple ? current.optionIds : [], otherText: text || undefined } }
}

const answered = (selection: Selection, q: Question) => {
  const s = selection[q.id]
  return !!s && (s.optionIds.length > 0 || !!s.otherText)
}

/** The questions that still need an answer before sending. */
export function missing(questions: Question[], selection: Selection): Question[] {
  return questions.filter((q) => q.required && !answered(selection, q))
}

export function toAnswers(questions: Question[], selection: Selection): Answer[] {
  return questions
    .filter((q) => answered(selection, q))
    .map((q) => ({ questionId: q.id, optionIds: selection[q.id]!.optionIds, ...(selection[q.id]!.otherText ? { otherText: selection[q.id]!.otherText } : {}) }))
}
