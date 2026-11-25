import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID } from "../fake-server.ts"
import feed from "../fixtures/company/attention-feed.json"
import recorded from "../fixtures/writes/attention-decision-approval.json"
import decisionGet from "../fixtures/writes/decision-get.json"
import retryAccepted from "../fixtures/writes/task-retry.json"
import retryStale from "../fixtures/writes/task-retry-stale.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const [, DECISION, APPROVAL] = recorded.response.items as [unknown, typeof recorded.response.items[number], typeof recorded.response.items[number]]
const DECISION_ID = DECISION!.subject.id
const decision = {
  ...decisionGet.response,
  body: "Pick a fruit.",
  options: [
    { ...decisionGet.response.options[0]!, id: "apple", label: "Apple" },
    { ...decisionGet.response.options[1]!, id: "none", label: "No fruit" },
  ],
  inputs: [{ id: "why", label: "Why?", required: false }],
}
const withItems = (...items: unknown[]) => (s: Running["server"]) => s.set(`/api/companies/${COMPANY_ID}/attention`, { ...feed, items })

test("a decision shows what each option does; choosing asks for its inputs and sends the option", async () => {
  app = await startApp({ route: { name: "item", id: DECISION!.id }, before: (s) => (withItems(DECISION)(s), s.set(`/api/decisions/${DECISION_ID}`, decision)) })
  const text = await app.frame()
  expect(text).toContain("Pick a fruit.")
  expect(text).toContain("Choosing asks for: Why? (optional)")
  expect(text).toMatch(/› Apple \(comments on a task\)[\s\S]*› No fruit \(no effects\)[\s\S]*› Dismiss/)
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("Why?")
  await app.mockInput.typeText("Tasty")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  const [write] = app.server.writes
  expect(write?.path).toBe(`/api/decisions/${DECISION_ID}/decide`)
  expect(write?.body).toEqual({ optionId: "apple", inputValues: { why: "Tasty" }, idempotencyKey: expect.any(String) })
  expect(await app.frame()).toContain("Apple: sent")
})

test("a decision's cancel-tree option needs the task identifier typed out", async () => {
  const cancel = { id: "stop", label: "Stop it all", style: "destructive", effects: [{ type: "cancel_issue_tree" }] }
  app = await startApp({
    route: { name: "item", id: DECISION!.id },
    before: (s) => (withItems(DECISION)(s), s.set(`/api/decisions/${DECISION_ID}`, { ...decision, inputs: [], options: [cancel] })),
  })
  await app.frame()
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain(`Type ${DECISION!.relatedIssue!.identifier} to confirm`)
  await app.mockInput.typeText("nope")
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("Not sent")
  expect(app.server.writes).toHaveLength(0)
  app.mockInput.pressEnter()
  await app.frame()
  await app.mockInput.typeText(DECISION!.relatedIssue!.identifier!)
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]?.body).toMatchObject({ optionId: "stop" })
})

test("dismissing a decision sends the optional reason", async () => {
  app = await startApp({ route: { name: "item", id: DECISION!.id }, before: (s) => (withItems(DECISION)(s), s.set(`/api/decisions/${DECISION_ID}`, decision)) })
  await app.frame()
  app.mockInput.pressKey("j")
  app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("Optional reason")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: `/api/decisions/${DECISION_ID}/dismiss`, body: {} })
  expect(await app.frame()).toContain("Decision dismissed")
})

test("an approval shows its discussion and takes a comment without leaving the item", async () => {
  const id = APPROVAL!.subject.id
  app = await startApp({
    route: { name: "item", id: APPROVAL!.id },
    before: (s) => {
      withItems(APPROVAL)(s)
      s.set(`/api/approvals/${id}`, { id, type: "request_board_approval", status: "pending", payload: { title: "Ship it?" } })
      s.set(`/api/approvals/${id}/issues`, [])
      s.set(`/api/approvals/${id}/comments`, [{ id: "c1", authorAgentId: null, body: "Looks fine so far.", createdAt: "2026-11-25T11:26:53.153Z" }])
    },
  })
  let text = await app.frame()
  expect(text).toContain("Discussion")
  expect(text).toContain("Looks fine so far.")
  for (let i = 0; i < 3; i++) app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("Comment on the approval")
  await app.mockInput.typeText("One more thing")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: `/api/approvals/${id}/comments`, body: { body: "One more thing" } })
  text = await app.frame()
  expect(text).toContain("Comment posted")
  expect(text).toContain("Ship it?")
})

const failedRun = (issueId: string | null) => ({
  ...DECISION,
  id: "run-item",
  sourceKind: "failed_run",
  subject: { kind: "run", id: "run-1", title: "Agent run failed", identifier: null, status: "failed", metadata: { agentId: "agent-1", issueId, error: "adapter exited 1" } },
  relatedIssue: null,
  detail: { kind: "failed_run", agentName: "Builder", failureReasonExcerpt: "adapter exited 1", images: [] },
})

test("retrying a failed run on a task sends the run it saw; a stale answer is reported", async () => {
  app = await startApp({ route: { name: "item", id: "run-item" }, before: (s) => (withItems(failedRun("task-1"))(s), s.set("/api/issues/task-1/retry", retryStale.response)) })
  let text = await app.frame()
  expect(text).toContain("adapter exited 1")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: "/api/issues/task-1/retry", body: { idempotencyKey: expect.any(String), observedRunId: "run-1" } })
  text = await app.frame()
  expect(text).toContain("Not retried")
  expect(text).toContain("Inbox ·")
})

test("an accepted retry leaves the item", async () => {
  app = await startApp({ route: { name: "item", id: "run-item" }, before: (s) => (withItems(failedRun("task-1"))(s), s.set("/api/issues/task-1/retry", retryAccepted.response, 202)) })
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(await app.frame()).toContain("Retry queued")
})

test("retrying a failed run without a task wakes its agent on that run", async () => {
  app = await startApp({ route: { name: "item", id: "run-item" }, before: (s) => (withItems(failedRun(null))(s), s.set("/api/agents/agent-1/wakeup", {}, 202)) })
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]?.path).toBe("/api/agents/agent-1/wakeup")
  expect(app.server.writes[0]?.body).toMatchObject({ reason: "retry_failed_run", failedRunId: "run-1" })
  expect(await app.frame()).toContain("Retry queued")
})

test("an agent error is cleared from the inbox", async () => {
  const item = {
    ...DECISION,
    id: "agent-item",
    sourceKind: "agent_error_alert",
    subject: { kind: "agent", id: "agent-1", title: "Builder", identifier: null, status: "error", metadata: { role: "engineer", errorReason: "Token expired" } },
    relatedIssue: null,
    detail: { kind: "agent_error", agentName: "Builder", failureReasonExcerpt: "Token expired", images: [] },
  }
  app = await startApp({ route: { name: "item", id: "agent-item" }, before: (s) => (withItems(item)(s), s.set("/api/agents/agent-1/clear-error", {})) })
  const text = await app.frame()
  expect(text).toContain("Token expired")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: "/api/agents/agent-1/clear-error", body: {} })
})

test("a recovery action is resolved on its task with the chosen outcome", async () => {
  const item = {
    ...DECISION,
    id: "recovery-item",
    sourceKind: "recovery_action",
    subject: { kind: "recovery_action", id: "rec-1", title: "Decide what happens to this task", identifier: null, status: "active", metadata: { cause: "stranded_assigned_issue", sourceIssueId: "task-1" } },
    relatedIssue: { ...DECISION!.relatedIssue!, id: "task-1" },
    detail: { kind: "generic", summaryExcerpt: "Decide what happens to this task", images: [] },
  }
  app = await startApp({ route: { name: "item", id: "recovery-item" }, before: (s) => (withItems(item)(s), s.set("/api/issues/task-1/recovery-actions/resolve", {})) })
  const text = await app.frame()
  expect(text).toContain("Cause: stranded assigned issue")
  app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({
    method: "POST",
    path: "/api/issues/task-1/recovery-actions/resolve",
    body: { actionId: "rec-1", outcome: "restored", sourceIssueStatus: "done" },
  })
})
