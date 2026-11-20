// Ported from Paperclip packages/adapters/codex-local/src/ui/parse-stdout.ts (codex exec --json)
import type { TranscriptEvent } from "./types.ts"
import { asNumber, asRecord, asString, errorText, stringify } from "./util.ts"

export const CODEX_TYPES = new Set(["thread.started", "turn.started", "item.started", "item.completed", "turn.completed", "turn.failed", "error"])

function item(it: Record<string, unknown>, ts: string, phase: "started" | "completed"): TranscriptEvent[] {
  const type = asString(it.type)
  const id = asString(it.id)
  if (type === "agent_message") return asString(it.text) ? [{ kind: "assistant", ts, text: asString(it.text) }] : []
  if (type === "reasoning") return asString(it.text) ? [{ kind: "thinking", ts, text: asString(it.text) }] : []
  if (type === "command_execution") {
    const command = asString(it.command)
    const toolUseId = id || command || "command_execution"
    if (phase === "started") return [{ kind: "tool_call", ts, name: "bash", toolUseId, input: { command } }]
    const exitCode = typeof it.exit_code === "number" ? it.exit_code : null
    const status = asString(it.status)
    const output = asString(it.aggregated_output).replace(/\s+$/, "")
    return [{
      kind: "tool_result",
      ts,
      toolUseId,
      content: output || `exit ${exitCode ?? status}`,
      isError: (exitCode !== null && exitCode !== 0) || ["failed", "errored", "error", "cancelled"].includes(status),
    }]
  }
  if (type === "file_change" && phase === "completed") {
    const changes = (Array.isArray(it.changes) ? it.changes : []).map((c) => asRecord(c)).filter((c): c is Record<string, unknown> => !!c)
    const list = changes.map((c) => `${asString(c.kind, "update")} ${asString(c.path, "unknown")}`)
    return [{ kind: "system", ts, text: list.length ? `file changes: ${list.slice(0, 6).join(", ")}${list.length > 6 ? ` (+${list.length - 6} more)` : ""}` : "file changes applied" }]
  }
  if (type === "tool_use") {
    const name = asString(it.name, "unknown")
    if (phase === "started") return [{ kind: "tool_call", ts, name, toolUseId: id || name, input: it.input ?? {} }]
    const status = asString(it.status)
    const raw = it.content ?? it.output ?? it.result ?? it.error ?? it.message
    const isError = it.is_error === true || ["failed", "errored", "error", "cancelled"].includes(status)
    return [{ kind: "tool_result", ts, toolUseId: id || name, content: asString(raw) || errorText(raw) || stringify(raw) || `${name} ${isError ? "failed" : "completed"}`, isError }]
  }
  if (type === "tool_result" && phase === "completed") {
    return [{
      kind: "tool_result",
      ts,
      toolUseId: asString(it.tool_use_id, id),
      content: asString(it.content) || asString(it.output) || asString(it.result) || stringify(it.content ?? it.output ?? it.result),
      isError: it.is_error === true || asString(it.status) === "error",
    }]
  }
  if (type === "error" && phase === "completed") return [{ kind: "stderr", ts, text: errorText(it.message ?? it.error ?? it) || "error" }]
  return []
}

export function parseCodexLine(p: Record<string, unknown>, line: string, ts: string): TranscriptEvent[] {
  const type = asString(p.type)
  if (type === "thread.started") return [{ kind: "init", ts, model: asString(p.model, "codex"), sessionId: asString(p.thread_id) }]
  if (type === "turn.started") return []
  if (type === "item.started" || type === "item.completed") {
    const it = asRecord(p.item)
    return it ? item(it, ts, type === "item.started" ? "started" : "completed") : []
  }
  if (type === "turn.completed" || type === "turn.failed") {
    const usage = asRecord(p.usage)
    const message = type === "turn.failed" ? errorText(p.error ?? p.message) : ""
    return [{
      kind: "result",
      ts,
      text: asString(p.result),
      inputTokens: asNumber(usage?.input_tokens),
      outputTokens: asNumber(usage?.output_tokens),
      cachedTokens: asNumber(usage?.cached_input_tokens, asNumber(usage?.cache_read_input_tokens)),
      costUsd: asNumber(p.total_cost_usd),
      isError: type === "turn.failed" || p.is_error === true,
      errors: message ? [message] : Array.isArray(p.errors) ? p.errors.map(errorText).filter(Boolean) : [],
    }]
  }
  if (type === "error") return [{ kind: "stderr", ts, text: errorText(p.message ?? p.error ?? p) || line }]
  return [{ kind: "stdout", ts, text: line }]
}
