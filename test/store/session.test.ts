import { afterAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { saveCookie } from "../../src/api/auth.ts"
import { createSession } from "../../src/store/session.ts"
import { PASSWORD, startFakeServer } from "../fake-server.ts"

const server = startFakeServer()
const dirs: string[] = []
afterAll(async () => {
  server.stop()
  for (const d of dirs) await rm(d, { recursive: true, force: true })
})
const authPath = async () => {
  const dir = await mkdtemp(join(tmpdir(), "clipode-session-"))
  dirs.push(dir)
  return join(dir, "auth.json")
}

test("the next start (for example after an update) restores the session from the remembered URL and saved cookie", async () => {
  const path = await authPath()
  let remembered: { url: string; email: string } | undefined
  const first = createSession({ authPath: path, onSignIn: (url, email) => (remembered = { url, email }) })
  await first.signIn(server.url, "user@example.com", PASSWORD)
  expect(first.state.status).toBe("ready")
  expect(remembered).toEqual({ url: server.url, email: "user@example.com" })

  const next = createSession({ url: remembered!.url, email: remembered!.email, authPath: path })
  await next.start()
  expect(next.state.status).toBe("ready")
  expect(next.state.userName).toBe("Operator")
})

test("with an expired cookie the next start shows sign-in with the URL and email filled in", async () => {
  const path = await authPath()
  await saveCookie(server.url, "paperclip-default.session_token=expired", path)
  const next = createSession({ url: server.url, email: "user@example.com", authPath: path })
  await next.start()
  expect(next.state).toMatchObject({ status: "signed-out", url: server.url, email: "user@example.com" })
})
