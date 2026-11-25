// One loadable value with the store surface every store shares: load(), refresh(), status, data, error.
import { createStore } from "solid-js/store"

export type Status = "idle" | "loading" | "ready" | "error"

export type Resource<T> = {
  readonly status: Status
  readonly data: T
  readonly error: string | null
  readonly loadedAt: number | null
  /** Loads once; later calls reuse the data. */
  load(): Promise<void>
  /** Fetches again, keeping the current data on screen while it loads; an older request still on its way is ignored. */
  refresh(): Promise<void>
}

export function createResource<T>(fetcher: () => Promise<T>, initial: T, onError?: (err: unknown) => void): Resource<T> {
  const [state, set] = createStore({ status: "idle" as Status, data: initial, error: null as string | null, loadedAt: null as number | null })
  let inflight: Promise<void> | null = null
  let latest = 0
  // Every refresh asks again, since what the fetcher asks for (a sort, a period) or the server's data may have changed
  // since a request already on its way; only the newest answer is kept.
  const fetch = () => {
    const mine = ++latest
    set("status", "loading")
    const request: Promise<void> = fetcher()
      .then((data) => {
        if (mine === latest) set({ data, status: "ready", error: null, loadedAt: Date.now() })
      })
      .catch((err: unknown) => {
        if (mine === latest) set({ status: "error", error: err instanceof Error ? err.message : String(err) })
        onError?.(err)
      })
      .finally(() => {
        if (inflight === request) inflight = null
      })
    inflight = request
    return request
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
  }
}
