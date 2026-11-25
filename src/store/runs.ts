// Runs: those queued or running now, and the transcript of an opened run.
import { createSignal } from "solid-js"
import { cancelRun, getRun, getRunLog, listLiveRuns } from "../api/endpoints/runs.ts"
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
  let again = false

  /**
   * Reads what the log has beyond the last read; ends the transcript when the run has finished. A read asked for during
   * another runs once more after it, since the log (or the run's status) may have moved on since that one started.
   */
  const read = (): Promise<void> => {
    if (reading) {
      again = true
      return reading
    }
    reading = (async () => {
      try {
        do {
          again = false
          for (let i = 0; i < MAX_RANGES; i++) {
            const chunk = await getRunLog(session.client(), runId, offset)
            offset = chunk.next
            if (chunk.content) setItems([...reader.push(chunk.content)])
            if (!chunk.more) break
          }
        } while (again)
        if (run.data && !LIVE_STATUSES.includes(run.data.status)) setItems([...reader.finish()])
        setError(null)
      } catch (err) {
        session.handleError(err)
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        reading = null
      }
    })()
    return reading
  }

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
  const [watching, setWatching] = createSignal<string[]>([])
  return {
    /** Runs whose transcript is on screen; the live connection asks the server for their log lines. */
    watching,
    watch(runId: string) {
      setWatching((w) => [...w, runId])
      return () => setWatching((w) => w.filter((id) => id !== runId))
    },
    /** Stops a run, then refreshes the live runs and, if open, its transcript. */
    async cancel(runId: string) {
      await cancelRun(session.client(), runId).catch((err) => Promise.reject(session.notSent(err)))
      void this.live.refresh()
      const t = transcripts.get(runId)
      if (t) void t.poll()
    },
    /** Reads new log lines of an open transcript; does nothing for a run that is not open. */
    refreshTranscript(runId: string) {
      const t = transcripts.get(runId)
      if (t && watching().includes(runId)) void t.poll()
    },
    live: createResource<LiveRunSummary[]>(() => listLiveRuns(session.client(), companyId), [], session.handleError),
    transcript(runId: string): Transcript {
      if (!transcripts.has(runId)) transcripts.set(runId, createTranscript(session, runId))
      return transcripts.get(runId)!
    },
  }
}

export type RunsStore = ReturnType<typeof createRunsStore>
