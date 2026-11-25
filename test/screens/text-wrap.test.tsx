import { afterEach, expect, test } from "bun:test"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

// Reported on 2026-11-25: a long description ran past the new-task dialog instead of wrapping.
const TEXT = "Task SKO-226 seems stuck somehow. Could you look into what's happening to it?"

test("a long description wraps inside the new-task dialog, and the field grows with it", async () => {
  app = await startApp({ route: { name: "tasks" }, width: 140, height: 30, readClipboard: async () => ({ text: TEXT }) })
  await app.frame()
  app.mockInput.pressKey("n")
  await app.frame()
  app.mockInput.pressKey("v", { ctrl: true })
  await Bun.sleep(150)
  app.mockInput.pressTab()
  await Bun.sleep(80)
  const lines = (await app.frame()).split("\n")
  const first = lines.findIndex((l) => l.includes("Description  Task SKO-226"))
  const esc = lines.find((l) => l.includes("New task"))!.indexOf("esc")
  expect(first).toBeGreaterThan(-1)
  // Nothing of the description reaches past the dialog's right edge (where its "esc" ends).
  expect(lines[first]!.trimEnd().length).toBeLessThanOrEqual(esc + 3)
  expect(lines[first + 1]).toContain("happening to it?")
  expect(lines[first + 3]).toContain("Title")
})
