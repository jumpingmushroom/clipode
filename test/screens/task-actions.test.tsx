import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

test("files are checked when added and uploaded once the task exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clipode-attach-"))
  const file = join(dir, "screen shot.txt")
  await writeFile(file, "diagram")
  try {
    app = await startApp({ route: { name: "tasks" } })
    await app.frame()
    app.mockInput.pressKey("n")
    await app.frame()
    await app.mockInput.typeText("Attach the diagram")
    for (let i = 0; i < 7; i++) await tab() // title, project, assignee, model, mode, private, files
    app.mockInput.pressEnter()
    expect(await app.frame()).toContain("Attach files")
    await app.mockInput.typeText(`'${file}' ${join(dir, "missing.txt")}`)
    app.mockInput.pressEnter()
    await Bun.sleep(40)
    let text = await app.frame()
    expect(text).toContain("screen shot.txt")
    expect(text).toContain("Not added: missing.txt (not found)")
    app.mockInput.pressKey("s", { ctrl: true })
    await Bun.sleep(100)
    const upload = app.server.writes.find((w) => w.path.endsWith("/attachments"))
    expect(upload).toEqual({ method: "POST", path: `/api/companies/${COMPANY_ID}/issues/new-task/attachments`, body: { file: "screen shot.txt", text: "diagram" } })
    text = await app.frame()
    expect(text).toContain("DEMO-99 created with 1 file")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("a file the server refuses is named, and the task is still created", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clipode-attach-"))
  await writeFile(join(dir, "big.bin"), "x")
  try {
    app = await startApp({ route: { name: "tasks" }, before: (s) => s.set(`/api/companies/${COMPANY_ID}/issues/new-task/attachments`, { error: "Attachment is larger than the 10 MB limit" }, 422) })
    await app.frame()
    app.mockInput.pressKey("n")
    await app.frame()
    await app.mockInput.typeText("With a big file")
    for (let i = 0; i < 7; i++) await tab()
    app.mockInput.pressEnter()
    await app.frame()
    await app.mockInput.typeText(join(dir, "big.bin"))
    app.mockInput.pressEnter()
    await Bun.sleep(40)
    await app.frame()
    app.mockInput.pressKey("s", { ctrl: true })
    await Bun.sleep(100)
    const text = await app.frame()
    expect(text).toContain("DEMO-99 created; not attached: big.bin")
    expect(text).toContain("10 MB limit")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

test("ctrl+v on the Files row pastes a clipboard image as a PNG file and uploads it", async () => {
  app = await startApp({ route: { name: "tasks" }, readImage: async () => PNG })
  await app.frame()
  app.mockInput.pressKey("n")
  await app.frame()
  await app.mockInput.typeText("See the screenshot")
  for (let i = 0; i < 7; i++) await tab()
  app.mockInput.pressKey("v", { ctrl: true })
  await Bun.sleep(50)
  expect(await app.frame()).toMatch(/Files\s+clipode-clipboard-[\w-]+\.png/)
  app.mockInput.pressKey("s", { ctrl: true })
  await Bun.sleep(100)
  const upload = app.server.writes.find((w) => w.path.endsWith("/attachments"))
  expect((upload?.body as { file: string }).file).toMatch(/^clipode-clipboard-[\w-]+\.png$/)
  expect(await app.frame()).toContain("DEMO-99 created with 1 file")
})

test("without an image on the clipboard, or without a way to read it, ctrl+v says so", async () => {
  app = await startApp({ route: { name: "tasks" } })
  await app.frame()
  app.mockInput.pressKey("n")
  await app.frame()
  for (let i = 0; i < 7; i++) await tab()
  app.mockInput.pressKey("v", { ctrl: true })
  await Bun.sleep(40)
  expect(await app.frame()).toContain("The clipboard holds no image")
  app.renderer.destroy()

  app = await startApp({ route: { name: "tasks" }, readImage: async () => Promise.reject(new Error("This system offers no way to read clipboard images")) })
  await app.frame()
  app.mockInput.pressKey("n")
  await app.frame()
  for (let i = 0; i < 7; i++) await tab()
  app.mockInput.pressEnter() // the attach prompt takes ctrl+v too
  await app.frame()
  app.mockInput.pressKey("v", { ctrl: true })
  await Bun.sleep(40)
  expect(await app.frame()).toContain("This system offers no way to read clipboard images")
})

test("f attaches files to the task without a comment; ctrl+v in the prompt adds the clipboard image", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, readImage: async () => new Uint8Array([137, 80, 78, 71]) })
  await app.frame()
  app.mockInput.pressKey("f")
  expect(await app.frame()).toContain("Attach files")
  app.mockInput.pressKey("v", { ctrl: true })
  await Bun.sleep(80)
  const text = await app.frame()
  expect(app.server.writes.map((w) => w.path)).toEqual([expect.stringMatching(new RegExp(`/issues/${THREAD_ID}/attachments$`))])
  expect(text).toMatch(/DEMO-\d+: 1 file attached/)
})
