import { afterEach, expect, test } from "bun:test"
import { PASSWORD } from "../fake-server.ts"
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
  expect(text).toContain("read-only - replies arrive in a later version")
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
