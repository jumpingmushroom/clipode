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

export const COMPANY_ID = company.id
/** The task whose comments, runs and cost were recorded. */
export const THREAD_ID = threadCost.issueId
export const PASSWORD = "correct horse battery staple"
const SESSION = "paperclip-default.session_token"

export type FakeServer = { url: string; requests: string[]; stop(): void; set(path: string, body: unknown, status?: number): void }

export function startFakeServer(): FakeServer {
  const requests: string[] = []
  const overrides = new Map<string, { body: unknown; status: number }>()
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
  }
  for (const [id, list] of Object.entries(interactions)) routes[`/api/issues/${id}/interactions`] = list
  for (const [id, issue] of Object.entries(details)) routes[`/api/issues/${id}`] = issue

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      requests.push(`${req.method} ${url.pathname}`)
      const signedIn = req.headers.get("cookie")?.includes(`${SESSION}=tok`) ?? false
      if (url.pathname === "/api/auth/sign-in/email") {
        const body = (await req.json()) as { password: string }
        if (body.password !== PASSWORD) return Response.json({ code: "INVALID_EMAIL_OR_PASSWORD" }, { status: 401 })
        return Response.json({}, { headers: { "Set-Cookie": `${SESSION}=tok; Path=/` } })
      }
      if (url.pathname === "/api/auth/sign-out") return Response.json({}, { headers: { "Set-Cookie": `${SESSION}=; Max-Age=0` } })
      if (!signedIn) return Response.json({ error: "Board authentication required" }, { status: 401 })
      const override = overrides.get(url.pathname)
      if (override) return Response.json(override.body, { status: override.status })
      if (url.pathname === "/api/auth/get-session") {
        return Response.json({ session: { id: "s", userId: "u" }, user: { id: "u", email: "user@example.com", name: "Operator" } })
      }
      if (url.pathname in routes) return Response.json(routes[url.pathname])
      return Response.json({ error: "not found" }, { status: 404 })
    },
  })
  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    stop: () => server.stop(true),
    set: (path, body, status = 200) => overrides.set(path, { body, status }),
  }
}
