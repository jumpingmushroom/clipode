import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { allowed, ApiError, Client, ReadOnlyError } from "../../src/api/client.ts"
import { clearCookie, getSession, loadCookie, saveCookie, signIn, signOut, SignInError } from "../../src/api/auth.ts"
import feed from "../fixtures/attention-feed.json"

const SESSION = "paperclip-default.session_token"
const PASSWORD = "correct horse battery staple"

type Seen = { method: string; path: string; cookie: string | null; origin: string | null }
const seen: Seen[] = []

// A fake Paperclip: Better Auth sign-in and sign-out, get-session, one feed, and a proxy sign-in page.
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    const cookie = req.headers.get("cookie")
    seen.push({ method: req.method, path: url.pathname, cookie, origin: req.headers.get("origin") })
    const signedIn = cookie?.includes(`${SESSION}=tok123`) ?? false

    if (url.pathname === "/api/auth/sign-in/email" && req.method === "POST") {
      const body = (await req.json()) as { email: string; password: string }
      if (body.password !== PASSWORD) return Response.json({ code: "INVALID_EMAIL_OR_PASSWORD" }, { status: 401 })
      return Response.json(
        { redirect: false, token: "tok123" },
        { headers: { "Set-Cookie": `${SESSION}=tok123; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` } },
      )
    }
    if (url.pathname === "/api/auth/sign-out" && req.method === "POST") {
      return Response.json({ success: true }, { headers: { "Set-Cookie": `${SESSION}=; Path=/; Max-Age=0` } })
    }
    if (!signedIn && url.pathname !== "/proxy") return Response.json({ error: "Board authentication required" }, { status: 401 })
    if (url.pathname === "/api/auth/get-session") {
      return Response.json({ session: { id: "s", userId: "u" }, user: { id: "u", email: "user@example.com", name: "Operator" } })
    }
    if (url.pathname === `/api/companies/${feed.companyId}/attention`) {
      return Response.json({ ...feed, echo: Object.fromEntries(url.searchParams) })
    }
    if (url.pathname === "/proxy") return new Response("<html>Sign in to the proxy</html>", { headers: { "Content-Type": "text/html" } })
    return Response.json({ error: "not found" }, { status: 404 })
  },
})
const base = `http://127.0.0.1:${server.port}`

afterEach(() => {
  seen.length = 0
})
afterAll(() => {
  server.stop(true)
})

describe("read-only guard", () => {
  test.each([
    ["PUT", "/api/issues/1"],
    ["PATCH", "/api/issues/1"],
    ["DELETE", "/api/issues/1"],
    ["POST", "/api/issues/1/comments"],
    ["post", "/api/companies"],
    ["POST", "/api/auth/sign-in/email/../../issues"],
  ])("%s %s throws before any request is sent", async (method, path) => {
    const client = new Client(base, `${SESSION}=tok123`)
    await expect(client.request(method, path, { body: {} })).rejects.toBeInstanceOf(ReadOnlyError)
    expect(seen).toHaveLength(0)
  })

  test("GET and the two auth POSTs are allowed", async () => {
    const client = new Client(base)
    await signIn(client, "user@example.com", PASSWORD)
    await client.get("/api/auth/get-session")
    await signOut(client)
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      "POST /api/auth/sign-in/email",
      "GET /api/auth/get-session",
      "POST /api/auth/sign-out",
    ])
  })
})

describe("session cookie", () => {
  test("sign-in stores the cookie, sends Origin on POST, and sends the cookie on later GETs", async () => {
    const client = new Client(base + "/")
    await signIn(client, "user@example.com", PASSWORD)
    expect(client.cookieHeader()).toBe(`${SESSION}=tok123`)
    expect(seen[0]?.origin).toBe(base)

    const session = await getSession(client)
    expect(session?.user.name).toBe("Operator")
    expect(seen[1]?.cookie).toBe(`${SESSION}=tok123`)
    expect(seen[1]?.origin).toBeNull()
  })

  test("wrong password is a credentials error and leaves no cookie", async () => {
    const client = new Client(base)
    const err = await signIn(client, "user@example.com", "wrong").catch((e) => e)
    expect(err).toBeInstanceOf(SignInError)
    expect((err as SignInError).reason).toBe("credentials")
    expect(client.cookieHeader()).toBe("")
  })

  test("sign-out clears the cookie, honouring Max-Age=0", async () => {
    const client = new Client(base)
    await signIn(client, "user@example.com", PASSWORD)
    await signOut(client)
    expect(client.cookieHeader()).toBe("")
  })

  test("a 401 clears the session and is reported as unauthorized", async () => {
    const client = new Client(base, `${SESSION}=expired`)
    const err = await client.get("/api/companies").catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).kind).toBe("unauthorized")
    expect(client.cookieHeader()).toBe("")
    expect(await getSession(new Client(base))).toBeNull()
  })
})

describe("responses", () => {
  test("decodes the attention feed fixture and passes query parameters", async () => {
    const client = new Client(base, `${SESSION}=tok123`)
    const res = await client.get<typeof feed & { echo: Record<string, string> }>(
      `/api/companies/${feed.companyId}/attention`,
      { all: true, includeDismissed: true, cursor: undefined },
    )
    expect(res.items.map((i) => i.sourceKind)).toEqual(["blocker_attention", "issue_thread_interaction", "issue_thread_interaction"])
    expect(res.echo).toEqual({ all: "true", includeDismissed: "true" })
  })

  test("an HTML page is reported as not JSON", async () => {
    const err = await new Client(base).get("/proxy").catch((e) => e)
    expect((err as ApiError).kind).toBe("not-json")
  })

  test("other HTTP errors carry the status and the server message", async () => {
    const err = await new Client(base, `${SESSION}=tok123`).get("/api/nope").catch((e) => e)
    expect((err as ApiError).kind).toBe("http")
    expect((err as ApiError).status).toBe(404)
    expect((err as ApiError).message).toContain("not found")
  })

  test("an unreachable host is a network error", async () => {
    const err = await new Client("http://127.0.0.1:1").get("/api/health").catch((e) => e)
    expect((err as ApiError).kind).toBe("network")
  })
})

describe("cookie storage", () => {
  let dir = ""
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "clipode-auth-"))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("saves the cookie with mode 0600, keyed by instance, and never the password", async () => {
    const file = join(dir, "state", "auth.json")
    const client = new Client(base)
    await signIn(client, "user@example.com", PASSWORD)
    await saveCookie(client.baseUrl, client.cookieHeader(), file)
    await saveCookie("https://other.example", "x=1", file)

    expect((await stat(file)).mode & 0o777).toBe(0o600)
    const text = await readFile(file, "utf8")
    expect(text).not.toContain(PASSWORD)
    expect(await loadCookie(client.baseUrl, file)).toBe(`${SESSION}=tok123`)

    await clearCookie(client.baseUrl, file)
    expect(await loadCookie(client.baseUrl, file)).toBeNull()
    expect(await loadCookie("https://other.example", file)).toBe("x=1")
    expect((await stat(file)).mode & 0o777).toBe(0o600)
  })
})

describe("write allowlist", () => {
  test.each([
    ["POST", "/api/issues/i1/interactions/x1/respond", true],
    ["POST", "/api/issues/i1/interactions/x1/accept", true],
    ["POST", "/api/issues/i1/interactions/x1/reject", true],
    ["POST", "/api/approvals/a1/approve", true],
    ["POST", "/api/approvals/a1/reject", true],
    ["POST", "/api/approvals/a1/request-revision", true],
    ["POST", "/api/issues/i1/stalled-review-decision", true],
    ["POST", "/api/agents/a1/pause", true],
    ["POST", "/api/agents/a1/resume", true],
    ["POST", "/api/agents/a1/wakeup", true],
    ["POST", "/api/heartbeat-runs/r1/cancel", true],
    ["POST", "/api/agents/a1/clear-error", true],
    ["POST", "/api/agents/a1/lifecycle/retry", false],
    ["POST", "/api/approvals/a1/comments", true],
    ["POST", "/api/decisions/d1/decide", true],
    ["POST", "/api/decisions/d1/dismiss", true],
    ["POST", "/api/decisions/d1/cancel", false],
    ["POST", "/api/issues/i1/retry", true],
    ["POST", "/api/issues/i1/recovery-actions/resolve", true],
    ["POST", "/api/issues/i1/recovery-actions/recover-workspace", false],
    ["POST", "/api/companies/c1/join-requests/j1/approve", false],
    ["POST", "/api/routines/r1/run", true],
    ["PATCH", "/api/routines/r1", true],
    ["POST", "/api/companies/c1/routines", false],
    ["POST", "/api/routines/r1/triggers", false],
    ["PATCH", "/api/routine-triggers/t1", false],
    ["POST", "/api/agents/a1/terminate", false],
    ["POST", "/api/agents", false],
    ["POST", "/api/issues/i1/comments", true],
    ["POST", "/api/companies/c1/inbox-dismissals", true],
    ["DELETE", "/api/companies/c1/inbox-dismissals/attention%3Aitem%3A1", true],
    ["POST", "/api/issues/i1/interactions", false],
    ["POST", "/api/issues/i1/interactions/x1/cancel", false],
    ["POST", "/api/approvals/a1/resubmit", false],
    ["POST", "/api/companies", false],
    ["PATCH", "/api/issues/i1", true],
    ["POST", "/api/companies/c1/issues", true],
    ["PATCH", "/api/issues/i1/comments", false],
    ["PATCH", "/api/companies/c1", false],
    ["PUT", "/api/issues/i1/comments", false],
    ["DELETE", "/api/issues/i1", false],
    ["DELETE", "/api/companies/c1/inbox-dismissals", false],
    ["POST", "/api/issues/i1/comments/extra", false],
    ["POST", "/api/issues/../companies/c1/inbox-dismissals", false],
    ["POST", "/api/issues/i1/interactions/x1/../../comments", false],
    ["POST", "/api/issues//comments", false],
  ])("%s %s → %p", (method, path, expected) => {
    expect(allowed(method, path, true)).toBe(expected)
    if (method !== "GET") expect(allowed(method, path, false)).toBe(false)
  })

  test("a writing client sends an allowed write with Origin; a read-only client refuses it before sending", async () => {
    const writer = new Client(base, `${SESSION}=tok123`, undefined, true)
    await writer.post("/api/issues/i1/comments", { body: "hi" }).catch(() => {})
    expect(seen.at(-1)).toMatchObject({ method: "POST", path: "/api/issues/i1/comments", origin: base })
    seen.length = 0
    const reader = new Client(base, `${SESSION}=tok123`)
    await expect(reader.post("/api/issues/i1/comments", { body: "hi" })).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(writer.request("PUT", "/api/issues/i1", { body: {} })).rejects.toBeInstanceOf(ReadOnlyError)
    expect(seen).toHaveLength(0)
  })

  test("the check is made on the URL as sent: backslashes, encoded dot segments and other hosts are refused", async () => {
    const writer = new Client(base, `${SESSION}=tok123`, undefined, true)
    // Each would pass a check of the path as written, and reach a route outside the list.
    await expect(writer.request("PATCH", "/api/issues/..\\agents\\a1", { body: {} })).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(writer.post("/api/companies/%2e%2e/issues", {})).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(writer.post("/api/companies/c1/%2E%2E/%2e%2e/agents/a1/pause/../../../issues", {})).rejects.toBeInstanceOf(ReadOnlyError)
    // A path that does not start at the instance would carry the session to another host.
    await expect(writer.get("@elsewhere.example/x")).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(writer.get("api/companies")).rejects.toBeInstanceOf(ReadOnlyError)
    expect(seen).toHaveLength(0)
  })
})
