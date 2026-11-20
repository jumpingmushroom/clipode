import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { THEME_COLORS, resolvePalette } from "../../src/theme/format.ts"
import { BUILTIN_THEMES, discoverThemes, resolveTheme } from "../../src/theme/registry.ts"
import { generateSystem } from "../../src/theme/system.ts"

const hex = (c: { toInts(): number[] }) => "#" + c.toInts().slice(0, 3).map((n) => n.toString(16).padStart(2, "0")).join("")

test("every built-in theme resolves every colour in both modes", () => {
  for (const [name, json] of Object.entries(BUILTIN_THEMES)) {
    for (const mode of ["dark", "light"] as const) {
      const palette = resolvePalette(json, mode)
      for (const key of THEME_COLORS) expect(palette[key], `${name} ${mode} ${key}`).toBeDefined()
    }
  }
})

test("clipode themes carry the agreed mockup tokens", () => {
  const dark = resolveTheme("clipode-dark", "dark", BUILTIN_THEMES)
  expect([dark.background, dark.panel, dark.border, dark.text, dark.muted, dark.accent, dark.selection, dark.success, dark.warning, dark.error].map(hex)).toEqual([
    "#0f1115", "#181b22", "#2b303b", "#d7dae0", "#8b93a1", "#82a8ff", "#1f2a44", "#7fc98f", "#e0b05c", "#ef7f7f",
  ])
  const light = resolveTheme("clipode-light", "light", BUILTIN_THEMES)
  expect([light.background, light.accent, light.selection, light.error].map(hex)).toEqual(["#f7f8fa", "#2f5fd0", "#dbe5fb", "#b3261e"])
})

test("no theme name follows the terminal mode; unknown names fall back", () => {
  expect(hex(resolveTheme(undefined, "light", BUILTIN_THEMES).background)).toBe("#f7f8fa")
  expect(hex(resolveTheme("nope", "dark", BUILTIN_THEMES).background)).toBe("#0f1115")
})

test("the system theme is built from the terminal palette", () => {
  const palette = Array.from({ length: 16 }, (_, i) => `#${(i * 16).toString(16).padStart(2, "0").repeat(3)}`)
  const colors = { palette, defaultBackground: "#101010", defaultForeground: "#e0e0e0" } as Parameters<typeof generateSystem>[0]
  const theme = resolveTheme("system", "dark", BUILTIN_THEMES, colors)
  expect(hex(theme.text)).toBe("#e0e0e0")
  expect(hex(theme.error)).toBe(palette[1]!)
})

test("themes are discovered from disk, later directories win, broken files are skipped", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clipode-themes-"))
  try {
    const a = join(dir, "a")
    const b = join(dir, "b")
    await Bun.write(join(a, "mine.json"), JSON.stringify({ theme: { ...BUILTIN_THEMES.nord!.theme, primary: "#111111" }, defs: BUILTIN_THEMES.nord!.defs }))
    await Bun.write(join(b, "mine.json"), JSON.stringify({ theme: { ...BUILTIN_THEMES.nord!.theme, primary: "#222222" }, defs: BUILTIN_THEMES.nord!.defs }))
    await writeFile(join(b, "broken.json"), "{ not json")
    const found = await discoverThemes([a, b, join(dir, "missing")])
    expect(Object.keys(found)).toEqual(["mine"])
    expect(hex(resolveTheme("mine", "dark", found).accent)).toBe("#222222")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("a theme with a broken colour reference falls back to the default", () => {
  const broken = { theme: { ...BUILTIN_THEMES.nord!.theme, primary: "missingRef" } }
  expect(hex(resolveTheme("broken", "dark", { broken } as never).background)).toBe("#0f1115")
})
