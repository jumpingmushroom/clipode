import { afterEach, expect, test } from "bun:test"
import { API_KEY, PASSWORD } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

async function type(text: string) {
  await app!.mockInput.typeText(text)
}

test("signs in, picks a company, and lands on the inbox", async () => {
  app = await startApp({ signedIn: false })
  let text = await app.frame()
  expect(text).toContain("Sign in")
  expect(text).toContain("Instance URL")

  await type(app.server.url)
  app.mockInput.pressTab()
  await type("user@example.com")
  app.mockInput.pressTab()
  await type("wrong")
  text = await app.frame()
  expect(text).toContain("•••••")
  expect(text).not.toContain("wrong")
  app.mockInput.pressEnter()
  await Bun.sleep(50)
  expect(await app.frame()).toContain("Sign-in failed: wrong email or password")

  await type(PASSWORD)
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  text = await app.frame()
  expect(text).toContain("Companies")
  app.mockInput.pressArrow("down")
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  text = await app.frame()
  expect(text).toContain("Decide now")
  expect(text).toContain("open a task to comment")
})

test("an unreachable instance is reported", async () => {
  app = await startApp({ signedIn: false })
  await app.frame()
  await type("http://127.0.0.1:1")
  app.mockInput.pressTab()
  await type("user@example.com")
  app.mockInput.pressTab()
  await type("x")
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  expect(await app.frame()).toContain("Cannot reach the instance")
})

test("PAPERCLIP_API_KEY signs in without a password and polls instead of using the WebSocket", async () => {
  app = await startApp({ apiKey: API_KEY })
  const text = await app.frame()
  expect(text).toContain("Decide now")
  expect(text).toContain("● polling")
  expect(app.server.requests.some((r) => r.endsWith("/events/ws"))).toBe(false)
})

test("a rejected API key returns to sign-in with a message", async () => {
  app = await startApp({ apiKey: "wrong-key" })
  expect(await app.frame()).toContain("PAPERCLIP_API_KEY was not accepted.")
})

test("an empty email and password sign in to a local_trusted instance", async () => {
  app = await startApp({ signedIn: false, before: (s) => s.set("trusted", true) })
  await app.frame()
  await type(app.server.url)
  app.mockInput.pressEnter()
  await Bun.sleep(80)
  expect(await app.frame()).toContain("Companies")
})

test("a lone email is not sent: the password field takes focus", async () => {
  app = await startApp({ signedIn: false })
  await app.frame()
  await type(app.server.url)
  app.mockInput.pressTab()
  await type("user@example.com")
  app.mockInput.pressEnter()
  await Bun.sleep(50)
  expect(app.server.requests.some((r) => r.includes("sign-in"))).toBe(false)
})
