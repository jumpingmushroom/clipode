import { afterEach, expect, test } from "bun:test"
import { join } from "node:path"
import { loadPlugins } from "../../src/plugin/loader.ts"
import type { Plugin } from "../../src/plugin/types.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

test("the loader imports plugins by path, with options; a bad path or export is an error, not a crash", async () => {
  const root = join(import.meta.dir, "../..")
  const { plugins, errors } = await loadPlugins(
    ["plugins/oldest-item.tsx", ["plugins/oldest-item.tsx", { toastFailures: false }], "plugins/missing.tsx", "package.json"],
    root,
  )
  expect(plugins.map((p) => p.plugin.id)).toEqual(["oldest-item", "oldest-item"])
  expect(plugins[1]!.options).toEqual({ toastFailures: false })
  expect(errors.map((e) => e.source)).toEqual(["plugins/missing.tsx", "package.json"])
})

test("the example plugin adds a line under the inbox and a command in the palette", async () => {
  const { plugins } = await loadPlugins(["plugins/oldest-item.tsx"], join(import.meta.dir, "../.."))
  app = await startApp({ plugins })
  let text = await app.frame()
  expect(text).toMatch(/Oldest open item: \d+d · DEMO-\d+/)
  app.mockInput.pressKey("x", { ctrl: true })
  app.mockInput.pressKey("o")
  text = await app.frame()
  expect(text).toContain("Inbox · ")
})

test("plugins get live events, the read-only escape hatch, and slots; one that throws is reported", async () => {
  const seen: string[] = []
  let got: unknown
  const good: Plugin = {
    id: "good",
    async setup(ctx) {
      ctx.paperclip.on("activity.logged", (e) => seen.push(e.type))
      got = await ctx.paperclip.get("/api/companies")
      ctx.ui.slot("sidebar_content", () => <text>from good</text>)
    },
  }
  const bad: Plugin = {
    id: "bad",
    setup() {
      throw new Error("boom")
    },
  }
  app = await startApp({ plugins: [
    { plugin: good, options: {}, source: "good" },
    { plugin: bad, options: {}, source: "bad" },
  ] })
  let text = await app.frame()
  expect(text).toContain("from good")
  expect(text).toContain("Plugin bad failed: boom")
  expect(Array.isArray(got)).toBe(true)
  app.server.emit("activity.logged", {})
  await Bun.sleep(50)
  expect(seen).toEqual(["activity.logged"])
  app.mockInput.pressKey("x", { ctrl: true })
  app.mockInput.pressKey("s")
  text = await app.frame()
  expect(text).toMatch(/bad\s+failed: boom/)
})
