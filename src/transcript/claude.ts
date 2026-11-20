// Ported from Paperclip packages/adapters/claude-local/src/ui/parse-stdout.ts (Claude Code stream-json)
import type { TranscriptEvent } from "./types.ts"
import { asNumber, asRecord, asString, errorText } from "./util.ts"

export const CLAUDE_TYPES = new Set(["system", "assistant", "user", "result"])

export function parseClaudeLine(p: Record<string, unknown>, line: string, ts: string): TranscriptEvent[] {
  const type = asString(p.type)
  if (type === "system" && p.subtype === "init") {
    return [{ kind: "init", ts, model: asString(p.model, "unknown"), sessionId: asString(p.session_id) }]
  }
  if (type === "assistant" || type === "user") {
    const content = asRecord(p.message)?.content
    const events: TranscriptEvent[] = []
    for (const raw of Array.isArray(content) ? content : []) {
      const block = asRecord(raw)
      if (!block) continue
      const blockType = asString(block.type)
      if (blockType === "text" && asString(block.text)) events.push({ kind: type, ts, text: asString(block.text) })
      else if (blockType === "thinking" && asString(block.thinking)) events.push({ kind: "thinking", ts, text: asString(block.thinking) })
      else if (blockType === "tool_use") {
        events.push({ kind: "tool_call", ts, name: asString(block.name, "unknown"), toolUseId: asString(block.id) || asString(block.tool_use_id) || undefined, input: block.input ?? {} })
      } else if (blockType === "tool_result") {
        const text = typeof block.content === "string"
          ? block.content
          : (Array.isArray(block.content) ? block.content : []).map((part) => asString(asRecord(part)?.text)).filter(Boolean).join("\n")
        events.push({ kind: "tool_result", ts, toolUseId: asString(block.tool_use_id), content: text, isError: block.is_error === true })
      }
    }
    return events.length ? events : [{ kind: "stdout", ts, text: line }]
  }
  if (type === "result") {
    const usage = asRecord(p.usage) ?? {}
    return [{
      kind: "result",
      ts,
      text: asString(p.result),
      inputTokens: asNumber(usage.input_tokens),
      outputTokens: asNumber(usage.output_tokens),
      cachedTokens: asNumber(usage.cache_read_input_tokens),
      costUsd: asNumber(p.total_cost_usd),
      isError: p.is_error === true,
      errors: Array.isArray(p.errors) ? p.errors.map(errorText).filter(Boolean) : [],
    }]
  }
  return [{ kind: "stdout", ts, text: line }]
}
