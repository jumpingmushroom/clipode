import { afterEach, expect, test } from "bun:test"
import { THREAD_ID } from "../fake-server.ts"
import checked from "../fixtures/writes/monitor-check-now.json"
import refused from "../fixtures/writes/monitor-check-now-refused.json"
import monitored from "../fixtures/writes/task-with-monitor.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const inAnHour = new Date(Date.now() + 77 * 60_000).toISOString()
const monitor = {
  ...monitored.response,
  id: THREAD_ID,
  monitorNextCheckAt: inAnHour,
  monitorAttemptCount: 8,
  monitorNotes: "Read-only: history and queue",
  executionState: { ...monitored.response.executionState, monitor: { ...monitored.response.executionState.monitor, serviceName: "radarr-sonarr", maxAttempts: 16 } },
}
const TASK = `/api/issues/${THREAD_ID}`

test("a task with a monitor says when the agent looks again; w checks now", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => (s.set(TASK, monitor), s.set(`${TASK}/monitor/check-now`, checked.response)) })
  const text = await app.frame()
  expect(text).toContain("Resumes in 1h")
  expect(text).toMatch(/8 of 16 checks done · watching radarr-sonarr · gives up/)
  expect(text).toContain("Read-only: history and queue")
  expect(text).toContain("w checks now. A comment also wakes the agent.")
  expect(text).toContain("w check now")
  app.mockInput.pressKey("w")
  await Bun.sleep(80)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: `${TASK}/monitor/check-now`, body: {} })
  expect(await app.frame()).toContain("Check started")
})

test("a check the server cannot start says why", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => (s.set(TASK, monitor), s.set(`${TASK}/monitor/check-now`, refused.response, 409)) })
  await app.frame()
  app.mockInput.pressKey("w")
  await Bun.sleep(80)
  expect(await app.frame()).toContain(`Not sent: ${refused.response.error}`)
})

test("a scheduled retry: w retries now, and an outcome that did not start is reported", async () => {
  const retry = { ...monitor, monitorNextCheckAt: null, scheduledRetry: { status: "scheduled_retry", scheduledRetryAt: inAnHour, scheduledRetryAttempt: 2, scheduledRetryReason: "transient_failure", runId: "r", agentId: "a" } }
  app = await startApp({
    route: { name: "thread", id: THREAD_ID },
    before: (s) => (s.set(TASK, retry), s.set(`${TASK}/scheduled-retry/retry-now`, { outcome: "waiting", message: "The retry is waiting for its gate", scheduledRetry: null })),
  })
  const text = await app.frame()
  expect(text).toContain("Retrying in 1h")
  expect(text).toContain("w retries now.")
  expect(text).toContain("transient failure")
  app.mockInput.pressKey("w")
  await Bun.sleep(80)
  expect(app.server.writes[0]?.path).toBe(`${TASK}/scheduled-retry/retry-now`)
  expect(await app.frame()).toContain("Not retried: The retry is waiting for its gate")
})

test("with held comments too, w sends the held comments", async () => {
  const queue = {
    queueId: "q-1", revision: "rev", targetRunId: null, state: "deferred", executionWait: { reason: "x", message: "Held for a reason." },
    entries: [{ comment: { id: "c", body: "Hi", createdAt: inAnHour, authorAgentId: null, clientRequestId: null } }],
  }
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => (s.set(TASK, monitor), s.set(`${TASK}/queued-comments`, queue)) })
  const text = await app.frame()
  expect(text).toContain("w send held")
  expect(text).not.toContain("w check now")
  app.mockInput.pressKey("w")
  expect(await app.frame()).toContain("Send the held comment now?")
})

test("a task with nothing scheduled shows no waiting section", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  const text = await app.frame()
  expect(text).not.toContain("Resumes")
  expect(text).not.toContain("w check now")
})
