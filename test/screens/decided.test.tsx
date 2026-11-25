import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

test("g d lists resolved items and decided approvals, newest first; enter opens an approval's task", async () => {
  app = await startApp({
    before: (s) => {
      s.set(`/api/companies/${COMPANY_ID}/attention/history`, {
        items: [
          { id: "h1", sourceKind: "issue_thread_interaction", title: "Pick a colour", label: "Answers recorded", outcome: "answered", resolvedAt: "2026-11-24T10:00:00.000Z", resolvedByUserId: "u", resolvedByAgentId: null, issueId: THREAD_ID, issueIdentifier: "DEMO-1" },
          { id: "h2", sourceKind: "decision", title: "Which fruit", label: "Apple", outcome: "decided", resolvedAt: "2026-11-22T10:00:00.000Z", resolvedByUserId: "someone-else", resolvedByAgentId: null, issueId: THREAD_ID, issueIdentifier: "DEMO-1" },
        ],
        nextCursor: null,
      })
      s.set(`/api/companies/${COMPANY_ID}/approvals`, [
        { id: "a1", type: "request_board_approval", status: "rejected", payload: { title: "Ship the script" }, decisionNote: "Not on a Friday", decidedByUserId: "u", decidedAt: "2026-11-25T10:00:00.000Z" },
        { id: "a2", type: "request_board_approval", status: "pending", payload: { title: "Still waiting" }, decisionNote: null, decidedByUserId: null, decidedAt: null },
      ])
      s.set("/api/approvals/a1/issues", [{ id: THREAD_ID, identifier: "DEMO-1" }])
    },
  })
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("d")
  const text = await app.frame()
  expect(text.split("\n")[0]).toContain("Decided")
  const rows = text.split("\n").filter((l) => /Rejected|Answers recorded|Apple/.test(l))
  expect(rows[0]).toMatch(/◆ Rejected\s+Ship the script/)
  expect(rows[1]).toMatch(/\? Answers recorded\s+DEMO-1\s+Pick a colour/)
  expect(rows[2]).toMatch(/◈ Apple\s+DEMO-1\s+Which fruit/)
  expect(text).not.toContain("Still waiting")
  expect(text).toContain("Not on a Friday")
  app.mockInput.pressEnter()
  await app.frame()
  expect(app.server.requests).toContain("GET /api/approvals/a1/issues")
  expect(app.server.requests).toContain(`GET /api/issues/${THREAD_ID}/comments`)
})
