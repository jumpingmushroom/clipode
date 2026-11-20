// Turns a run log into transcript items. The format is detected per line, so a run is read correctly whatever
// its agent's adapter type says (claude_local agents write ACP records on Paperclip 2026.1117.0).
import { parseAcpLine } from "./acp.ts"
import { CLAUDE_TYPES, parseClaudeLine } from "./claude.ts"
import { CODEX_TYPES, parseCodexLine } from "./codex.ts"
import { emptyCarry, flushCarry, splitLog, type LogCarry } from "./log.ts"
import type { LogLine, ToolEntry, TranscriptEvent, TranscriptItem } from "./types.ts"
import { asRecord, asString } from "./util.ts"
export type { ToolEntry, TranscriptItem } from "./types.ts"

export function parseLine(line: LogLine): TranscriptEvent[] {
  const { ts, text } = line
  if (line.stream === "stderr") return text.trim() ? [{ kind: "stderr", ts, text }] : []
  if (line.stream === "system") return text.trim() ? [{ kind: "system", ts, text }] : []
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = asRecord(JSON.parse(text))
  } catch {
    // not JSON: plain output
  }
  if (!parsed) return text.trim() ? [{ kind: "stdout", ts, text }] : []
  const type = asString(parsed.type)
  if (type.startsWith("acpx.")) return parseAcpLine(parsed, text, ts)
  if (CODEX_TYPES.has(type)) return parseCodexLine(parsed, text, ts)
  if (CLAUDE_TYPES.has(type)) return parseClaudeLine(parsed, text, ts)
  return [{ kind: "stdout", ts, text }]
}

/** Folds events into items: text deltas join, and each tool call collects its updates and its result. */
export function fold(events: TranscriptEvent[], into: TranscriptItem[] = []): TranscriptItem[] {
  const items = into
  const tools = new Map<string, ToolEntry>()
  for (const item of items) if (item.kind === "tool") tools.set(item.id, item)
  for (const e of events) {
    const last = items.at(-1)
    switch (e.kind) {
      case "assistant":
      case "thinking":
        if (e.delta && last?.kind === e.kind) last.text += e.text
        else items.push({ kind: e.kind, ts: e.ts, text: e.text })
        break
      case "user":
        items.push({ kind: "user", ts: e.ts, text: e.text })
        break
      case "tool_call": {
        const id = e.toolUseId ?? `${e.name}-${items.length}`
        const existing = tools.get(id)
        if (existing) {
          // ACP sends a call, then updates for the same id; keep the most specific name and input.
          if (e.name && e.name !== "acp_tool") existing.name = e.name
          existing.input = e.input
        } else {
          const tool: ToolEntry = { kind: "tool", id, ts: e.ts, name: e.name, input: e.input, output: null, status: "running" }
          tools.set(id, tool)
          items.push(tool)
        }
        break
      }
      case "tool_result": {
        const tool = tools.get(e.toolUseId)
        if (tool) {
          tool.output = e.content
          tool.status = e.isError ? "error" : "done"
        } else {
          items.push({ kind: "tool", id: e.toolUseId, ts: e.ts, name: e.toolName ?? "tool", input: {}, output: e.content, status: e.isError ? "error" : "done" })
        }
        break
      }
      case "init":
        items.push({ kind: "init", ts: e.ts, model: e.model })
        break
      case "result":
        items.push({ ...e })
        break
      case "stdout":
        items.push({ kind: "raw", ts: e.ts, text: e.text })
        break
      default:
        items.push({ kind: e.kind, ts: e.ts, text: e.text })
    }
  }
  return items
}

/** Incremental reader for a live log: feed each fetched chunk, read the items. */
export function createTranscriptReader() {
  let carry: LogCarry = emptyCarry()
  const items: TranscriptItem[] = []
  return {
    push(content: string) {
      const split = splitLog(content, carry)
      carry = split.carry
      fold(split.lines.flatMap(parseLine), items)
      return items
    },
    /** Ends the log: lines without a final newline are read too. */
    finish() {
      fold(flushCarry(carry).flatMap(parseLine), items)
      carry = emptyCarry()
      return items
    },
    items: () => items,
  }
}

export function parseLog(content: string): TranscriptItem[] {
  const reader = createTranscriptReader()
  reader.push(content)
  return [...reader.finish()]
}
