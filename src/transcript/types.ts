// What a run log becomes. Events come from one log line each; entries are what the transcript screen shows.

/** One parsed log line, a subset of Paperclip's TranscriptEntry (packages/adapter-utils/src/types.ts). */
export type TranscriptEvent =
  | { kind: "assistant"; ts: string; text: string; delta?: boolean }
  | { kind: "thinking"; ts: string; text: string; delta?: boolean }
  | { kind: "user"; ts: string; text: string }
  | { kind: "tool_call"; ts: string; name: string; toolUseId?: string; input: unknown }
  | { kind: "tool_result"; ts: string; toolUseId: string; toolName?: string; content: string; isError: boolean }
  | { kind: "init"; ts: string; model: string; sessionId: string }
  | { kind: "result"; ts: string; text: string; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number; isError: boolean; errors: string[] }
  | { kind: "system"; ts: string; text: string }
  | { kind: "stderr"; ts: string; text: string }
  | { kind: "stdout"; ts: string; text: string }

export type ToolEntry = {
  kind: "tool"
  id: string
  ts: string
  name: string
  input: unknown
  output: string | null
  status: "running" | "done" | "error"
}

export type TranscriptItem =
  | { kind: "assistant" | "thinking" | "user"; ts: string; text: string }
  | ToolEntry
  | { kind: "init"; ts: string; model: string }
  | { kind: "result"; ts: string; text: string; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number; isError: boolean; errors: string[] }
  | { kind: "system" | "stderr" | "raw"; ts: string; text: string }

export type LogLine = { ts: string; stream: string; text: string }
