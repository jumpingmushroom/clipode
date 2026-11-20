// Semantic colour tokens. Components read these by role and never use raw colours.
export type Theme = {
  background: string
  panel: string
  border: string
  text: string
  muted: string
  accent: string
  selection: string
  success: string
  warning: string
  error: string
}

// shortcut: one built-in palette, no resolver; step 3 adds clipode-light, opencode themes and mode detection.
export const clipodeDark: Theme = {
  background: "#0f1115",
  panel: "#181b22",
  border: "#2b303b",
  text: "#d7dae0",
  muted: "#8b93a1",
  accent: "#82a8ff",
  selection: "#1f2a44",
  success: "#7fc98f",
  warning: "#e0b05c",
  error: "#ef7f7f",
}
