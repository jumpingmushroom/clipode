// Task references in Markdown, as in the web UI: links to a task and bare identifiers of known tasks get the task's
// status glyph and open the task on click.
import { TextAttributes, type MarkdownInlineSpan, type RGBA } from "@opentui/core"
import { createMemo, onMount } from "solid-js"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import type { Theme } from "../theme/tokens.ts"

/** One glyph per status, after the web UI's shapes. */
export const STATUS_GLYPHS: Record<string, string> = {
  backlog: "◌",
  todo: "○",
  in_progress: "◐",
  in_review: "◉",
  done: "✓",
  blocked: "■",
  cancelled: "×",
}

export function statusColor(status: string, theme: Theme): RGBA {
  if (status === "done") return theme.success
  if (status === "blocked" || status === "in_progress") return theme.warning
  if (status === "todo" || status === "in_review") return theme.accent
  return theme.muted
}

const ID = /\b[A-Z][A-Z0-9]*-\d+\b/g
/** The identifier a link points at: `…/issues/CLI-12` or `issue://CLI-12`. */
export const linkedId = (url: string) => url.match(/(?:\/issues\/|^issue:\/\/:?)([a-z][a-z0-9]*-\d+)(?=$|[/?#])/i)?.[1]?.toUpperCase()

/**
 * Rewrites spans so task references carry a status glyph and a click target. Bare identifiers count only when `find`
 * knows them, so "UTF-8" stays text.
 */
export function linkTasks(spans: MarkdownInlineSpan[], find: (identifier: string) => { status: string } | undefined, theme: Theme) {
  const out: MarkdownInlineSpan[] = []
  let last: string | undefined
  const glyph = (id: string) => {
    const task = find(id)
    if (task) out.push({ text: `${STATUS_GLYPHS[task.status] ?? "○"} `, fg: statusColor(task.status, theme), code: false, target: id })
  }
  for (const span of spans) {
    const id = span.link ? linkedId(span.link.url) : undefined
    if (id) {
      // A link split into several spans (bold inside, say) gets one glyph.
      if (last !== id) glyph(id)
      out.push({ ...span, target: id })
      last = id
      continue
    }
    last = undefined
    if (span.link || span.code) {
      out.push(span)
      continue
    }
    let at = 0
    for (const m of span.text.matchAll(ID)) {
      if (!find(m[0])) continue
      if (m.index > at) out.push({ ...span, text: span.text.slice(at, m.index) })
      glyph(m[0])
      out.push({ ...span, text: m[0], target: m[0], attributes: (span.attributes ?? 0) | TextAttributes.UNDERLINE })
      at = m.index + m[0].length
    }
    out.push(at ? { ...span, text: span.text.slice(at) } : span)
  }
  return out.filter((s) => s.text)
}

/** Props for `<Markdown>` that link the company's tasks and open them on click. */
export function useTaskRefs() {
  const company = useCompany()
  const route = useRoute()
  const { theme } = useTheme()
  onMount(() => void company.issues.list.load())
  const byIdentifier = createMemo(() => new Map(company.issues.list.data.map((t) => [t.identifier, t])))
  return {
    inlineHook: (spans: MarkdownInlineSpan[]) => linkTasks(spans, (id) => byIdentifier().get(id), theme()),
    // Draws the glyphs again once the list (and so each status) changes.
    hookVersion: () => [byIdentifier(), theme()],
    // A task outside the list opens by identifier, which the server accepts in place of the id.
    onTarget: (id: string) => route.navigate({ name: "thread", id: byIdentifier().get(id)?.id ?? id }),
  }
}
