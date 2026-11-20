// Sign-in, sign-out, session check, and the per-instance cookie store. The password is never stored.
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { ApiError, type Client } from "./client.ts"

export type SessionUser = { id: string; email: string | null; name: string | null }
export type Session = { session: { id: string; userId: string }; user: SessionUser }

export class SignInError extends Error {
  constructor(
    readonly reason: "credentials" | "rejected",
    message: string,
  ) {
    super(message)
    this.name = "SignInError"
  }
}

/** Signs in with email and password; the session cookie stays in the client's jar. */
export async function signIn(client: Client, email: string, password: string): Promise<void> {
  try {
    await client.post("/api/auth/sign-in/email", { email, password, rememberMe: true })
  } catch (err) {
    if (err instanceof ApiError && err.kind === "unauthorized") {
      throw new SignInError("credentials", "Sign-in failed: wrong email or password")
    }
    if (err instanceof ApiError && err.status === 403) {
      throw new SignInError("rejected", "Sign-in refused: the server does not trust this origin")
    }
    throw err
  }
  if (!client.cookieHeader()) throw new SignInError("rejected", "Sign-in returned no session cookie")
}

export async function signOut(client: Client): Promise<void> {
  try {
    await client.post("/api/auth/sign-out", {})
  } finally {
    client.setCookieHeader("")
  }
}

/** Returns the signed-in user, or null when the session is missing or expired. */
export async function getSession(client: Client): Promise<Session | null> {
  try {
    return await client.get<Session>("/api/auth/get-session")
  } catch (err) {
    if (err instanceof ApiError && err.kind === "unauthorized") return null
    throw err
  }
}

// ---------- cookie storage: ~/.local/state/clipode/auth.json, mode 0600, keyed by instance URL ----------

type AuthFile = Record<string, { cookie: string; savedAt: string }>

export function authFilePath(): string {
  const state = process.env.XDG_STATE_HOME || join(homedir(), ".local", "state")
  return join(state, "clipode", "auth.json")
}

async function readAuthFile(path: string): Promise<AuthFile> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as AuthFile
  } catch {
    return {}
  }
}

async function writeAuthFile(path: string, data: AuthFile) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  // Write to a 0600 temp file and rename, so the cookie is never readable by others, even briefly.
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 })
  await chmod(tmp, 0o600)
  await rename(tmp, path)
}

export async function loadCookie(baseUrl: string, path = authFilePath()): Promise<string | null> {
  return (await readAuthFile(path))[baseUrl]?.cookie ?? null
}

export async function saveCookie(baseUrl: string, cookie: string, path = authFilePath()): Promise<void> {
  const data = await readAuthFile(path)
  data[baseUrl] = { cookie, savedAt: new Date().toISOString() }
  await writeAuthFile(path, data)
}

export async function clearCookie(baseUrl: string, path = authFilePath()): Promise<void> {
  const data = await readAuthFile(path)
  if (!(baseUrl in data)) return
  delete data[baseUrl]
  await writeAuthFile(path, data)
}
