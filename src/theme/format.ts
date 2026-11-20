// Ported from opencode packages/theme/src/tui/v1.ts, packages/tui/src/theme/resolve.ts and packages/tui/src/theme/color.ts
import { RGBA } from "@opentui/core"

export const THEME_COLORS = [
  "primary", "secondary", "accent", "error", "warning", "success", "info", "text", "textMuted",
  "selectedListItemText", "background", "backgroundPanel", "backgroundElement", "backgroundMenu",
  "border", "borderActive", "borderSubtle", "diffAdded", "diffRemoved", "diffContext", "diffHunkHeader",
  "diffHighlightAdded", "diffHighlightRemoved", "diffAddedBg", "diffRemovedBg", "diffContextBg", "diffLineNumber",
  "diffAddedLineNumberBg", "diffRemovedLineNumberBg", "markdownText", "markdownHeading", "markdownLink",
  "markdownLinkText", "markdownCode", "markdownBlockQuote", "markdownEmph", "markdownStrong",
  "markdownHorizontalRule", "markdownListItem", "markdownListEnumeration", "markdownImage", "markdownImageText",
  "markdownCodeBlock", "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString",
  "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
] as const
export type ThemeColor = (typeof THEME_COLORS)[number]
export type Palette = Record<ThemeColor, RGBA>

export type HexColor = `#${string}`
export type ColorValue = HexColor | string | { dark: string; light: string } | number
/** opencode's theme JSON format (v1), so existing opencode themes load unchanged. */
export type ThemeJson = {
  $schema?: string
  defs?: Record<string, string>
  theme: Omit<Record<ThemeColor, ColorValue>, "selectedListItemText" | "backgroundMenu"> & {
    selectedListItemText?: ColorValue
    backgroundMenu?: ColorValue
    thinkingOpacity?: number
  }
}

export function isThemeJson(value: unknown): value is ThemeJson {
  return !!value && typeof value === "object" && "theme" in value && typeof value.theme === "object" && value.theme !== null
}

export function resolvePalette(theme: ThemeJson, mode: "dark" | "light"): Palette {
  const defs = theme.defs ?? {}
  const table = theme.theme as Record<string, ColorValue | undefined>
  function resolveColor(color: ColorValue, chain: string[] = []): RGBA {
    if (typeof color === "number") return ansiToRgba(color)
    if (typeof color === "object") return resolveColor(color[mode], chain)
    if (color === "transparent" || color === "none") return RGBA.fromInts(0, 0, 0, 0)
    if (color.startsWith("#")) return RGBA.fromHex(color)
    if (chain.includes(color)) throw new Error(`Circular color reference: ${[...chain, color].join(" -> ")}`)
    const next = defs[color] ?? table[color]
    if (next === undefined) throw new Error(`Color reference "${color}" not found in defs or theme`)
    return resolveColor(next, [...chain, color])
  }
  const out = {} as Palette
  for (const key of THEME_COLORS) {
    const value = table[key]
    if (value !== undefined) out[key] = resolveColor(value)
  }
  out.selectedListItemText ??= out.background
  out.backgroundMenu ??= out.backgroundElement
  return out
}

export function ansiToRgba(code: number): RGBA {
  if (code < 16) {
    const ansiColors = [
      "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
      "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
    ]
    return RGBA.fromHex(ansiColors[code] ?? "#000000")
  }
  if (code < 232) {
    const index = code - 16
    const b = index % 6
    const g = Math.floor(index / 6) % 6
    const r = Math.floor(index / 36)
    const val = (x: number) => (x === 0 ? 0 : x * 40 + 55)
    return RGBA.fromInts(val(r), val(g), val(b))
  }
  if (code < 256) {
    const gray = (code - 232) * 10 + 8
    return RGBA.fromInts(gray, gray, gray)
  }
  return RGBA.fromInts(0, 0, 0)
}

export function tint(base: RGBA, overlay: RGBA, alpha: number): RGBA {
  const r = base.r + (overlay.r - base.r) * alpha
  const g = base.g + (overlay.g - base.g) * alpha
  const b = base.b + (overlay.b - base.b) * alpha
  return RGBA.fromInts(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255))
}
