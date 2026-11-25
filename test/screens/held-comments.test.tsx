import { afterEach, expect, test } from "bun:test"
import { THREAD_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const QUEUE = `/api/issues/${THREAD_ID}/queued-comments`
const REASON = "The previous run has no verified stop record. Paperclip cannot start this message yet."
// As SKO-226 answered on 2026-11-25, trimmed to the fields clipode reads.
const queue = (clientRequestId: string | null = "r-1") => ({
  issueId: THREAD_ID,
  queueId: "q-1",
  state: "deferred",
  targetRunId: null,
  revision: "rev-1",
  protocol: "legacy",
  steeringDisposition: "unsupported",
  executionWait: { reason: "process_identity_missing", message: REASON },
  entries: [{ comment: { id: "c-1", body: "Look into it", createdAt: "2026-11-25T12:02:35.008Z", authorAgentId: null, authorUserId: "u", clientRequestId } }],
})
const empty = { issueId: THREAD_ID, queueId: null, state: null, targetRunId: null, revision: "r", protocol: "legacy", steeringDisposition: "unsupported", entries: [] }

test("a thread shows held comments with the server's reason; w sends them after a confirmation", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => (s.set(QUEUE, queue()), s.set(`${QUEUE}/interrupt`, empty)) })
  let text = await app.frame()
  expect(text).toContain("Held, not sent to the agent yet")
  expect(text).toContain("w sends it now.")
  expect(text).toContain("no verified stop record")
  expect(text).toMatch(/You · .*Look into it/)
  expect(text).toContain("w send held")
  app.mockInput.pressKey("w")
  text = await app.frame()
  expect(text).toContain("Send the held comment now?")
  expect(text).toContain("Sending starts the agent")
  expect(app.server.writes).toHaveLength(0)
  app.server.set(QUEUE, empty)
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: `${QUEUE}/interrupt`, body: { queueId: "q-1", targetRunId: null, revision: "rev-1" } })
  text = await app.frame()
  expect(text).toContain("Held comments sent")
  expect(text).not.toContain("Held, not sent")
})

test("without held comments the thread shows nothing and w does nothing", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => s.set(QUEUE, empty) })
  const text = await app.frame()
  expect(text).not.toContain("Held")
  app.mockInput.pressKey("w")
  await Bun.sleep(40)
  expect(await app.frame()).not.toContain("Send the held")
})

test("a comment the server holds is reported as held, not as delivered", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  // The queue answers with whatever request id the comment was sent with, as the server does.
  app.server.set(QUEUE, () => queue((app!.server.writes.find((w) => w.path.endsWith("/comments"))?.body as { clientRequestId?: string })?.clientRequestId ?? null))
  await app.frame()
  app.mockInput.pressKey("c")
  await app.frame()
  await app.mockInput.typeText("Look into it")
  app.mockInput.pressEnter()
  await Bun.sleep(120)
  const text = await app.frame()
  expect(text).toContain("but held from the agent")
  expect(text).toContain("w in the task sends it anyway")
})

test("someone else's held comment does not turn yours into a warning", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => s.set(QUEUE, queue("someone-else")) })
  await app.frame()
  app.mockInput.pressKey("c")
  await app.frame()
  await app.mockInput.typeText("Another note")
  app.mockInput.pressEnter()
  await Bun.sleep(120)
  expect(await app.frame()).toContain("Comment posted")
})
