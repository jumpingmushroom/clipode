import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { App } from "../src/app.tsx"

let setup: Awaited<ReturnType<typeof testRender>> | undefined
afterEach(() => {
  if (setup && !setup.renderer.isDestroyed) setup.renderer.destroy()
  setup = undefined
})

async function start(props: Partial<Parameters<typeof App>[0]> = {}) {
  setup = await testRender(() => <App version="0.0.0" mode="dark" {...props} />, { width: 100, height: 30 })
  await setup.renderOnce()
  return setup
}
const frame = async () => {
  await Bun.sleep(5)
  await setup!.renderOnce()
  return setup!.captureCharFrame()
}

test("shows the wordmark and key hints", async () => {
  await start()
  const text = await frame()
  expect(text).toContain("▄█▀▀▀▀  ██  ██  ██▀▀█▄  ▄█▀▀█▄  ▄█▀▀██  ▄█▀▀█▄")
  expect(text).toContain("ctrl+p commands")
})

test("ctrl+c quits only when pressed twice", async () => {
  const s = await start()
  s.mockInput.pressCtrlC()
  expect(s.renderer.isDestroyed).toBe(false)
  expect(await frame()).toContain("Press ctrl+c again to quit")
  s.mockInput.pressCtrlC()
  expect(s.renderer.isDestroyed).toBe(true)
})

test("the palette lists commands with their keys, filters, and runs the chosen one", async () => {
  const s = await start()
  s.mockInput.pressKey("p", { ctrl: true })
  let text = await frame()
  expect(text).toContain("Commands")
  expect(text).toMatch(/Switch theme\s+ctrl\+x shift\+t {2}ctrl\+t/)
  await s.mockInput.typeText("them")
  text = await frame()
  expect(text).toContain("Switch theme")
  expect(text).not.toContain("Quit")
  s.mockInput.pressEnter()
  expect(await frame()).toContain("Themes")
})

test("escape closes a dialog and screen keys work again", async () => {
  const s = await start()
  s.mockInput.pressKey("p", { ctrl: true })
  expect(await frame()).toContain("Commands")
  s.mockInput.pressEscape()
  await Bun.sleep(40)
  expect(await frame()).not.toContain("Commands")
  s.mockInput.pressKey("?")
  expect(await frame()).toContain("Help")
})

test("the leader key shows as pending and runs a sequence", async () => {
  const s = await start()
  s.mockInput.pressKey("x", { ctrl: true })
  expect(await frame()).toContain("ctrl+x …")
  s.mockInput.pressKey("h")
  expect(await frame()).toContain("Type to filter key bindings")
})

test("the theme switcher previews on move, applies on enter, restores on escape", async () => {
  const changes: (string | undefined)[] = []
  const s = await start({ onThemeChange: (n) => changes.push(n) })
  s.mockInput.pressKey("t", { ctrl: true })
  let text = await frame()
  expect(text).toMatch(/clipode dark\s+current/)
  s.mockInput.pressArrow("down")
  text = await frame()
  expect(text).toMatch(/clipode light\s+previewing/)
  expect(s.renderer.root).toBeDefined()
  s.mockInput.pressEscape()
  await Bun.sleep(40)
  expect(changes).toEqual([])

  s.mockInput.pressKey("t", { ctrl: true })
  await frame()
  s.mockInput.pressArrow("down")
  s.mockInput.pressEnter()
  await frame()
  expect(changes).toEqual(["clipode-light"])
})
