import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import agents from "../fixtures/company/agents.json"
import detail from "../fixtures/writes/routine-detail.json"
import runs from "../fixtures/writes/routine-runs.json"
import runAnswer from "../fixtures/writes/routine-run.json"
import coalesced from "../fixtures/writes/routine-run-coalesced.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const ID = detail.response.id
const soon = new Date(Date.now() + 3 * 3600_000).toISOString()
const trigger = { id: "t1", kind: "schedule", label: "Every morning", enabled: true, cronExpression: "0 8 * * *", timezone: "Europe/Oslo", nextRunAt: soon, lastFiredAt: null, lastResult: null }
const routine = {
  ...detail.response,
  title: "Morning sweep",
  assigneeAgentId: agents[0]!.id,
  descriptionDocument: { ...detail.response.descriptionDocument, body: "Sweep the **inbox** every morning." },
  triggers: [trigger],
}
const history = runs.response.map((r, i) => ({ ...r, linkedIssue: { ...r.linkedIssue, id: THREAD_ID, identifier: `DEMO-${90 + i}` } }))
const listed = { ...routine, lastRun: null, activeIssue: null }

function setUp(s: Running["server"], over: Record<string, unknown> = {}) {
  s.set(`/api/companies/${COMPANY_ID}/routines`, [{ ...listed, ...over }])
  s.set(`/api/routines/${ID}`, { ...routine, ...over })
  s.set(`/api/routines/${ID}/runs`, history)
}

test("enter on Routines opens the routine: description, triggers and runs; enter on a run opens its task", async () => {
  app = await startApp({ route: { name: "routines" }, before: (s) => setUp(s) })
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  const text = await app.frame()
  expect(text).toContain("Routine · Morning sweep")
  expect(text).toContain("Sweep the inbox every morning.")
  expect(text).toMatch(/Every morning\s+next in [23]h\s+Europe\/Oslo/)
  expect(text).toMatch(/· coalesced\s+manual .*DEMO-90/)
  expect(text).toMatch(/✓ completed\s+manual .*DEMO-91/)
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect((await app.frame()).split("\n")[0]).toContain("Task · ")
})

test("w asks, then runs the routine now and says what happened", async () => {
  app = await startApp({
    route: { name: "routine", id: ID },
    before: (s) => (setUp(s), s.set(`/api/routines/${ID}/run`, runAnswer.response, 202)),
  })
  await app.frame()
  app.mockInput.pressKey("w")
  expect(await app.frame()).toContain("Run Morning sweep now?")
  expect(app.server.writes).toHaveLength(0)
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: `/api/routines/${ID}/run`, body: { source: "manual", idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) } })
  expect(await app.frame()).toContain("Routine run started")
})

test("a run that joins one still going says so", async () => {
  app = await startApp({ route: { name: "routines" }, before: (s) => (setUp(s), s.set(`/api/routines/${ID}/run`, coalesced.response, 202)) })
  await app.frame()
  app.mockInput.pressKey("w")
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(await app.frame()).toContain("this one joined it")
})

test("p pauses an active routine and resumes a paused one, at once", async () => {
  app = await startApp({ route: { name: "routines" }, before: (s) => (setUp(s), s.set(`/api/routines/${ID}`, { ...routine, status: "paused" })) })
  await app.frame()
  app.mockInput.pressKey("p")
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "PATCH", path: `/api/routines/${ID}`, body: { status: "paused" } })
  expect(await app.frame()).toContain("Morning sweep paused")
  app.renderer.destroy()
  app = await startApp({ route: { name: "routine", id: ID }, before: (s) => setUp(s, { status: "paused" }) })
  await app.frame()
  app.mockInput.pressKey("p")
  await Bun.sleep(60)
  expect(app.server.writes[0]?.body).toEqual({ status: "active" })
})

test("with readOnly, w and p send nothing", async () => {
  app = await startApp({ route: { name: "routine", id: ID }, config: { readOnly: true }, before: (s) => setUp(s) })
  await app.frame()
  app.mockInput.pressKey("w")
  app.mockInput.pressKey("p")
  await Bun.sleep(60)
  expect(app.server.writes).toHaveLength(0)
})
