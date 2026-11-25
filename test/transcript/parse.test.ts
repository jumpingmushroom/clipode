import { expect, test } from "bun:test"
import runLog from "../fixtures/company/run-log.json"
import { createTranscriptReader, parseLog } from "../../src/transcript/parse.ts"

const rec = (stream: string, chunk: string, ts = "2026-11-20T10:00:00.000Z") => JSON.stringify({ ts, stream, chunk })
const log = (...records: string[]) => records.join("\n") + "\n"

test("ACP log recorded from the instance: session, merged text, tool calls with results, final result", () => {
  const items = parseLog(runLog.content)
  expect(items.find((i) => i.kind === "init")).toMatchObject({ model: "claude-opus-5-5" })
  const text = items.filter((i) => i.kind === "assistant")
  expect(text.length).toBeGreaterThan(0)
  expect(text.length).toBeLessThan(62)
  const tools = items.filter((i) => i.kind === "tool")
  expect(tools.length).toBeGreaterThan(0)
  expect(tools.every((t) => t.kind === "tool" && t.status !== "running")).toBe(true)
  expect(items.at(-1)?.kind === "result" || items.some((i) => i.kind === "result")).toBe(true)
})

test("Claude stream-json: init, thinking, tool use and result, final cost", () => {
  const lines = [
    { type: "system", subtype: "init", model: "claude-sonnet-5-5", session_id: "s1" },
    { type: "assistant", message: { content: [{ type: "thinking", thinking: "Check the upload code first." }, { type: "text", text: "I will read the upload endpoint." }, { type: "tool_use", id: "t1", name: "Read", input: { file_path: "src/import/upload.ts" } }] } },
    { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "42 lines" }] }] } },
    { type: "result", subtype: "success", result: "Done.", total_cost_usd: 0.21, usage: { input_tokens: 14100, output_tokens: 4300, cache_read_input_tokens: 900 } },
  ]
  const items = parseLog(log(...lines.map((l) => rec("stdout", JSON.stringify(l) + "\n"))))
  expect(items.map((i) => i.kind)).toEqual(["init", "thinking", "assistant", "tool", "result"])
  expect(items[3]).toMatchObject({ name: "Read", output: "42 lines", status: "done", input: { file_path: "src/import/upload.ts" } })
  expect(items[4]).toMatchObject({ costUsd: 0.21, inputTokens: 14100, outputTokens: 4300 })
})

test("Codex json: commands become bash tools with exit status", () => {
  const lines = [
    { type: "thread.started", thread_id: "th1" },
    { type: "item.completed", item: { type: "agent_message", text: "Running the tests." } },
    { type: "item.started", item: { id: "c1", type: "command_execution", command: "pnpm test" } },
    { type: "item.completed", item: { id: "c1", type: "command_execution", command: "pnpm test", exit_code: 1, aggregated_output: "1 failed" } },
    { type: "turn.completed", usage: { input_tokens: 10, output_tokens: 5 } },
  ]
  const items = parseLog(log(...lines.map((l) => rec("stdout", JSON.stringify(l) + "\n"))))
  expect(items.map((i) => i.kind)).toEqual(["init", "assistant", "tool", "result"])
  expect(items[2]).toMatchObject({ name: "bash", status: "error", output: "1 failed", input: { command: "pnpm test" } })
})

test("lines split across chunks and across reads are joined; other adapters fall back to raw lines", () => {
  const reader = createTranscriptReader()
  const json = JSON.stringify({ type: "acpx.text_delta", text: "hello world" })
  const content = log(rec("stdout", json.slice(0, 10)), rec("stderr", "warn: slow\n"), rec("stdout", json.slice(10) + "\nplain output\n"))
  reader.push(content.slice(0, 40))
  const items = reader.push(content.slice(40))
  expect(items.map((i) => i.kind)).toEqual(["stderr", "assistant", "raw"])
  expect(items[1]).toMatchObject({ text: "hello world" })
  expect(items[2]).toMatchObject({ text: "plain output" })
  expect(createTranscriptReader().finish()).toEqual([])
})

test("an ACP terminal call sent as several updates becomes one call with its command and its output", () => {
  const call = (o: Record<string, unknown>) => rec("stdout", JSON.stringify({ type: "acpx.tool_call", toolCallId: "t1", ...o }) + "\n")
  // As CLI-17's log had them on 2026-11-25.
  const items = parseLog(
    log(
      call({ name: "Terminal", status: "pending", text: "Terminal (pending)", tag: "tool_call" }),
      call({ name: "sleep 8; date", text: "sleep 8; date: sleep 8; date", tag: "tool_call_update" }),
      call({ name: "Terminal", text: "tool call", tag: "tool_call_update" }),
      call({ name: "Terminal", status: "completed", text: "tool call (completed): ```console\nWed Nov 25 13:44:07 CET 2026\n```", tag: "tool_call_update" }),
    ),
  )
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ kind: "tool", name: "Terminal", input: { command: "sleep 8; date" }, output: "Wed Nov 25 13:44:07 CET 2026", status: "done" })
})
