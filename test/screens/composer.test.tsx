import { afterEach, expect, test } from "bun:test"
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
