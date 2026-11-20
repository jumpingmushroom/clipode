// Runs: those queued or running now, and the transcript of an opened run.
import { createSignal } from "solid-js"
import { getRun, getRunLog, listLiveRuns } from "../api/endpoints/runs.ts"
import type { LiveRunSummary, RunDetail } from "../api/model.ts"
import { createTranscriptReader, type TranscriptItem } from "../transcript/parse.ts"
import { createResource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { LiveRunSummary, RunDetail } from "../api/model.ts"
export type { ToolEntry, TranscriptItem } from "../transcript/parse.ts"

export const LIVE_STATUSES = ["queued", "running"]
/** Safety limit for one read of a finished run: 64 ranges of 256 KB. */
const MAX_RANGES = 64

export function createTranscript(session: Session, runId: string) {
  const run = createResource<RunDetail | null>(() => getRun(session.client(), runId), null, session.handleError)
  const [items, setItems] = createSignal<TranscriptItem[]>([])
  const [error, setError] = createSignal<string | null>(null)
  const reader = createTranscriptReader()
  let offset = 0
  let reading: Promise<void> | null = null

  /** Reads what the log has beyond the last read; ends the transcript when the run has finished. */
  const read = () =>
    (reading ??= (async () => {
      try {
        for (let i = 0; i < MAX_RANGES; i++) {
          const chunk = await getRunLog(session.client(), runId, offset)
          offset = chunk.next
          if (chunk.content) setItems([...reader.push(chunk.content)])
          if (!chunk.more) break
        }
        if (run.data && !LIVE_STATUSES.includes(run.data.status)) setItems([...reader.finish()])
        setError(null)
      } catch (err) {
        session.handleError(err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        reading = null
      }
    })())

  return {
    run,
    items,
    error,
    live: () => !!run.data && LIVE_STATUSES.includes(run.data.status),
    async load() {
      await run.load()
      await read()
    },
    /** For a live run: fetch the run's status and any new log. */
    async poll() {
      await run.refresh()
      await read()
    },
  }
}

export type Transcript = ReturnType<typeof createTranscript>

export function createRunsStore(session: Session, companyId: string) {
  const transcripts = new Map<string, Transcript>()
  return {
    live: createResource<LiveRunSummary[]>(() => listLiveRuns(session.client(), companyId), [], session.handleError),
    transcript(runId: string): Transcript {
      if (!transcripts.has(runId)) transcripts.set(runId, createTranscript(session, runId))
      return transcripts.get(runId)!
    },
  }
}

export type RunsStore = ReturnType<typeof createRunsStore>
