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

const projects = (await import("../fixtures/company/projects.json")).default as { id: string; name: string }[]
const create = () => app!.server.writes.find((w) => w.method === "POST")
// tab moves focus after the key dispatch; a person never types the next key before that, so the tests wait too.
const tab = async () => {
  app!.mockInput.pressTab()
  await app!.frame()
}

test("n opens the new task dialog; a description alone creates the task and opens it", async () => {
  app = await startApp({ route: { name: "tasks" } })
  await app.frame()
  app.mockInput.pressKey("n")
  let text = await app.frame()
  expect(text).toContain("New task")
  expect(text).toContain("Optional: generated from the description")
  await app.mockInput.typeText("Write the release notes for 1.2")
  app.mockInput.pressKey("s", { ctrl: true })
  await Bun.sleep(80)
  expect(create()).toMatchObject({ path: `/api/companies/${COMPANY_ID}/issues` })
  expect(create()?.body).toEqual({ description: "Write the release notes for 1.2", idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  text = await app.frame()
  expect(text).toContain("DEMO-99 created")
  expect(text).toContain("Task · ")
})

test("every field: project, assignee, model, plan mode and private; the description survives the pickers", async () => {
  app = await startApp({ route: { name: "tasks" } })
  await app.frame()
  app.mockInput.pressKey("n")
  await app.frame()
  await app.mockInput.typeText("Rotate the backup keys")
  await tab() // title
  await tab() // project
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("No project")
  await app.mockInput.typeText(projects[0]!.name)
  app.mockInput.pressEnter()
  await app.frame()
  await tab() // assignee
  app.mockInput.pressEnter()
  await app.frame()
  app.mockInput.pressArrow("down")
  app.mockInput.pressEnter()
  await app.frame()
  await tab() // model
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("Claude Haiku 4.5")
  await app.mockInput.typeText("haiku")
  app.mockInput.pressEnter()
  await app.frame()
  await tab() // mode
  app.mockInput.pressKey(" ")
  await tab() // private
  app.mockInput.pressKey(" ")
  const text = await app.frame()
  expect(text).toContain("Rotate the backup keys")
  expect(text).toContain("● Plan")
  expect(text).toContain("[x] private task")
  app.mockInput.pressKey("s", { ctrl: true })
  await Bun.sleep(80)
  expect(create()?.body).toEqual({
    description: "Rotate the backup keys",
    projectId: projects[0]!.id,
    assigneeAgentId: expect.any(String),
    workMode: "planning",
    visibility: "private",
    assigneeAdapterOverrides: { adapterConfig: { model: "claude-haiku-4-5" } },
    idempotencyKey: expect.any(String),
  })
})

test("an empty dialog is not sent", async () => {
  app = await startApp({ route: { name: "tasks" } })
  await app.frame()
  app.mockInput.pressKey("n")
  await app.frame()
  app.mockInput.pressKey("s", { ctrl: true })
  expect(await app.frame()).toContain("Write a description (or a title)")
  expect(app.server.writes).toHaveLength(0)
})

test("e edits the task in the same dialog, starting from its title and description", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  await app.frame()
  app.mockInput.pressKey("e")
  let text = await app.frame()
  expect(text).toContain("Edit DEMO-")
  expect(text).not.toContain("Private")
  await app.mockInput.typeText(" More detail.")
  await tab()
  await app.mockInput.typeText(" v2")
  app.mockInput.pressKey("s", { ctrl: true })
  await Bun.sleep(60)
  expect(patch()?.body).toEqual({ title: `${task.title} v2`, description: `${task.description} More detail.` })
  text = await app.frame()
  expect(text).toMatch(/DEMO-\d+: saved/)
})

test("with readOnly the task keys send nothing", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, config: { readOnly: true } })
  await app.frame()
  for (const key of ["s", "p", "a", "e", "n"]) app.mockInput.pressKey(key)
  await Bun.sleep(60)
  expect(app.server.writes).toHaveLength(0)
  expect(await app.frame()).not.toMatch(/Status\s+esc/)
})
