import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, RUN_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const count = (requests: string[], suffix: string) => requests.filter((r) => r.endsWith(suffix)).length

test("an activity event refetches the inbox and tasks; the footer says live", async () => {
  app = await startApp()
  expect(await app.frame()).toContain("● live")
  const feed = `/api/companies/${COMPANY_ID}/attention`
  const before = count(app.server.requests, feed)
  app.server.set(feed, { items: [], totalCount: 0 })
  app.server.emit("activity.logged", { entityType: "issue", entityId: "x", action: "issue.updated" })
  await Bun.sleep(400)
  const text = await app.frame()
  expect(count(app.server.requests, feed)).toBe(before + 1)
  expect(text).toContain("Nothing needs you")
})

test("without the WebSocket the client polls and offers a retry", async () => {
  app = await startApp({ before: (s) => s.set("ws-refuse", true) })
  const text = await app.frame()
  expect(text).toContain("● polling")
  expect(text).toMatch(/reconnecting in \d+s \(attempt 1\)\s+ctrl\+r retry/)
})

test("an open run is sent as an interest and its log events trigger a read", async () => {
  app = await startApp({ route: { name: "run", id: RUN_ID } })
  await app.frame()
  await Bun.sleep(100)
  expect(app.server.received.find((m) => m.type === "live.interests")).toMatchObject({ runIds: [RUN_ID] })
  const log = `/api/heartbeat-runs/${RUN_ID}/log`
  const before = count(app.server.requests, log)
  app.server.emit("heartbeat.run.log", { runId: RUN_ID, chunk: "x" })
  await Bun.sleep(100)
  expect(count(app.server.requests, log)).toBe(before + 1)
})
