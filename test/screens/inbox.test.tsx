import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

test("the inbox shows shelves, rows with markers and identifiers, and the sidebar", async () => {
  app = await startApp()
  const text = await app.frame()
  expect(text).toContain("Inbox")
  expect(text).toContain("Decide now  2")
  expect(text).toMatch(/■ example title\s+DEMO-\d+/)
  expect(text).toMatch(/\? example title/)
  expect(text).toMatch(/! example title/)
  expect(text).toMatch(/Needs you\s+6/)
  expect(text).toMatch(/\? Questions\s+3/)
  expect(text).toMatch(/■ Blocked tasks\s+2/)
  expect(text).toMatch(/Agents\s+9/)
  expect(text).toMatch(/Tasks in flight\s+7/)
  expect(text).toContain("inbox 6")
  expect(text).toContain("● live")
})

test("enter opens an item with its answer options; esc goes back", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressEnter()
  const text = await app.frame()
  expect(text).toContain("‹ Inbox")
  expect(text).toMatch(/Answer|Waiting on|Details/)
  expect(text).toContain("Asked")
  expect(text).toContain("Decide by")
  app.mockInput.pressEscape()
  await Bun.sleep(40)
  expect(await app.frame()).toContain("Decide now")
})

test("a question shows each prompt with its options to choose", async () => {
  app = await startApp()
  const rows = (await app.frame()).split("\n").filter((l) => /^ {2}[■?!◆✗•] /.test(l))
  const target = rows.findIndex((l) => l.startsWith("  ? "))
  for (let i = 0; i < target; i++) app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  await Bun.sleep(50)
  const text = await app.frame()
  expect(text).toContain("Inbox · question")
  expect(text).toMatch(/\( \)|\[ \]/)
  expect(text).toContain("ctrl+s send")
  expect(app.server.requests.filter((r) => r.endsWith("/interactions")).length).toBe(1)
})

test("at 80 columns the sidebar is hidden and long rows end with an ellipsis", async () => {
  app = await startApp({ width: 80, height: 24 })
  const text = await app.frame()
  expect(text).not.toContain("Needs you")
  expect(text).toContain("^p cmds")
  expect(text.split("\n").every((l) => l.length <= 80)).toBe(true)
})

test("an empty inbox says nothing needs you", async () => {
  app = await startApp({ before: (s) => s.set(`/api/companies/${COMPANY_ID}/attention`, { items: [], totalCount: 0 }) })
  const text = await app.frame()
  expect(text).toContain("Nothing needs you")
  expect(text).toContain("inbox 0")
})

test("a failed load shows the error and r retries", async () => {
  app = await startApp({ before: (s) => s.set(`/api/companies/${COMPANY_ID}/attention`, { error: "boom" }, 500) })
  let text = await app.frame()
  expect(text).toContain("Could not load the inbox")
  app.server.set(`/api/companies/${COMPANY_ID}/attention`, { items: [], totalCount: 0 })
  app.mockInput.pressKey("r")
  text = await app.frame()
  expect(text).toContain("Nothing needs you")
})

test("an expired session returns to sign-in with the URL kept", async () => {
  app = await startApp({ before: (s) => s.set(`/api/companies/${COMPANY_ID}/attention`, { error: "Board authentication required" }, 401) })
  const text = await app.frame()
  expect(text).toContain("Sign in")
  expect(text).toContain("Your session expired")
  expect(text).toContain(app.server.url)
})
