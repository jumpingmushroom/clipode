// A run log is newline-separated JSON records {ts, stream, chunk}. Chunks split output at arbitrary points, so lines
// are rebuilt per stream; a record or line cut off at the end of a byte range is carried into the next read.

export type LogCarry = { record: string; lines: Record<string, { ts: string; text: string }> }
export const emptyCarry = (): LogCarry => ({ record: "", lines: {} })

export function splitLog(content: string, carry: LogCarry = emptyCarry()): { lines: { ts: string; stream: string; text: string }[]; carry: LogCarry } {
  const records = (carry.record + content).split("\n")
  const rest = records.pop() ?? ""
  const pending = { ...carry.lines }
  const lines: { ts: string; stream: string; text: string }[] = []
  for (const raw of records) {
    if (!raw.trim()) continue
    let record: { ts?: string; stream?: string; chunk?: string }
    try {
      record = JSON.parse(raw)
    } catch {
      lines.push({ ts: "", stream: "stdout", text: raw })
      continue
    }
    const stream = record.stream ?? "stdout"
    const ts = record.ts ?? ""
    const parts = ((pending[stream]?.text ?? "") + (record.chunk ?? "")).split("\n")
    const tail = parts.pop() ?? ""
    for (const text of parts) lines.push({ ts: pending[stream]?.ts || ts, stream, text })
    if (tail) pending[stream] = { ts: parts.length ? ts : pending[stream]?.ts || ts, text: tail }
    else delete pending[stream]
  }
  return { lines, carry: { record: rest, lines: pending } }
}

/** Lines still waiting for a newline, for a finished run whose output did not end with one. */
export function flushCarry(carry: LogCarry): { ts: string; stream: string; text: string }[] {
  return Object.entries(carry.lines).map(([stream, l]) => ({ ts: l.ts, stream, text: l.text }))
}
