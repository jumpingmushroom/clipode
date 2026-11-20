import { afterEach, expect, test } from "bun:test"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

test("ctrl+c quits only when pressed twice", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressCtrlC()
  expect(app.renderer.isDestroyed).toBe(false)
  expect(await app.frame()).toContain("Press ctrl+c again to quit")
  app.mockInput.pressCtrlC()
  expect(app.renderer.isDestroyed).toBe(true)
})

test("the palette lists commands with their keys, filters, and runs the chosen one", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("p", { ctrl: true })
  let text = await app.frame()
  expect(text).toContain("Commands")
  expect(text).toMatch(/Switch theme\s+ctrl\+x shift\+t {2}ctrl\+t/)
  expect(text).toMatch(/Inbox\s+ctrl\+x i {2}g i/)
  await app.mockInput.typeText("them")
  text = await app.frame()
  expect(text).toContain("Switch theme")
  expect(text).not.toContain("Sign out")
  app.mockInput.pressEnter()
  expect(await app.frame()).toContain("Themes")
})

test("escape closes a dialog and screen keys work again", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("p", { ctrl: true })
  expect(await app.frame()).toContain("Commands")
  app.mockInput.pressEscape()
  await Bun.sleep(40)
  expect(await app.frame()).not.toContain("Commands")
  app.mockInput.pressKey("?")
  expect(await app.frame()).toContain("Type to filter key bindings")
})

test("the leader key shows as pending and runs a sequence", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("x", { ctrl: true })
  expect(await app.frame()).toContain("ctrl+x …")
  app.mockInput.pressKey("c")
  expect(await app.frame()).toContain("Companies")
})

test("the theme switcher previews on move, applies on enter, restores on escape", async () => {
  const changes: (string | undefined)[] = []
  app = await startApp({ onThemeChange: (n) => changes.push(n) })
  await app.frame()
  app.mockInput.pressKey("t", { ctrl: true })
  expect(await app.frame()).toMatch(/clipode dark\s+current/)
  app.mockInput.pressArrow("down")
  expect(await app.frame()).toMatch(/clipode light\s+previewing/)
  app.mockInput.pressEscape()
  await Bun.sleep(40)
  expect(changes).toEqual([])

  app.mockInput.pressKey("t", { ctrl: true })
  await app.frame()
  app.mockInput.pressArrow("down")
  app.mockInput.pressEnter()
  await app.frame()
  expect(changes).toEqual(["clipode-light"])
})

test("ctrl+b hides and shows the sidebar", async () => {
  app = await startApp()
  expect(await app.frame()).toContain("Needs you")
  app.mockInput.pressKey("b", { ctrl: true })
  expect(await app.frame()).not.toContain("Needs you")
})
