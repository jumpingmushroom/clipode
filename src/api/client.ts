// HTTP access to one Paperclip instance: base URL, cookie jar, Origin header, read-only guard, typed errors.

// Phase 1 is read-only: GET anywhere, POST only to these paths.
const ALLOWED_POSTS = new Set(["/api/auth/sign-in/email", "/api/auth/sign-out"])

export class ReadOnlyError extends Error {
  constructor(method: string, path: string) {
    super(`clipode is read-only: ${method} ${path} is not allowed`)
    this.name = "ReadOnlyError"
  }
}

export type ApiErrorKind = "unauthorized" | "http" | "not-json" | "network"

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export type Query = Record<string, string | number | boolean | undefined>

export class Client {
  readonly baseUrl: string
  readonly origin: string
  private readonly jar = new Map<string, string>()

  constructor(baseUrl: string, cookie = "") {
    const url = new URL(baseUrl)
    this.baseUrl = url.href.replace(/\/+$/, "")
    this.origin = url.origin
    this.setCookieHeader(cookie)
  }

  /** The Cookie header value for the current session; empty when signed out. */
  cookieHeader(): string {
    return [...this.jar].map(([name, value]) => `${name}=${value}`).join("; ")
  }

  setCookieHeader(header: string) {
    this.jar.clear()
    for (const pair of header.split(";")) {
      const eq = pair.indexOf("=")
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, { query })
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, { body })
  }

  async request<T>(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
    const verb = method.toUpperCase()
    if (verb !== "GET" && !(verb === "POST" && ALLOWED_POSTS.has(path))) throw new ReadOnlyError(verb, path)

    const url = new URL(this.baseUrl + path)
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    const headers: Record<string, string> = { Accept: "application/json" }
    const cookie = this.cookieHeader()
    if (cookie) headers.Cookie = cookie
    // Better Auth checks Origin against the trusted origins on state-changing requests.
    if (verb !== "GET") {
      headers.Origin = this.origin
      headers["Content-Type"] = "application/json"
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: verb,
        headers,
        body: verb === "GET" ? undefined : JSON.stringify(opts.body ?? {}),
        redirect: "manual",
      })
    } catch (err) {
      throw new ApiError("network", 0, `cannot reach ${this.origin}: ${(err as Error).message}`)
    }
    this.storeCookies(res)

    const text = await res.text()
    const type = res.headers.get("content-type") ?? ""
    let body: unknown = text
    if (type.includes("json")) {
      try {
        body = JSON.parse(text)
      } catch {
        throw new ApiError("not-json", res.status, `invalid JSON from ${verb} ${path}`)
      }
    }

    if (res.status === 401) {
      this.jar.clear()
      throw new ApiError("unauthorized", 401, "session expired or not signed in", body)
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ApiError("http", res.status, `${verb} ${path} failed with ${res.status}: ${errorText(body)}`, body)
    }
    // An HTML page here usually means a proxy sign-in page in front of the instance.
    if (!type.includes("json") && text.length > 0) {
      throw new ApiError("not-json", res.status, `${verb} ${path} returned ${type || "no content type"}, not JSON`)
    }
    return body as T
  }

  private storeCookies(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const [pair = "", ...attrs] = line.split(";")
      const eq = pair.indexOf("=")
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      const expired = attrs.some((a) => {
        const [k = "", v = ""] = a.split("=").map((s) => s.trim())
        return (k.toLowerCase() === "max-age" && Number(v) <= 0) || (k.toLowerCase() === "expires" && Date.parse(v) < Date.now())
      })
      if (expired || value === "") this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }
}

function errorText(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error)
  if (body && typeof body === "object" && "message" in body) return String((body as { message: unknown }).message)
  return typeof body === "string" ? body.slice(0, 200) : "no details"
}
