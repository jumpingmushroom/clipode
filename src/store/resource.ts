// One loadable value with the store surface every store shares: load(), refresh(), status, data, error.
import { createStore } from "solid-js/store"

export type Status = "idle" | "loading" | "ready" | "error" | "stale"

export type Resource<T> = {
  readonly status: Status
  readonly data: T
  readonly error: string | null
  readonly loadedAt: number | null
  /** Loads once; later calls reuse the data. */
  load(): Promise<void>
  /** Fetches again, keeping the current data on screen while it loads. */
  refresh(): Promise<void>
  /** Marks the data out of date, for example after a live event. */
  invalidate(): void
}

export function createResource<T>(fetcher: () => Promise<T>, initial: T, onError?: (err: unknown) => void): Resource<T> {
  const [state, set] = createStore({ status: "idle" as Status, data: initial, error: null as string | null, loadedAt: null as number | null })
  let inflight: Promise<void> | null = null
  const fetch = () => {
    if (inflight) return inflight
    set("status", "loading")
    inflight = fetcher()
      .then((data) => set({ data, status: "ready", error: null, loadedAt: Date.now() }))
      .catch((err: unknown) => {
        set({ status: "error", error: err instanceof Error ? err.message : String(err) })
        onError?.(err)
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }
  return {
    get status() {
      return state.status
    },
    get data() {
      return state.data
    },
    get error() {
      return state.error
    },
    get loadedAt() {
      return state.loadedAt
    },
    load: () => (state.status === "idle" ? fetch() : (inflight ?? Promise.resolve())),
    refresh: fetch,
    invalidate: () => {
      if (state.status === "ready") set("status", "stale")
    },
  }
}
