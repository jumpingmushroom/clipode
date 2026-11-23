// File paths typed or pasted into a prompt. Dragging files into a terminal pastes their paths, quoted or with
// backslash-escaped spaces depending on the terminal; one path per line or separated by spaces both work.
import { stat } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"

/** Splits pasted text into paths: quotes group, "\\ " is a literal space, ~ is the home directory. */
export function parsePaths(text: string): string[] {
  const paths: string[] = []
  let current = ""
  let quote: string | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === "'" || ch === '"') quote = ch
    else if (ch === "\\" && i + 1 < text.length) current += text[++i]
    else if (/\s/.test(ch)) {
      if (current) paths.push(current)
      current = ""
    } else current += ch
  }
  if (current) paths.push(current)
  return paths.map((p) => resolve(p.startsWith("~/") ? homedir() + p.slice(1) : p))
}

/** Keeps files that exist and are not empty; reports the others. */
export async function checkFiles(paths: string[]): Promise<{ ok: string[]; bad: { path: string; reason: string }[] }> {
  const ok: string[] = []
  const bad: { path: string; reason: string }[] = []
  for (const path of paths) {
    const info = await stat(path).catch(() => null)
    if (!info) bad.push({ path, reason: "not found" })
    else if (!info.isFile()) bad.push({ path, reason: "not a file" })
    else if (info.size === 0) bad.push({ path, reason: "empty" })
    else ok.push(path)
  }
  return { ok, bad }
}
