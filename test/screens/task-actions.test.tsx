import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import agents from "../fixtures/company/agents.json"
import details from "../fixtures/company/issue-details.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})
const task = (details as Record<string, { title: string; description: string | null; status: string }>)[THREAD_ID]!
const patch = () => app!.server.writes.find((w) => w.method === "PATCH")

test("s changes the status: only the status is sent", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  await app.frame()
  app.mockInput.pressKey("s")
  let text = await app.frame()
  expect(text).toContain("Status")
  expect(text).toMatch(/In progress[\s\S]*Todo[\s\S]*Blocked/)
  await app.mockInput.typeText("done")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(patch()).toEqual({ method: "PATCH", path: `/api/issues/${THREAD_ID}`, body: { status: "done" } })
  text = await app.frame()
  expect(text).toMatch(/DEMO-\d+: done/)
})

test("p changes the priority and a assigns or unassigns", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  await app.frame()
  app.mockInput.pressKey("p")
  await app.frame()
  await app.mockInput.typeText("urgent")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(patch()?.body).toEqual({ priority: "critical" })

  app.mockInput.pressKey("a")
  const text = await app.frame()
  expect(text).toContain("Assign to")
  expect(text).toContain("Unassigned")
  app.mockInput.pressArrow("down")
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  const assign = app.server.writes.filter((w) => w.method === "PATCH")[1]
  expect(assign?.body).toEqual({ assigneeAgentId: expect.any(String) })
  expect(agents.map((a) => a.id)).toContain((assign!.body as { assigneeAgentId: string }).assigneeAgentId)
})

test("e edits the title and description, starting from the current text", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  await app.frame()
  app.mockInput.pressKey("e")
  expect(await app.frame()).toContain(task.title)
  await app.mockInput.typeText(" v2")
  app.mockInput.pressEnter()
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  expect(patch()?.body).toEqual({ title: `${task.title} v2`, description: task.description })
})

test("n in Tasks creates a task with an idempotency key and opens it", async () => {
  app = await startApp({ route: { name: "tasks" } })
  await app.frame()
  app.mockInput.pressKey("n")
  await app.frame()
  await app.mockInput.typeText("Write the release notes")
  app.mockInput.pressEnter()
  await app.frame()
  await app.mockInput.typeText("For 1.2")
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  const create = app.server.writes.find((w) => w.method === "POST")
  expect(create).toMatchObject({ path: `/api/companies/${COMPANY_ID}/issues` })
  expect(create?.body).toEqual({ title: "Write the release notes", description: "For 1.2", idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  const text = await app.frame()
  expect(text).toContain("DEMO-99 created")
  expect(text).toContain("Task · ")
})

test("with readOnly the task keys send nothing", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, config: { readOnly: true } })
  await app.frame()
  for (const key of ["s", "p", "a", "e", "n"]) app.mockInput.pressKey(key)
  await Bun.sleep(60)
  expect(app.server.writes).toHaveLength(0)
  expect(await app.frame()).not.toMatch(/Status\s+esc/)
})
