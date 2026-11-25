// Ported from Paperclip packages/adapter-utils/src/acpx-engine/ui.ts (parseAcpxStdoutLine)
import type { TranscriptEvent } from "./types.ts"
import { asNumber, asRecord, asString, stringify } from "./util.ts"

function statusText(p: Record<string, unknown>): string {
  const text = asString(p.text).trim()
  const tag = asString(p.tag).trim()
  const used = asNumber(p.used, -1)
  const size = asNumber(p.size, -1)
  const parts: string[] = []
  if (text) parts.push(text)
  if (tag && !text) parts.push(tag)
  if (used >= 0 && size > 0) parts.push(`(${used}/${size} ctx)`)
  return parts.join(" ") || tag || "status"
}

const toolId = (p: Record<string, unknown>) => asString(p.toolCallId) || asString(p.toolUseId) || asString(p.id)

export function parseAcpLine(p: Record<string, unknown>, line: string, ts: string): TranscriptEvent[] {
  const type = asString(p.type)
  if (type === "acpx.session") {
    // Paperclip shows the agent and mode; the model, when the session names it, is more useful here.
    return [{ kind: "init", ts, model: asString(p.model) || asString(p.agent, "acpx"), sessionId: asString(p.acpSessionId) || asString(p.sessionId) }]
  }
  if (type === "acpx.text_delta") {
    const text = asString(p.text)
    if (!text) return []
    const channel = asString(p.channel) || asString(p.stream)
    return [{ kind: channel === "thought" || channel === "thinking" ? "thinking" : "assistant", ts, text, delta: true }]
  }
  if (type === "acpx.tool_call") {
    const status = asString(p.status)
    const text = asString(p.text)
    const name = asString(p.name, "acp_tool")
    const id = toolId(p)
    // Claude over ACP sends one call as several updates (CLI-17, 2026-11-25): "Terminal (pending)", then one whose name
    // is the command ("sleep 8; date", text "sleep 8; date: sleep 8; date"), then "tool call", then the output.
    if (asString(p.tag) === "tool_call_update" && !status) {
      if (text.startsWith(`${name}:`)) return [{ kind: "tool_call", ts, name: "acp_tool", toolUseId: id || undefined, input: { command: name } }]
      return []
    }
    const record = asRecord(p.input)
    const input =
      p.input === undefined
        ? { ...(text ? { text } : {}), ...(status ? { status } : {}) }
        : record
          ? { ...record, ...(status && record.status === undefined ? { status } : {}), ...(text && record.text === undefined ? { text } : {}) }
          : p.input
    const done = status === "completed" || status === "failed" || status === "cancelled"
    // A finishing update only adds the output; the call's name and command came before.
    const events: TranscriptEvent[] = done && asString(p.tag) === "tool_call_update" ? [] : [{ kind: "tool_call", ts, name, toolUseId: id || undefined, input }]
    if (done) events.push({ kind: "tool_result", ts, toolUseId: id || name, toolName: name, content: unwrapOutput(text) || status, isError: status !== "completed" })
    return events
  }
  if (type === "acpx.tool_result") {
    return [{
      kind: "tool_result",
      ts,
      toolUseId: toolId(p) || asString(p.name, "acp_tool"),
      toolName: asString(p.name) || undefined,
      content: stringify(p.content ?? p.output ?? p.error),
      isError: p.isError === true || p.error !== undefined,
    }]
  }
  if (type === "acpx.status") return [{ kind: "system", ts, text: statusText(p) }]
  if (type === "acpx.result") {
    return [{
      kind: "result",
      ts,
      text: asString(p.summary, asString(p.stopReason, asString(p.text))),
      inputTokens: asNumber(p.inputTokens),
      outputTokens: asNumber(p.outputTokens),
      cachedTokens: asNumber(p.cachedTokens),
      costUsd: asNumber(p.costUsd),
      isError: p.isError === true,
      errors: Array.isArray(p.errors) ? p.errors.map(stringify).filter(Boolean) : [],
    }]
  }
  if (type === "acpx.error") return [{ kind: "stderr", ts, text: asString(p.message, line) }]
  return [{ kind: "system", ts, text: asString(p.message, type) }]
}

/** "tool call (completed): ```console\nout\n```" → "out"; other text as it is. */
function unwrapOutput(text: string): string {
  const m = /^tool call \([a-z]+\):\s*(?:```[a-z]*\n([\s\S]*?)\n?```)?\s*$/.exec(text)
  return m ? (m[1] ?? "") : text
}
