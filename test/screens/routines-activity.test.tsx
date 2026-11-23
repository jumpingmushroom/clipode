import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import agents from "../fixtures/company/agents.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const soon = new Date(Date.now() + 25 * 60_000).toISOString()
const routines = [
  {
    id: "r1", title: "Inbox sweep", status: "active", assigneeAgentId: agents[0]!.id, projectId: null, concurrencyPolicy: "skip_if_active",
    triggers: [{ id: "t1", kind: "schedule", label: "Every 30 min", enabled: true, cronExpression: "*/30 * * * *", timezone: "Europe/Oslo", nextRunAt: soon, lastFiredAt: null, lastResult: null }],
    lastRun: { status: "completed", triggeredAt: new Date(Date.now() - 5 * 60_000).toISOString(), createdAt: "", linkedIssueId: THREAD_ID, linkedIssue: { id: THREAD_ID, identifier: "DEMO-9" } },
    activeIssue: null,
  },
  { id: "r2", title: "Monthly close", status: "paused", assigneeAgentId: null, projectId: null, concurrencyPolicy: "always_enqueue", triggers: [], lastRun: null, activeIssue: null },
]
const at = new Date(Date.now() - 2 * 3600_000).toISOString()
const activity = [
  { id: "e1", actorType: "agent", actorId: agents[0]!.id, action: "issue.updated", entityType: "issue", entityId: THREAD_ID, details: { identifier: "DEMO-9", issueTitle: "Sweep", status: "done", _previous: { status: "in_progress" } }, createdAt: at },
  { id: "e2", actorType: "system", actorId: "s", action: "cost.reported", entityType: "cost_event", entityId: "c1", details: {}, createdAt: at },
  { id: "e3", actorType: "user", actorId: "u", action: "issue.comment_added", entityType: "issue", entityId: THREAD_ID, details: { identifier: "DEMO-9", issueTitle: "Sweep" }, createdAt: at },
  // More rows than the screen holds, so a header squeezed out by the list would show.
  ...Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, actorType: "agent", actorId: "gone", action: "issue.checked_out", entityType: "issue", entityId: "x", details: {}, createdAt: "2026-01-01T00:00:00.000Z" })),
]

test("g r lists routines with schedule, next and last run; enter opens the last run's task", async () => {
  app = await startApp({ before: (s) => s.set(`/api/companies/${COMPANY_ID}/routines`, routines) })
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("r")
  let text = await app.frame()
  expect(text).toMatch(/Routines {2}2/)
  expect(text).toMatch(/Inbox sweep\s+example name\s+Every 30 min\s+in 2\dm\s+completed 5m/)
  expect(text).toMatch(/Monthly close\s+—\s+no trigger\s+paused\s+never/)
  expect(text).toContain("Every 30 min")
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text.split("\n")[0]).toContain("Task · ")
})

test("g h shows activity without bookkeeping; a shows all; you are named", async () => {
  app = await startApp({ before: (s) => s.set(`/api/companies/${COMPANY_ID}/activity`, activity) })
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("h")
  let text = await app.frame()
  expect(text).toMatch(/Activity {2}62 {2}without bookkeeping/)
  expect(text).toMatch(/2h\s+example name\s+changed status from in progress to done on DEMO-9 Sweep/)
  expect(text).toMatch(/2h\s+You\s+commented on DEMO-9 Sweep/)
  expect(text).not.toContain("reported cost")
  app.mockInput.pressKey("a")
  text = await app.frame()
  expect(text).toContain("System        reported cost for")
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text.split("\n")[0]).toContain("Task · ")
})
