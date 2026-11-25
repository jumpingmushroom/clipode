import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const entry = (id: string, kind: string, preview: string, at: string) => ({
  id, kind, preview, createdAt: at, agent: { id: "a1", name: "Builder", icon: null }, runId: "r1", task: { id: THREAD_ID, identifier: "DEMO-1", title: "Launch" },
})

test("c on Activity shows agent commentary; enter reads an entry in full, once; o opens its task", async () => {
  app = await startApp({
    route: { name: "activity" },
    before: (s) => {
      s.set(`/api/companies/${COMPANY_ID}/agent-commentary`, {
        items: [entry("n1", "complaint", "The test runner times out", "2026-11-25T10:00:00.000Z"), entry("n2", "suggestion", "Cache the build", "2026-11-24T10:00:00.000Z")],
        total: 2, limit: 100, offset: 0,
      })
      s.set(`/api/companies/${COMPANY_ID}/agent-commentary/n1`, { ...entry("n1", "complaint", "The test runner times out", "2026-11-25T10:00:00.000Z"), body: "The test runner times out after **ten minutes** on every run." })
    },
  })
  await app.frame()
  app.mockInput.pressKey("c")
  let text = await app.frame()
  expect(text.split("\n")[0]).toContain("Activity · commentary")
  expect(text).toMatch(/Builder\s+complaint\s+DEMO-1\s+The test runner times out/)
  expect(text).toMatch(/Builder\s+suggestion\s+DEMO-1\s+Cache the build/)
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text).toContain("after ten minutes on every run.")
  app.mockInput.pressEnter()
  app.mockInput.pressEnter()
  await app.frame()
  expect(app.server.requests.filter((r) => r.endsWith("/agent-commentary/n1"))).toHaveLength(1)
  app.mockInput.pressKey("o")
  expect(await app.frame()).toContain("Task ·")
})
