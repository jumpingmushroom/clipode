import { afterEach, expect, test } from "bun:test"
import { THREAD_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

test("gt opens Tasks grouped by status with priority markers and a collapsed Done group", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("t")
  const text = await app.frame()
  expect(text).toContain("Tasks")
  expect(text).toMatch(/In review {2}\d+/)
  expect(text).toMatch(/Done {2}\d+/)
  expect(text).toMatch(/… \d+ more/)
  expect(text).toMatch(/DEMO-\d+\s+example title\s+[!↑·↓]/)
  expect(text).toMatch(/Priority/)
  expect(text).toMatch(/\d+ tasks/)
})

test("/ filters the list as you type; j and k reach the filter; esc clears it", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("t")
  const before = (await app.frame()).match(/(\d+) tasks/)![1]
  app.mockInput.pressKey("/")
  await app.frame()
  await app.mockInput.typeText("status:review jk")
  let text = await app.frame()
  expect(text).toContain("status:review jk")
  expect(text).toContain("0 tasks")
  app.mockInput.pressEscape()
  await Bun.sleep(40)
  text = await app.frame()
  expect(text).toContain(`${before} tasks`)
  expect(text).toContain("type to filter")
})

test("a thread shows the description, comments and runs in time order, and the task sidebar", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  const text = await app.frame()
  expect(text).toMatch(/Task · DEMO-\d+/)
  expect(text).toContain("example description")
  expect(text).toMatch(/✓ run {2}example name {2}succeeded {2}\d+m \d+s {2}\$\d+\.\d\d/)
  expect(text).toMatch(/example name {2}example title/)
  expect(text).toMatch(/Status\s+blocked|Status\s+in review|Status\s+in progress|Status\s+todo/)
  expect(text).toContain("Cost so far")
  expect(text).toMatch(/Runs\s+4/)
  app.mockInput.pressEscape()
  await Bun.sleep(40)
  expect(await app.frame()).toContain("Task · ")
})

test("o on an inbox item opens its task thread", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressEnter()
  await app.frame()
  app.mockInput.pressKey("o")
  expect(await app.frame()).toMatch(/Task · DEMO-\d+/)
})
