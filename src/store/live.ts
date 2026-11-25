// Keeps the selected company's stores current: live events patch or refetch them, a reconnect or resync refetches
// everything on screen, and while the WebSocket is down the stores are polled instead.
import { createEffect, on } from "solid-js"
import { connectLive, type LiveEvent } from "../api/live.ts"
import type { CompanyStores } from "./context.tsx"
import type { Session } from "./session.ts"

export type PollIntervals = { inbox: number; list: number }
const DEFAULT_POLL: PollIntervals = { inbox: 30, list: 60 }
/** Polling slows by this factor while the terminal does not have focus. */
const UNFOCUSED_FACTOR = 4

function debounce(fn: () => void, ms = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(fn, ms)
    timer.unref?.()
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : null)
export function eventIds(event: LiveEvent): { issueId: string | null; runId: string | null; entityType: string | null } {
  const p = event.payload
  return {
    issueId: str(p.issueId) ?? (p.entityType === "issue" ? str(p.entityId) : null),
    runId: str(p.runId) ?? (p.entityType === "heartbeat_run" ? str(p.entityId) : null) ?? (event.type.startsWith("heartbeat.run.") ? str(p.id) : null),
    entityType: str(p.entityType),
  }
}

export function startLiveSync(
  session: Session,
  company: CompanyStores,
  opts: {
    poll?: Partial<PollIntervals>
    focused?: () => boolean
    /** Every live event, after the stores have been told; for plugins. */
    onEvent?: (event: LiveEvent) => void
    WebSocketImpl?: Parameters<typeof connectLive>[0]["WebSocketImpl"]
  } = {},
) {
  const poll = { ...DEFAULT_POLL, ...opts.poll }
  const refreshInbox = debounce(() => void company.attention.refresh())
  const refreshTasks = debounce(() => {
    void company.issues.list.refresh()
    void company.issues.mine.refresh()
  })
  const refreshRuns = debounce(() => void company.runs.live.refresh())
  const refreshAgents = debounce(() => void company.agents.list.refresh())
  // Routines and activity have their own screens; fetch them again only once they have been opened.
  const ifOpened = (r: { status: string; refresh(): Promise<void> }) => () => void (r.status !== "idle" && r.refresh())
  const refreshActivity = debounce(ifOpened(company.activity))
  const refreshRoutines = debounce(ifOpened(company.routines))
  const refreshAll = () => {
    refreshInbox()
    refreshTasks()
    refreshRuns()
    refreshAgents()
    refreshActivity()
    refreshRoutines()
  }

  const onEvent = (event: LiveEvent) => {
    const { issueId, runId, entityType } = eventIds(event)
    switch (event.type) {
      case "activity.logged":
        // No event announces an inbox change, so any activity may have added or resolved an item.
        refreshInbox()
        refreshTasks()
        refreshActivity()
        if (entityType?.startsWith("routine")) refreshRoutines()
        if (issueId) company.issues.refreshThread(issueId)
        break
      case "heartbeat.run.queued":
      case "heartbeat.run.status":
        refreshRuns()
        if (runId) company.runs.refreshTranscript(runId)
        if (issueId) company.issues.refreshThread(issueId)
        break
      case "heartbeat.run.log":
      case "heartbeat.run.event":
        if (runId) company.runs.refreshTranscript(runId)
        break
      case "agent.status":
        refreshAgents()
        break
    }
    opts.onEvent?.(event)
  }

  const url = `${session.client().origin.replace(/^http/, "ws")}/api/companies/${encodeURIComponent(company.companyId)}/events/ws`
  // The events socket accepts only agent keys as bearer tokens, so a session signed in by API key polls instead.
  const live = session.client().token
    ? (session.setConnection("polling"), { setInterests() {}, reconnect() {}, close() {} })
    : connectLive({
    url,
    headers: () => ({ Cookie: session.client().cookieHeader() }),
    onEvent,
    onState: (s) => session.setConnection(s.status, s.retryAt, s.attempt),
    onResync: refreshAll,
    check: () => session.check(),
    onUnauthorized: () => session.expire(),
    WebSocketImpl: opts.WebSocketImpl,
  })
  createEffect(on(company.runs.watching, (ids) => live.setInterests(ids)))

  // Polling fallback: only while the WebSocket is not live.
  let lastInbox = Date.now()
  let lastList = Date.now()
  const tick = setInterval(() => {
    if (session.state.connection === "live") return
    const factor = opts.focused?.() === false ? UNFOCUSED_FACTOR : 1
    const now = Date.now()
    if (now - lastInbox >= poll.inbox * 1000 * factor) {
      lastInbox = now
      void company.attention.refresh()
      void company.runs.live.refresh()
    }
    if (now - lastList >= poll.list * 1000 * factor) {
      lastList = now
      void company.issues.list.refresh()
      void company.issues.mine.refresh()
      void company.agents.list.refresh()
      ifOpened(company.activity)()
      ifOpened(company.routines)()
    }
  }, 1000)
  tick.unref?.()

  return {
    reconnect: () => live.reconnect(),
    stop() {
      clearInterval(tick)
      live.close()
    },
  }
}
