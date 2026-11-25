import { afterEach, expect, test } from "bun:test"
import { connectLive, type LiveEvent, type LiveState } from "../../src/api/live.ts"

type Msg = Record<string, unknown>
const servers: { stop(force?: boolean): void }[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.stop(true)
})

function wsServer(opts: { requireCookie?: string } = {}) {
  const received: Msg[] = []
  const sockets: { send(d: string): void; close(): void }[] = []
  let headers: Record<string, string> = {}
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) {
      headers = Object.fromEntries(req.headers)
      if (opts.requireCookie && req.headers.get("cookie") !== opts.requireCookie) return new Response("forbidden", { status: 403 })
      return srv.upgrade(req) ? undefined : new Response("no", { status: 400 })
    },
    websocket: {
      open(ws) {
        sockets.push(ws)
      },
      message(ws, m) {
        const msg = JSON.parse(String(m)) as Msg
        received.push(msg)
        if (msg.type === "live.hello") ws.send(JSON.stringify({ type: "live.capabilities", version: 1, capabilities: ["run-interests"] }))
        if (msg.type === "live.interests") ws.send(JSON.stringify({ type: "live.subscribed", version: 1, revision: msg.revision }))
      },
    },
  })
  servers.push(server)
  return { url: `ws://127.0.0.1:${server.port}/api/companies/c/events/ws`, received, sockets, headers: () => headers, server }
}

const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out")
    await Bun.sleep(5)
  }
}

test("connects with the cookie, says hello, sends interests with rising revisions, and delivers events", async () => {
  const s = wsServer({ requireCookie: "sid=1" })
  const events: LiveEvent[] = []
  const states: LiveState["status"][] = []
  const live = connectLive({
    url: s.url,
    headers: () => ({ Cookie: "sid=1" }),
    onEvent: (e) => events.push(e),
    onState: (st) => states.push(st.status),
    onResync: () => {},
    check: async () => "ok",
    onUnauthorized: () => {},
  })
  live.setInterests(["run-b", "run-a"])
  await until(() => s.received.some((m) => m.type === "live.interests"))
  expect(s.received[0]).toEqual({ type: "live.hello", version: 1, capabilities: ["run-interests"] })
  expect(s.received[1]).toEqual({ type: "live.interests", version: 1, revision: 1, runIds: ["run-a", "run-b"] })
  live.setInterests(["run-c"])
  await until(() => s.received.length === 3)
  expect(s.received[2]).toMatchObject({ revision: 2, runIds: ["run-c"] })

  s.sockets[0]!.send(JSON.stringify({ id: 1, companyId: "c", type: "activity.logged", createdAt: "", payload: { entityType: "issue", entityId: "i1" } }))
  await until(() => events.length === 1)
  expect(events[0]!.type).toBe("activity.logged")
  expect(states).toEqual(["connecting", "live"])
  live.close()
})

test("a dropped connection reconnects with backoff and asks for a resync", async () => {
  const s = wsServer()
  let resyncs = 0
  const states: LiveState[] = []
  const live = connectLive({
    url: s.url,
    headers: () => ({}),
    onEvent: () => {},
    onState: (st) => states.push(st),
    onResync: () => resyncs++,
    check: async () => "ok",
    onUnauthorized: () => {},
    baseDelayMs: 20,
  })
  await until(() => s.sockets.length === 1 && states.at(-1)?.status === "live")
  s.sockets[0]!.close()
  await until(() => states.some((st) => st.status === "polling"))
  expect(states.find((st) => st.status === "polling")!.retryAt).toBeGreaterThan(0)
  await until(() => s.sockets.length === 2 && resyncs === 1)
  live.close()
})

test("a reconnect while a failed connect is being checked leaves one socket, not two", async () => {
  const s = wsServer()
  let answer: (v: "ok") => void = () => {}
  const live = connectLive({
    url: s.url,
    headers: () => ({}),
    onEvent: () => {},
    onState: () => {},
    onResync: () => {},
    check: () => new Promise((done) => (answer = done)),
    onUnauthorized: () => {},
    baseDelayMs: 10,
  })
  await until(() => s.sockets.length === 1)
  s.sockets[0]!.close()
  await Bun.sleep(30)
  live.reconnect()
  await until(() => s.sockets.length === 2)
  answer("ok")
  await Bun.sleep(80)
  expect(s.sockets).toHaveLength(2)
  live.close()
})

test("a refused upgrade with an expired session signs out; an unreachable server is offline", async () => {
  const s = wsServer({ requireCookie: "sid=valid" })
  let unauthorized = 0
  const live = connectLive({
    url: s.url,
    headers: () => ({ Cookie: "sid=old" }),
    onEvent: () => {},
    onState: () => {},
    onResync: () => {},
    check: async () => "unauthorized",
    onUnauthorized: () => unauthorized++,
  })
  await until(() => unauthorized === 1)
  live.close()

  const states: LiveState["status"][] = []
  const off = connectLive({
    url: "ws://127.0.0.1:1/x",
    headers: () => ({}),
    onEvent: () => {},
    onState: (st) => states.push(st.status),
    onResync: () => {},
    check: async () => "unreachable",
    onUnauthorized: () => {},
    baseDelayMs: 10_000,
  })
  await until(() => states.includes("offline"))
  off.close()
})
