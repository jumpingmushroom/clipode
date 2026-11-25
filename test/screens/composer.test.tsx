import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { THREAD_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})
const comments = () => app!.server.requests.filter((r) => r === `GET /api/issues/${THREAD_ID}/comments`).length

test("c opens the composer in a thread; enter posts the comment with a request id and refreshes the thread", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  let text = await app.frame()
  expect(text).toMatch(/c {2}comment on DEMO-\d+/)
  const before = comments()
  app.mockInput.pressKey("c")
  await app.frame()
  await app.mockInput.typeText("Looks good, keep going jk")
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  text = await app.frame()
  const [write] = app.server.writes
  expect(write).toMatchObject({ method: "POST", path: `/api/issues/${THREAD_ID}/comments` })
  expect(write?.body).toEqual({ body: "Looks good, keep going jk", clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  expect(text).toContain("Comment posted")
  expect(comments()).toBe(before + 1)
})

test("esc closes the composer without sending", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  await app.frame()
  app.mockInput.pressKey("c")
  await app.frame()
  await app.mockInput.typeText("never mind")
  app.mockInput.pressEscape()
  await Bun.sleep(40)
  app.mockInput.pressEnter()
  await Bun.sleep(40)
  expect(app.server.writes).toHaveLength(0)
  expect(await app.frame()).toMatch(/c {2}comment on/)
})

test("with readOnly the composer row says so and c does nothing", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, config: { readOnly: true } })
  expect(await app.frame()).toContain("read-only (readOnly in cli.json)")
  app.mockInput.pressKey("c")
  await app.mockInput.typeText("x")
  app.mockInput.pressEnter()
  await Bun.sleep(40)
  expect(app.server.writes).toHaveLength(0)
})

test("ctrl+j adds a line; enter sends the whole multi-line comment", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  await app.frame()
  app.mockInput.pressKey("c")
  await app.frame()
  await app.mockInput.typeText("First line")
  app.mockInput.pressKey("j", { ctrl: true })
  await app.mockInput.typeText("Second line")
  const text = await app.frame()
  expect(text).toContain("First line")
  expect(text).toContain("Second line")
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  expect((app.server.writes[0]?.body as { body: string }).body).toBe("First line\nSecond line")
})

test("ctrl+v and ctrl+o add files to a comment; they are uploaded first and the comment carries their ids", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clipode-composer-"))
  await Bun.write(join(dir, "notes.txt"), "some notes")
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, readClipboard: async () => ({ image: new Uint8Array([137, 80, 78, 71]) }) })
  await app.frame()
  app.mockInput.pressKey("c")
  await app.frame()
  await app.mockInput.typeText("See attached")
  app.mockInput.pressKey("v", { ctrl: true })
  await Bun.sleep(40)
  app.mockInput.pressKey("o", { ctrl: true })
  let text = await app.frame()
  expect(text).toContain("Attach files")
  await app.mockInput.typeText(join(dir, "notes.txt"))
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text).toContain("› [2 files] See attached")
  // The comment keeps the keys after the prompt closes.
  await app.mockInput.typeText(" now")
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  text = await app.frame()
  const uploads = app.server.writes.filter((w) => w.path.endsWith("/attachments"))
  expect(uploads.map((u) => (u.body as { file: string }).file)).toEqual([expect.stringMatching(/^clipode-clipboard-.*\.png$/), "notes.txt"])
  const comment = app.server.writes.find((w) => w.path.endsWith("/comments"))
  expect(comment?.body).toEqual({ body: "See attached now", clientRequestId: expect.any(String), attachmentIds: ["att-1", "att-2"] })
  expect(text).toContain("Comment posted with 2 files")
  await rm(dir, { recursive: true, force: true })
})

test("ctrl+v pastes the clipboard's text into a comment", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, readClipboard: async () => ({ text: "copied from elsewhere" }) })
  await app.frame()
  app.mockInput.pressKey("c")
  await app.frame()
  await app.mockInput.typeText("Note: ")
  app.mockInput.pressKey("v", { ctrl: true })
  await Bun.sleep(40)
  expect(await app.frame()).toContain("› Note: copied from elsewhere")
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  expect(app.server.writes[0]?.body).toEqual({ body: "Note: copied from elsewhere", clientRequestId: expect.any(String) })
})
