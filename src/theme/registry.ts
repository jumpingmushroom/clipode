// Built-in themes, themes discovered on disk, and resolution of a theme name to tokens.
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { TerminalColors } from "@opentui/core"
import clipodeDark from "./builtin/clipode-dark.json" with { type: "json" }
import clipodeLight from "./builtin/clipode-light.json" with { type: "json" }
import everforest from "./builtin/everforest.json" with { type: "json" }
import gruvbox from "./builtin/gruvbox.json" with { type: "json" }
import kanagawa from "./builtin/kanagawa.json" with { type: "json" }
import nord from "./builtin/nord.json" with { type: "json" }
import opencode from "./builtin/opencode.json" with { type: "json" }
import solarized from "./builtin/solarized.json" with { type: "json" }
import { isThemeJson, resolvePalette, type ThemeJson } from "./format.ts"
import { generateSystem } from "./system.ts"
import { toTheme, type Theme } from "./tokens.ts"

export type Mode = "dark" | "light"
export const SYSTEM = "system"

export const BUILTIN_THEMES: Record<string, ThemeJson> = {
  "clipode-dark": clipodeDark as ThemeJson,
  "clipode-light": clipodeLight as ThemeJson,
  opencode: opencode as ThemeJson,
  everforest: everforest as ThemeJson,
  gruvbox: gruvbox as ThemeJson,
  kanagawa: kanagawa as ThemeJson,
  nord: nord as ThemeJson,
  solarized: solarized as ThemeJson,
}

/** The theme used when none is chosen: clipode in the terminal's mode. */
export const defaultThemeName = (mode: Mode) => `clipode-${mode}`

// Ported from opencode packages/tui/src/theme/discovery.ts: every *.json in each directory, later directories win.
export async function discoverThemes(directories: string[]): Promise<Record<string, ThemeJson>> {
  const result: Record<string, ThemeJson> = {}
  for (const directory of directories) {
    const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return []
      return Promise.reject(error)
    })
    const files = entries
      .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && path.extname(entry.name) === ".json")
      .map((entry) => path.join(directory, entry.name))
      .sort()
    for (const file of files) {
      try {
        const json: unknown = JSON.parse(await readFile(file, "utf8"))
        if (isThemeJson(json)) result[path.basename(file, ".json")] = json
      } catch {
        // shortcut: a broken theme file is skipped silently; surface it in the status dialog once that exists.
      }
    }
  }
  return result
}

/** Resolves a theme name to tokens. Unknown names fall back to the default; "system" needs the terminal palette. */
export function resolveTheme(
  name: string | undefined,
  mode: Mode,
  themes: Record<string, ThemeJson>,
  terminal?: TerminalColors,
): Theme {
  if (name === SYSTEM && terminal) return toTheme(generateSystem(terminal, mode))
  const json = (name && themes[name]) || themes[defaultThemeName(mode)] || BUILTIN_THEMES[defaultThemeName(mode)]!
  try {
    return toTheme(resolvePalette(json, mode))
  } catch {
    return toTheme(resolvePalette(BUILTIN_THEMES[defaultThemeName(mode)]!, mode))
  }
}
