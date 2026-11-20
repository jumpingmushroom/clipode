// Who is signed in to which instance, the companies they can see, and the selected company.
import { createStore } from "solid-js/store"
import { clearCookie, getSession, loadCookie, saveCookie, signIn as apiSignIn, signOut as apiSignOut, SignInError } from "../api/auth.ts"
import { ApiError, Client } from "../api/client.ts"
import { listCompanies } from "../api/endpoints/companies.ts"
import type { CompanySummary } from "../api/model.ts"
export type { CompanySummary } from "../api/model.ts"

export type SessionStatus = "starting" | "signed-out" | "signing-in" | "ready"
export type ConnectionState = "connecting" | "live" | "polling" | "offline"

export type SessionOptions = {
  url?: string
  email?: string
  /** Last company per instance URL, from kv.json. */
  lastCompany?: Record<string, string>
  onCompany?: (url: string, companyId: string) => void
  authPath?: string
}

export function createSession(opts: SessionOptions = {}) {
  const [state, set] = createStore({
    status: "starting" as SessionStatus,
    url: opts.url ?? "",
    email: opts.email ?? "",
    error: null as string | null,
    userName: null as string | null,
    companies: [] as CompanySummary[],
    companyId: null as string | null,
    connection: "connecting" as ConnectionState,
  })
  let client = new Client(opts.url || "http://localhost")

  async function enter() {
    const session = await getSession(client)
    if (!session) return false
    const companies = await listCompanies(client)
    const remembered = opts.lastCompany?.[client.baseUrl]
    const companyId = companies.find((c) => c.id === remembered)?.id ?? (companies.length === 1 ? companies[0]!.id : null)
    set({ status: "ready", userName: session.user.name ?? session.user.email, email: session.user.email ?? state.email, companies, companyId, error: null })
    return true
  }

  const api = {
    state,
    client: () => client,
    host: () => (state.url ? new URL(client.baseUrl).host : ""),
    /** Restores a saved session; without one, shows sign-in. */
    async start() {
      if (!state.url) return void set("status", "signed-out")
      try {
        client = new Client(state.url, (await loadCookie(new Client(state.url).baseUrl, opts.authPath)) ?? "")
        if (!(await enter())) set("status", "signed-out")
      } catch (err) {
        set({ status: "signed-out", error: err instanceof Error ? err.message : String(err) })
      }
    },
    async signIn(url: string, email: string, password: string) {
      set({ status: "signing-in", url, email, error: null })
      try {
        client = new Client(url)
        await apiSignIn(client, email, password)
        await saveCookie(client.baseUrl, client.cookieHeader(), opts.authPath)
        if (!(await enter())) throw new Error("Signed in, but the server did not accept the session")
      } catch (err) {
        set({ status: "signed-out", error: signInMessage(err) })
      }
    },
    async signOut() {
      await apiSignOut(client).catch(() => {})
      await clearCookie(client.baseUrl, opts.authPath)
      set({ status: "signed-out", companyId: null, companies: [], userName: null, error: null })
    },
    /** A 401 anywhere ends the session and returns to sign-in with the URL and email kept. */
    expire() {
      void clearCookie(client.baseUrl, opts.authPath)
      set({ status: "signed-out", companyId: null, error: "Your session expired. Sign in again." })
    },
    selectCompany(id: string) {
      set("companyId", id)
      opts.onCompany?.(client.baseUrl, id)
    },
    setConnection(connection: ConnectionState) {
      set("connection", connection)
    },
    /** Error handler for stores: a 401 expires the session. */
    handleError(err: unknown) {
      if (err instanceof ApiError && err.kind === "unauthorized") api.expire()
    },
  }
  return api
}

export type Session = ReturnType<typeof createSession>

function signInMessage(err: unknown): string {
  if (err instanceof SignInError) return err.message
  if (err instanceof ApiError && err.kind === "network") return `Cannot reach the instance. Check the address and try again.`
  if (err instanceof ApiError && err.kind === "not-json") return "The address answered with a web page, not the Paperclip API. Is a proxy sign-in in the way?"
  if (err instanceof TypeError) return "That is not a valid URL."
  return err instanceof Error ? err.message : String(err)
}
