import { afterEach, expect, test } from "bun:test"
import { THREAD_ID } from "../fake-server.ts"
import details from "../fixtures/company/issue-details.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

test("g a lists the agents with role, adapter and what they do now; enter opens recent runs", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("a")
  let text = await app.frame()
  expect(text).toMatch(/Agents {2}9/)
  expect(text).toMatch(/Name\s+Role\s+Model\s+Now/)
  expect(text).toContain("claude_local")
  expect(text).toMatch(/waiting on you|idle/)
  expect(text).toMatch(/Team\s+9/)
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text).toContain("Agent · ")
  expect(text).toContain("Recent runs")
})

test("saved tabs come back; opening a thread adds a tab; ctrl+x 1 jumps; ctrl+x w closes", async () => {
  const other = Object.keys(details).find((id) => id !== THREAD_ID)!
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, tabs: [other] })
  let text = await app.frame()
  const tabRow = text.split("\n")[1]!
  expect(tabRow.match(/DEMO-\d+/g)?.length).toBe(2)
  const [first] = tabRow.match(/DEMO-\d+/g)!
  app.mockInput.pressKey("x", { ctrl: true })
  app.mockInput.pressKey("1")
  text = await app.frame()
  expect(text.split("\n")[0]).toContain(`Task · ${first}`)
  app.mockInput.pressKey("x", { ctrl: true })
  app.mockInput.pressKey("w")
  text = await app.frame()
  expect(text.split("\n")[1]!.trim()).toBe("")
})

test("ctrl+x s opens settings with the instance, company and theme", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("x", { ctrl: true })
  app.mockInput.pressKey("s")
  const text = await app.frame()
  expect(text).toContain("Settings")
  expect(text).toMatch(/Instance\s+127\.0\.0\.1/)
  expect(text).toMatch(/Theme\s+clipode dark/)
  expect(text).toMatch(/Signed in as\s+Operator/)
})
