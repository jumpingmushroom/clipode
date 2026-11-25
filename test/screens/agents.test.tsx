import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import agents from "../fixtures/company/agents.json"
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

test("in a short terminal the agent screens keep their headings, and the selected run stays in view", async () => {
  app = await startApp({ route: { name: "agents" }, height: 20 })
  expect(await app.frame()).toMatch(/Name\s+Role\s+Model\s+Now/)
  app.renderer.destroy()

  app = await startApp({ route: { name: "agent", id: "00000000-0000-4000-8000-00000000000f" }, height: 16 })
  let text = await app.frame()
  expect(text).toContain("Recent runs")
  for (let i = 0; i < 15; i++) app.mockInput.pressKey("j")
  text = await app.frame()
  expect(text).toContain("Recent runs")
  // The last of the 16 runs is selected; its row is on screen.
  const runs = (await import("../fixtures/company/heartbeat-runs.json")).default.filter((r) => r.agentId === "00000000-0000-4000-8000-00000000000f")
  expect(text).toContain(runs.at(-1)!.id.slice(0, 8))
})

test('"sidebar": "show" shows the sidebar below 100 columns too', async () => {
  app = await startApp({ width: 90, config: { sidebar: "show" } })
  expect(await app.frame()).toContain("Needs you")
  app.renderer.destroy()
  app = await startApp({ width: 90 })
  expect(await app.frame()).not.toContain("Needs you")
})

test("a terminated agent is counted nowhere: not in the list, the Team count or the inbox sidebar", async () => {
  const withRetired = [...agents, { ...agents[0]!, id: "retired", name: "Retired", status: "terminated" }]
  app = await startApp({ before: (s) => s.set(`/api/companies/${COMPANY_ID}/agents`, withRetired) })
  expect(await app.frame()).toMatch(/Agents\s+9\b/)
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("a")
  const text = await app.frame()
  expect(text).toMatch(/Agents {2}9/)
  expect(text).toMatch(/Team\s+9/)
})
