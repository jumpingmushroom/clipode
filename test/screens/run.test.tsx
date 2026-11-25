import { afterEach, expect, test } from "bun:test"
import { RUN_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

test("a finished run shows its transcript, a closing line and the run sidebar", async () => {
  app = await startApp({ route: { name: "run", id: RUN_ID } })
  const text = await app.frame()
  expect(text).toContain(`Run ${RUN_ID.slice(0, 4)}`)
  expect(text).toMatch(/Terminal {2}example/)
  expect(text).toContain("Tool calls")
  expect(text).toMatch(/Model\s+claude-opus-5-5/)
  expect(text).toMatch(/· claude-opus-5-5 · \d+m \d+s/)
  expect(text).not.toContain("following tail")
})

test("t expands thinking blocks, e expands tool output, s shows status lines", async () => {
  app = await startApp({ route: { name: "run", id: RUN_ID } })
  const before = await app.frame()
  app.mockInput.pressKey("s")
  const after = await app.frame()
  expect(after).not.toEqual(before)
})

test("a live run is tailed by byte offset until it finishes", async () => {
  const lines = [
    JSON.stringify({ ts: "2026-11-20T10:00:00.000Z", stream: "stdout", chunk: JSON.stringify({ type: "acpx.text_delta", text: "Reading the upload code." }) + "\n" }) + "\n",
    JSON.stringify({ ts: "2026-11-20T10:00:01.000Z", stream: "stdout", chunk: JSON.stringify({ type: "acpx.tool_call", name: "Read", toolCallId: "c1", status: "completed", text: "42 lines" }) + "\n" }) + "\n",
  ]
  let status = "running"
  let written = 1
  const offsets: number[] = []
  app = await startApp({
    route: { name: "run", id: "live-run" },
    before: (s) => {
      s.set("/api/heartbeat-runs/live-run", () => ({ id: "live-run", status, agentId: "a", createdAt: "2026-11-20T10:00:00.000Z", startedAt: "2026-11-20T10:00:00.000Z", finishedAt: null, usageJson: null }))
      s.set("/api/heartbeat-runs/live-run/log", (url: URL) => {
        const offset = Number(url.searchParams.get("offset"))
        offsets.push(offset)
        const all = lines.slice(0, written).join("")
        return { content: all.slice(offset), nextOffset: undefined }
      })
    },
  })
  let text = await app.frame()
  expect(text).toContain("Reading the upload code.")
  expect(text).toContain("following tail")
  written = 2
  status = "succeeded"
  await Bun.sleep(2300)
  text = await app.frame()
  expect(text).toMatch(/Read {2}42 lines/)
  expect(offsets.at(-1)).toBe(Buffer.byteLength(lines[0]!))
})

test("a tool's result in a later chunk replaces its spinner with the output", async () => {
  const record = (ts: string, chunk: object) => JSON.stringify({ ts, stream: "stdout", chunk: JSON.stringify(chunk) + "\n" }) + "\n"
  const lines = [
    record("2026-11-20T10:00:00.000Z", { type: "acpx.tool_call", name: "Read", toolCallId: "c1", status: "pending" }),
    record("2026-11-20T10:00:01.000Z", { type: "acpx.tool_call", name: "Read", toolCallId: "c1", status: "completed", text: "42 lines" }),
  ]
  let written = 1
  app = await startApp({
    route: { name: "run", id: "live-run" },
    before: (s) => {
      s.set("/api/heartbeat-runs/live-run", { id: "live-run", status: "running", agentId: "a", createdAt: "2026-11-20T10:00:00.000Z", startedAt: "2026-11-20T10:00:00.000Z", finishedAt: null, usageJson: null })
      s.set("/api/heartbeat-runs/live-run/log", (url: URL) => ({ content: lines.slice(0, written).join("").slice(Number(url.searchParams.get("offset"))), nextOffset: undefined }))
    },
  })
  expect(await app.frame()).not.toContain("42 lines")
  written = 2
  await Bun.sleep(2300)
  expect(await app.frame()).toMatch(/Read {2}42 lines/)
})
