// The live-events WebSocket: connect with the session cookie, the live.hello / live.interests handshake, reconnect with
// backoff. After a failed connect a GET tells an expired session from a network fault, because a refused upgrade
// only shows up in an error message.

export type LiveEvent = { id: number; type: string; createdAt: string; payload: Record<string, unknown> }
export type LiveStatus = "connecting" | "live" | "polling" | "offline"
export type LiveState = { status: LiveStatus; attempt: number; retryAt: number | null }
export type SessionCheck = "ok" | "unauthorized" | "unreachable"

export type LiveOptions = {
  url: string
  headers: () => Record<string, string>
  onEvent(event: LiveEvent): void
  onState(state: LiveState): void
  /** After a reconnect or a live.resync: data may have been missed, so refetch what is on screen. */
  onResync(): void
  /** Called after a failed connect. */
  check(): Promise<SessionCheck>
  onUnauthorized(): void
  baseDelayMs?: number
  maxDelayMs?: number
  /** For tests: a WebSocket constructor that accepts Bun's headers option. */
  WebSocketImpl?: new (url: string, options: { headers: Record<string, string> }) => WebSocket
}

export function connectLive(opts: LiveOptions) {
  const base = opts.baseDelayMs ?? 1000
  const max = opts.maxDelayMs ?? 30_000
  const Impl = opts.WebSocketImpl ?? (WebSocket as unknown as NonNullable<LiveOptions["WebSocketImpl"]>)
  let ws: WebSocket | null = null
  let attempt = 0
  // When the current socket opened. The backoff starts over only after a connection that lasted: a server that accepts
  // and then drops connections (an overloaded one closes with 1013) would otherwise be asked again every second.
  let openedAt = 0
  const STABLE_MS = 30_000
  let opened = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false
  let interests: string[] = []
  let revision = 0
  let negotiated = false

  const state = (status: LiveStatus, retryAt: number | null = null) => opts.onState({ status, attempt, retryAt })
  const sendInterests = () => {
    if (!negotiated || ws?.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: "live.interests", version: 1, revision: ++revision, runIds: interests }))
  }

  function connect() {
    if (closed) return
    timer = null
    negotiated = false
    state("connecting")
    const socket = new Impl(opts.url, { headers: opts.headers() })
    ws = socket
    let failed = false
    socket.onopen = () => {
      openedAt = Date.now()
      state("live")
      socket.send(JSON.stringify({ type: "live.hello", version: 1, capabilities: ["run-interests"] }))
      if (opened++ > 0) opts.onResync()
    }
    socket.onmessage = (message) => {
      let data: { type?: string; payload?: unknown } & Record<string, unknown>
      try {
        data = JSON.parse(String(message.data))
      } catch {
        return
      }
      if (data.type === "live.capabilities") {
        negotiated = true
        if (interests.length) sendInterests()
      } else if (data.type === "live.resync") opts.onResync()
      else if (typeof data.type === "string" && !data.type.startsWith("live.") && data.payload && typeof data.payload === "object") {
        opts.onEvent(data as unknown as LiveEvent)
      }
    }
    const fail = async () => {
      if (failed || closed || ws !== socket) return
      failed = true
      ws = null
      if (openedAt && Date.now() - openedAt >= STABLE_MS) attempt = 0
      openedAt = 0
      const check = await opts.check()
      // A reconnect (ctrl+r) during the check has opened a socket already; a second would deliver every event twice.
      if (closed || ws) return
      if (check === "unauthorized") {
        closed = true
        return opts.onUnauthorized()
      }
      const delay = Math.min(max, base * 2 ** attempt)
      attempt++
      state(check === "ok" ? "polling" : "offline", Date.now() + delay)
      timer = setTimeout(connect, delay)
      timer.unref?.()
    }
    socket.onclose = () => void fail()
    socket.onerror = () => void fail()
  }

  connect()
  return {
    /** The runs whose log and event lines this client wants. */
    setInterests(runIds: string[]) {
      interests = [...new Set(runIds)].sort()
      sendInterests()
    },
    /** Retries now instead of waiting for the backoff. */
    reconnect() {
      if (closed) return
      if (timer) clearTimeout(timer)
      // Detach the old socket first, so its close does not schedule a backoff.
      const old = ws
      ws = null
      old?.close()
      attempt = 0
      connect()
    },
    close() {
      closed = true
      if (timer) clearTimeout(timer)
      ws?.close()
      ws = null
    },
  }
}
