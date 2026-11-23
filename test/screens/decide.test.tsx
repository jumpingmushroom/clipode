import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID } from "../fake-server.ts"
import feed from "../fixtures/company/attention-feed.json"
import allInteractions from "../fixtures/company/issue-interactions.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const CONFIRMATION = feed.items.find((i) => i.detail.kind === "confirmation")!
const QUESTION = feed.items.find((i) => i.detail.kind === "questions" && i.id === "id-26")!
const writesTo = (suffix: string) => app!.server.writes.filter((w) => w.path.endsWith(suffix))

test("a question: j/k choose, enter selects, ctrl+s sends the answer with question and option ids", async () => {
  app = await startApp({ route: { name: "item", id: QUESTION.id } })
  let text = await app.frame()
  expect(text).toMatch(/\( \) example label/)
  expect(text).toContain("ctrl+s send")
  app.mockInput.pressKey("s", { ctrl: true })
  expect(await app.frame()).toContain("Answer every question first")
  expect(app.server.writes).toHaveLength(0)
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text).toMatch(/\(•\) example label/)
  app.mockInput.pressKey("s", { ctrl: true })
  await Bun.sleep(50)
  text = await app.frame()
  const [write] = writesTo("/respond")
  expect(write?.method).toBe("POST")
  expect(write?.body).toMatchObject({ answers: [{ questionId: expect.any(String), optionIds: [expect.any(String)] }] })
  expect(write?.path).toContain(`/interactions/${QUESTION.subject.id}/respond`)
  expect(text).toContain("Answer sent")
})

test("a confirmation: enter on accept sends at once; reject asks for an optional reason first", async () => {
  app = await startApp({ route: { name: "item", id: CONFIRMATION.id } })
  await app.frame()
  app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  let text = await app.frame()
  expect(text).toContain("Reject: ")
  expect(app.server.writes).toHaveLength(0)
  await app.mockInput.typeText("Not this one")
  app.mockInput.pressEnter()
  await Bun.sleep(50)
  text = await app.frame()
  expect(writesTo("/reject")[0]?.body).toEqual({ reason: "Not this one" })
  expect(text).toContain("Rejected")
})

test("accepting needs no confirmation", async () => {
  app = await startApp({ route: { name: "item", id: CONFIRMATION.id } })
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(50)
  expect(writesTo("/accept")[0]?.body).toEqual({})
  expect(await app.frame()).toContain("Accepted")
})

test("a refused answer puts the item back in the inbox and shows the error", async () => {
  app = await startApp({ route: { name: "item", id: CONFIRMATION.id }, before: (s) => s.set(`/api/issues/${CONFIRMATION.subject.metadata.issueId}/interactions/${CONFIRMATION.subject.id}/accept`, { error: "Interaction already resolved" }, 409) })
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  const text = await app.frame()
  expect(text).toContain("Not sent: Interaction already resolved")
  expect(text).toContain("inbox 6")
})

test("an approval decision is confirmed with an optional note", async () => {
  const approval = { ...QUESTION, id: "approval-1", sourceKind: "approval", subject: { ...QUESTION.subject, kind: "approval", id: "ap1", metadata: {} }, detail: { kind: "approval", approvalType: "request_board_approval", summaryExcerpt: "Ship it?", images: [] } }
  app = await startApp({
    route: { name: "item", id: "approval-1" },
    before: (s) => {
      s.set(`/api/companies/${COMPANY_ID}/attention`, { ...feed, items: [approval] })
      s.set("/api/approvals/ap1", { id: "ap1", type: "request_board_approval", status: "pending", payload: { title: "Ship it?", summary: "Release now." } })
      s.set("/api/approvals/ap1/issues", [])
    },
  })
  let text = await app.frame()
  expect(text).toMatch(/› Approve[\s\S]*› Reject[\s\S]*› Request revision/)
  app.mockInput.pressKey("j")
  app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("Optional note")
  app.mockInput.pressEnter()
  await Bun.sleep(50)
  expect(app.server.writes.find((w) => w.path === "/api/approvals/ap1/request-revision")?.body).toEqual({})
})

test("with readOnly the options stay inactive and nothing is sent", async () => {
  app = await startApp({ route: { name: "item", id: CONFIRMATION.id }, config: { readOnly: true } })
  const text = await app.frame()
  expect(text).toContain("Answering is turned off")
  app.mockInput.pressEnter()
  app.mockInput.pressKey("s", { ctrl: true })
  await Bun.sleep(50)
  expect(app.server.writes).toHaveLength(0)
})

test("a question shows the comment the agent wrote with it as Context", async () => {
  const issueId = QUESTION.subject.metadata.issueId as string
  app = await startApp({
    route: { name: "item", id: QUESTION.id },
    before: (s) => {
      const interactions = (allInteractions as Record<string, { id: string; originCommentIds: string[] }[]>)[issueId]!
      const withContext = interactions.map((x) => (x.id === QUESTION.subject.id ? { ...x, originCommentIds: ["c-1"] } : x))
      s.set(`/api/issues/${issueId}/interactions`, withContext)
      s.set(`/api/issues/${issueId}/comments`, [{ id: "c-1", body: "I compared **three queues**; pg-boss needs no new infrastructure." }, { id: "c-2", body: "unrelated" }])
    },
  })
  const text = await app.frame()
  expect(text).toContain("Context")
  expect(text).toContain("three queues")
  expect(text).not.toContain("unrelated")
})

test("without linked comments, the context is what the same run wrote on the task", async () => {
  const issueId = QUESTION.subject.metadata.issueId as string
  app = await startApp({
    route: { name: "item", id: QUESTION.id },
    before: (s) => {
      const interactions = (allInteractions as Record<string, { id: string }[]>)[issueId]!
      s.set(`/api/issues/${issueId}/interactions`, interactions.map((x) => (x.id === QUESTION.subject.id ? { ...x, originCommentIds: [], sourceRunId: "run-7" } : x)))
      s.set(`/api/issues/${issueId}/comments`, [
        { id: "c-1", body: "Older note from another run", createdByRunId: "run-3" },
        { id: "c-2", body: "## Proposal\n\nRoute A enables auth.", createdByRunId: "run-7" },
      ])
    },
  })
  const text = await app.frame()
  expect(text).toContain("Context")
  expect(text).toContain("Route A enables auth.")
  expect(text).not.toContain("Older note")
})

const reviewItem = (stalled: boolean) => ({
  ...QUESTION,
  id: "review-1",
  sourceKind: "review",
  whyNow: stalled ? "Issue is in review without a maintained reviewer." : "Issue is in review with a linked pending approval.",
  subject: { ...QUESTION.subject, kind: "issue", id: "task-9", identifier: "DEMO-9", metadata: stalled ? { reviewAttentionState: "stalled" } : {} },
  relatedIssue: null,
  detail: { kind: "generic", summaryExcerpt: null, images: [] },
})

test("a stalled review: request changes needs a note; approve sends with an optional one", async () => {
  app = await startApp({ route: { name: "item", id: "review-1" }, before: (s) => s.set(`/api/companies/${COMPANY_ID}/attention`, { ...feed, items: [reviewItem(true)] }) })
  let text = await app.frame()
  expect(text).toMatch(/› Approve, and mark the task done[\s\S]*› Request changes[\s\S]*› Send back to work/)
  app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("What should change? Required")
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("Request changes needs a note")
  expect(app.server.writes).toHaveLength(0)
  app.mockInput.pressEnter()
  await app.frame()
  await app.mockInput.typeText("Add tests for the importer")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: "/api/issues/task-9/stalled-review-decision", body: { action: "request_changes", note: "Add tests for the importer" } })
  text = await app.frame()
  expect(text).toContain("Request changes: sent")
})

test("a review that is not stalled is decided elsewhere and offers no actions", async () => {
  app = await startApp({ route: { name: "item", id: "review-1" }, before: (s) => s.set(`/api/companies/${COMPANY_ID}/attention`, { ...feed, items: [reviewItem(false)] }) })
  const text = await app.frame()
  expect(text).toContain("decided where it waits")
  expect(text).not.toContain("Request changes")
  app.mockInput.pressEnter()
  await Bun.sleep(40)
  expect(app.server.writes).toHaveLength(0)
})
