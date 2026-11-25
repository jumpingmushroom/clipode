import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, RUN_ID } from "../fake-server.ts"
import agents from "../fixtures/company/agents.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})
const first = agents.filter((a) => a.status !== "terminated")[0]!

test("w wakes the selected agent with an optional reason", async () => {
  app = await startApp({ route: { name: "agents" } })
  await app.frame()
  app.mockInput.pressKey("w")
  expect(await app.frame()).toContain("Wake ")
  await app.mockInput.typeText("Check the import queue")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({
    method: "POST",
    path: `/api/agents/${first.id}/wakeup`,
    body: { source: "on_demand", triggerDetail: "manual", idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/), reason: "Check the import queue" },
  })
  expect(await app.frame()).toContain("woken")
})

test("p asks before pausing a working agent", async () => {
  app = await startApp({ route: { name: "agents" } })
  await app.frame()
  app.mockInput.pressKey("p")
  expect(await app.frame()).toContain("Pause ")
  expect(app.server.writes).toHaveLength(0)
  app.mockInput.pressEnter() // Yes
  await Bun.sleep(60)
  expect(app.server.writes[0]).toMatchObject({ method: "POST", path: `/api/agents/${first.id}/pause` })
})

test("p resumes a paused agent at once", async () => {
  app = await startApp({
    route: { name: "agents" },
    before: (s) => s.set(`/api/companies/${COMPANY_ID}/agents`, agents.map((a) => (a.id === first.id ? { ...a, status: "paused" } : a))),
  })
  await app.frame()
  app.mockInput.pressKey("p")
  await Bun.sleep(60)
  expect(app.server.writes[0]).toMatchObject({ method: "POST", path: `/api/agents/${first.id}/resume` })
  expect(await app.frame()).toContain("resumed")
})

test("x clears an agent's error; an agent not in error sends nothing", async () => {
  app = await startApp({
    route: { name: "agents" },
    before: (s) => {
      s.set(`/api/companies/${COMPANY_ID}/agents`, agents.map((a) => (a.id === first.id ? { ...a, status: "error" } : a)))
      s.set(`/api/agents/${first.id}/clear-error`, {})
    },
  })
  expect(await app.frame()).toContain("x clear error")
  app.mockInput.pressKey("x")
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: `/api/agents/${first.id}/clear-error`, body: {} })
  expect(await app.frame()).toContain("is idle again")
  app.renderer.destroy()
  app = await startApp({ route: { name: "agents" } })
  await app.frame()
  app.mockInput.pressKey("x")
  await Bun.sleep(60)
  expect(app.server.writes).toHaveLength(0)
  expect(await app.frame()).toContain("is not in error")
})

test("x cancels a live run after confirming; a finished run offers no cancel", async () => {
  app = await startApp({
    route: { name: "run", id: "live-run" },
    before: (s) => {
      s.set("/api/heartbeat-runs/live-run", { id: "live-run", status: "running", agentId: first.id, createdAt: "2026-11-20T10:00:00.000Z", startedAt: "2026-11-20T10:00:00.000Z", finishedAt: null, usageJson: null })
      s.set("/api/heartbeat-runs/live-run/log", { content: "", nextOffset: undefined })
    },
  })
  let text = await app.frame()
  expect(text).toContain("x cancel run")
  app.mockInput.pressKey("x")
  text = await app.frame()
  expect(text).toContain("Cancel this run?")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: "/api/heartbeat-runs/live-run/cancel", body: {} })
  app.renderer.destroy()

  app = await startApp({ route: { name: "run", id: RUN_ID } })
  text = await app.frame()
  expect(text).not.toContain("x cancel run")
  app.mockInput.pressKey("x")
  await Bun.sleep(40)
  expect(app.server.writes).toHaveLength(0)
})

test("with readOnly, w, p and x send nothing", async () => {
  app = await startApp({ route: { name: "agents" }, config: { readOnly: true } })
  await app.frame()
  for (const key of ["w", "p", "x"]) app.mockInput.pressKey(key)
  await Bun.sleep(60)
  expect(app.server.writes).toHaveLength(0)
})
