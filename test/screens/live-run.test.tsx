import { afterEach, expect, test } from "bun:test"
import { THREAD_ID } from "../fake-server.ts"
import runs from "../fixtures/company/thread-runs.json"
import { startApp, type Running } from "../helpers.tsx"
import { groupItems, toolsLabel } from "../../src/screens/live-run.tsx"
import type { ToolEntry, TranscriptItem } from "../../src/store/runs.ts"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const tool = (name: string, command: string): ToolEntry => ({ kind: "tool", id: command, ts: "", name, input: { command }, output: null, status: "done" })

test("consecutive tool calls fold into one group between what the agent says", () => {
  const items: TranscriptItem[] = [
    { kind: "assistant", ts: "", text: "Looking." },
    tool("Bash", "ls"),
    tool("Bash", "cat a"),
    { kind: "thinking", ts: "", text: "hmm" },
    tool("Read", "b"),
    { kind: "assistant", ts: "", text: "Found it." },
  ]
  const groups = groupItems(items)
  expect(groups.map((g) => g.kind)).toEqual(["text", "tools", "text"])
  expect(toolsLabel((groups[1] as { tools: ToolEntry[] }).tools)).toBe("3 tool calls")
  expect(toolsLabel([tool("Bash", "a"), tool("Bash", "b")])).toBe("Bash ×2")
  expect(toolsLabel([tool("Bash", "a")])).toBe("Bash")
})

const line = (ts: string, chunk: unknown) => JSON.stringify({ ts, stream: "stdout", chunk: JSON.stringify(chunk) + "\n" }) + "\n"
const log = [
  line("2026-11-25T10:00:00.000Z", { type: "acpx.text_delta", text: "Both episodes were marked failed. Reading the events." }),
  line("2026-11-25T10:00:01.000Z", { type: "acpx.tool_call", name: "Bash", toolCallId: "c1", status: "completed", input: { command: "cd /tmp && ls" }, text: "ok" }),
  line("2026-11-25T10:00:02.000Z", { type: "acpx.tool_call", name: "Bash", toolCallId: "c2", status: "completed", input: { command: "curl -s http://cleanuparr/api/events" }, text: "[]" }),
].join("")

function liveThread(s: Running["server"], status: () => string) {
  const live = { ...runs[0]!, runId: "live-run", status: "running", finishedAt: null, startedAt: new Date(Date.now() - 45_000).toISOString(), createdAt: new Date(Date.now() - 45_000).toISOString() }
  s.set(`/api/issues/${THREAD_ID}/runs`, () => [...runs, { ...live, status: status() }])
  s.set("/api/heartbeat-runs/live-run", () => ({ id: "live-run", status: status(), agentId: live.agentId, createdAt: live.createdAt, startedAt: live.startedAt, finishedAt: null, usageJson: null }))
  s.set("/api/heartbeat-runs/live-run/log", (url: URL) => ({ content: log.slice(Number(url.searchParams.get("offset") ?? 0)), nextOffset: log.length }))
}

test("a run still going shows in the thread with what the agent says and its tool calls folded", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => liveThread(s, () => "running") })
  await app.frame()
  await Bun.sleep(150)
  const text = await app.frame()
  expect(text).toMatch(/working for 0m 4\ds · called 2 tools/)
  expect(text).toContain("Both episodes were marked failed. Reading the events.")
  expect(text).toMatch(/›_ Bash ×2 {2}curl -s http:\/\/cleanuparr/)
  expect(text).toContain("enter latest run")
})

test("when the run ends the thread shows it as one line again", async () => {
  let status = "running"
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => liveThread(s, () => status) })
  await app.frame()
  await Bun.sleep(150)
  expect(await app.frame()).toContain("working for")
  status = "succeeded"
  await Bun.sleep(2300)
  const text = await app.frame()
  expect(text).not.toContain("working for")
  expect(text).not.toContain("Both episodes")
})

test("enter opens the run going now; with none, the latest run", async () => {
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => liveThread(s, () => "running") })
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(100)
  expect((await app.frame()).split("\n")[0]).toContain("Run · live-run")
  app.renderer.destroy()
  app = await startApp({ route: { name: "thread", id: THREAD_ID } })
  await app.frame()
  app.mockInput.pressEnter()
  await Bun.sleep(100)
  expect((await app.frame()).split("\n")[0]).toContain(`Run · ${[...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)!.runId.slice(0, 8)}`)
})
