// Semantic colour tokens. Components read these by role and never use raw colours.
import type { RGBA } from "@opentui/core"
import type { Palette } from "./format.ts"

export type Theme = {
  background: RGBA
  panel: RGBA
  border: RGBA
  text: RGBA
  muted: RGBA
  accent: RGBA
  selection: RGBA
  success: RGBA
  warning: RGBA
  error: RGBA
  /** The full opencode palette, for Markdown, syntax and diff colours that have no semantic token. */
  palette: Palette
}

/** Maps an opencode palette onto clipode's semantic roles. */
export function toTheme(palette: Palette): Theme {
  return {
    background: palette.background,
    panel: palette.backgroundPanel,
    border: palette.border,
    text: palette.text,
    muted: palette.textMuted,
    accent: palette.primary,
    selection: palette.backgroundElement,
    success: palette.success,
    warning: palette.warning,
    error: palette.error,
    palette,
  }
}
