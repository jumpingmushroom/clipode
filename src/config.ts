// ~/.config/clipode/cli.json (JSONC). Environment variables override the file.
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export type Config = {
  /** Instance URL, for example https://paperclip.example.com */
  url?: string
  /** Theme name; unset follows the terminal with clipode-dark or clipode-light. */
  theme?: string
  /** Forces dark or light mode. */
  mode?: "dark" | "light"
  leader?: string
  /** Command id to binding, for example { "app.inbox": "<leader>i,g i" }. */
  keybinds?: Record<string, string>
  sidebar?: "auto" | "show" | "hide"
  /** Polling intervals in seconds when there is no WebSocket. */
  polling?: { inbox?: number; list?: number }
  mouse?: boolean
  plugins?: (string | [string, Record<string, unknown>])[]
  /** Desktop notifications for new inbox items while the terminal is in the background; on unless false. */
  notifications?: boolean
  /** Refuse every write (answers, decisions, comments, dismissals), as clipode 0.x did. */
  readOnly?: boolean
  /** Bearer token instead of a session cookie; from PAPERCLIP_API_KEY. */
  apiKey?: string
}

export function configDir(): string {
  return process.env.CLIPODE_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "clipode")
}

export async function loadConfig(dir = configDir()): Promise<{ config: Config; error?: string }> {
  let config: Config = {}
  let error: string | undefined
  try {
    const parsed: unknown = Bun.JSONC.parse(await readFile(join(dir, "cli.json"), "utf8"))
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) config = parsed as Config
    else error = "cli.json must hold an object"
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") error = `cli.json: ${(err as Error).message}`
  }
  if (process.env.PAPERCLIP_URL) config.url = process.env.PAPERCLIP_URL
  if (process.env.PAPERCLIP_API_KEY) config.apiKey = process.env.PAPERCLIP_API_KEY
  return { config, error }
}
