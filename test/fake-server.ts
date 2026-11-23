// A fake Paperclip for tests: Better Auth sign-in and the GET routes the screens use, served from recorded fixtures.
import companies from "./fixtures/company/companies.json"
import company from "./fixtures/company/company.json"
import agents from "./fixtures/company/agents.json"
import feed from "./fixtures/company/attention-feed.json"
import summary from "./fixtures/company/attention-summary.json"
import interactions from "./fixtures/company/issue-interactions.json"
import details from "./fixtures/company/issue-details.json"
import issues from "./fixtures/company/issues.json"
import projects from "./fixtures/company/projects.json"
import threadComments from "./fixtures/company/thread-comments.json"
import threadRuns from "./fixtures/company/thread-runs.json"
import threadCost from "./fixtures/company/thread-cost.json"
import liveRuns from "./fixtures/company/live-runs.json"
import run from "./fixtures/company/run.json"
import heartbeatRuns from "./fixtures/company/heartbeat-runs.json"
import runLog from "./fixtures/company/run-log.json"

export const COMPANY_ID = company.id
/** The finished run whose log was recorded. */
export const RUN_ID = run.id
/** The task whose comments, runs and cost were recorded. */
export const THREAD_ID = threadCost.issueId
export const PASSWORD = "correct horse battery staple"
export const API_KEY = "board-key-for-tests"
const SESSION = "paperclip-default.session_token"

/** A fixed body, or a function of the request URL for routes whose answer changes (a growing log). */
type Body = unknown | ((url: URL) => unknown)
export type FakeServer = {
  url: string
  requests: string[]
  stop(): void
  set(path: string, body: Body, status?: number): void
  /** Sends a live event to every connected WebSocket. */
  emit(type: string, payload: Record<string, unknown>): void
  /** Writes clients sent (POST and DELETE), with their JSON bodies. */
  writes: { method: string; path: string; body: unknown }[]
  /** Messages clients sent over the WebSocket. */
  received: Record<string, unknown>[]
  sockets: () => number
}

export function startFakeServer(): FakeServer {
  const requests: string[] = []
  const overrides = new Map<string, { body: Body; status: number }>()
  const routes: Record<string, unknown> = {
    "/api/companies": companies,
    [`/api/companies/${COMPANY_ID}/agents`]: agents,
    [`/api/companies/${COMPANY_ID}/attention`]: feed,
    [`/api/companies/${COMPANY_ID}/attention/summary`]: summary,
    [`/api/companies/${COMPANY_ID}/issues`]: issues,
    [`/api/companies/${COMPANY_ID}/projects`]: projects,
    [`/api/issues/${threadCost.issueId}/comments`]: threadComments,
    [`/api/issues/${threadCost.issueId}/runs`]: threadRuns,
    [`/api/issues/${threadCost.issueId}/cost-summary`]: threadCost,
    [`/api/companies/${COMPANY_ID}/live-runs`]: liveRuns,
    [`/api/companies/${COMPANY_ID}/heartbeat-runs`]: (url: URL) => {
      const agentId = url.searchParams.get("agentId")
      return heartbeatRuns.filter((r) => !agentId || r.agentId === agentId)
    },
    [`/api/heartbeat-runs/${run.id}`]: run,
    // The recorded log is complete, so a read from offset 0 returns all of it and no nextOffset.
    [`/api/heartbeat-runs/${run.id}/log`]: (url: URL) => ({ ...runLog, content: Number(url.searchParams.get("offset") ?? 0) > 0 ? "" : runLog.content, nextOffset: undefined }),
  }
  for (const [id, list] of Object.entries(interactions)) routes[`/api/issues/${id}/interactions`] = list
  for (const [id, issue] of Object.entries(details)) routes[`/api/issues/${id}`] = issue

  const sockets = new Set<{ send(d: string): void }>()
  const received: Record<string, unknown>[] = []
  const writes: { method: string; path: string; body: unknown }[] = []
  let eventId = 0
  const server = Bun.serve({
    port: 0,
    websocket: {
      open: (ws) => void sockets.add(ws),
      close: (ws) => void sockets.delete(ws),
      message(ws, m) {
        const msg = JSON.parse(String(m)) as Record<string, unknown>
        received.push(msg)
        if (msg.type === "live.hello") ws.send(JSON.stringify({ type: "live.capabilities", version: 1, capabilities: ["run-interests"] }))
        if (msg.type === "live.interests") ws.send(JSON.stringify({ type: "live.subscribed", version: 1, revision: msg.revision }))
      },
    },
    async fetch(req, srv) {
      const url = new URL(req.url)
      requests.push(`${req.method} ${url.pathname}`)
      // A session cookie, the test API key, or a local_trusted instance (the "trusted" override) all sign in.
      const signedIn =
        (req.headers.get("cookie")?.includes(`${SESSION}=tok`) ?? false) ||
        req.headers.get("authorization") === `Bearer ${API_KEY}` ||
        overrides.has("trusted")
      if (url.pathname === "/api/auth/sign-in/email") {
        const body = (await req.json()) as { password: string }
        if (body.password !== PASSWORD) return Response.json({ code: "INVALID_EMAIL_OR_PASSWORD" }, { status: 401 })
        return Response.json({}, { headers: { "Set-Cookie": `${SESSION}=tok; Path=/` } })
      }
      if (url.pathname === "/api/auth/sign-out") return Response.json({}, { headers: { "Set-Cookie": `${SESSION}=; Max-Age=0` } })
      if (url.pathname === `/api/companies/${COMPANY_ID}/events/ws`) {
        if (!signedIn || overrides.has("ws-refuse")) return new Response("forbidden", { status: 403 })
        return srv.upgrade(req) ? undefined : new Response("upgrade failed", { status: 400 })
      }
      if (!signedIn) return Response.json({ error: "Board authentication required" }, { status: 401 })
      const override = overrides.get(url.pathname)
      if (req.method !== "GET") {
        const text = await req.text()
        writes.push({ method: req.method, path: url.pathname, body: text ? JSON.parse(text) : null })
        if (override) return Response.json(typeof override.body === "function" ? override.body(url) : override.body, { status: override.status })
        // As the real server answers: an undo is 204 with no body, a new record 201, a decision 200.
        if (req.method === "DELETE") return new Response(null, { status: 204 })
        return Response.json({ ok: true }, { status: /comments$|inbox-dismissals$/.test(url.pathname) ? 201 : 200 })
      }
      if (override) return Response.json(typeof override.body === "function" ? override.body(url) : override.body, { status: override.status })
      if (url.pathname === "/api/auth/get-session") {
        return Response.json({ session: { id: "s", userId: "u" }, user: { id: "u", email: "user@example.com", name: "Operator" } })
      }
      if (url.pathname in routes) {
        const route = routes[url.pathname]
        return Response.json(typeof route === "function" ? route(url) : route)
      }
      return Response.json({ error: "not found" }, { status: 404 })
    },
  })
  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    stop: () => server.stop(true),
    set: (path, body, status = 200) => overrides.set(path, { body, status }),
    emit(type, payload) {
      const event = JSON.stringify({ id: ++eventId, companyId: COMPANY_ID, type, createdAt: new Date().toISOString(), payload })
      for (const ws of sockets) ws.send(event)
    },
    received,
    writes,
    sockets: () => sockets.size,
  }
}
