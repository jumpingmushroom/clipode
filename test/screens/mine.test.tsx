import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID, type FakeServer } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"
import issues from "../fixtures/company/issues.json"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const unreadTask = issues.find((i) => i.id === THREAD_ID)!
const readTask = issues.find((i) => i.id !== THREAD_ID && i.identifier)!

// The thread's task is unread until the client marks it read; another task is read.
function mine(server: FakeServer) {
  server.set(`/api/companies/${COMPANY_ID}/inbox/mine`, () => ({
    userId: "u",
    issues: [
      { ...readTask, isUnreadForMe: false, lastActivityAt: "2026-11-25T10:00:00.000Z" },
      { ...unreadTask, isUnreadForMe: !server.writes.some((w) => w.path === `/api/issues/${THREAD_ID}/read`), lastActivityAt: "2026-11-25T09:00:00.000Z" },
    ],
    contextIssues: [],
    failureRuns: [],
    failureIssueIds: [],
  }))
}

test("g m lists the tasks you are on, unread first; opening one marks it read and the header count goes", async () => {
  app = await startApp({ before: mine })
  let text = await app.frame()
  expect(text.split("\n")[0]).toContain("unread 1")
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("m")
  text = await app.frame()
  expect(text.split("\n")[0]).toContain("Mine")
  expect(text).toMatch(/Unread {2}1/)
  expect(text).toMatch(/Recent {2}1/)
  expect(text).toMatch(new RegExp(`● ${unreadTask.identifier}`))
  app.mockInput.pressEnter()
  await app.frame()
  await Bun.sleep(50)
  text = await app.frame()
  expect(app.server.writes.filter((w) => w.path === `/api/issues/${THREAD_ID}/read`)).toHaveLength(1)
  expect(text.split("\n")[0]).not.toContain("unread")
})

test("a read-only client never marks a task read", async () => {
  app = await startApp({ before: mine, config: { readOnly: true }, route: { name: "thread", id: THREAD_ID } })
  await app.frame()
  await Bun.sleep(50)
  expect(app.server.writes).toHaveLength(0)
  expect((await app.frame()).split("\n")[0]).toContain("unread 1")
})
