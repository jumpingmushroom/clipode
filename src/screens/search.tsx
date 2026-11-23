// Company search: tasks with their comments, documents and files, agents and projects, searched on the server as you type.
import { createSignal, onCleanup } from "solid-js"
import { ApiError } from "../api/client.ts"
import type { SearchResult } from "../api/model.ts"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { useDialog } from "../ui/dialog.tsx"
import { DialogSelect, type SelectOption } from "../ui/dialog-select.tsx"

/** Waits this long after the last keystroke; the server allows 60 searches a minute. */
const DEBOUNCE_MS = 300
const PROMPT = "Search tasks, comments, documents, agents and projects"

export function SearchDialog() {
  const company = useCompany()
  const route = useRoute()
  const dialog = useDialog()
  const [results, setResults] = createSignal<SearchResult[]>([])
  const [status, setStatus] = createSignal(PROMPT)
  const [more, setMore] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0
  onCleanup(() => clearTimeout(timer))

  const search = (text: string) => {
    clearTimeout(timer)
    const n = ++latest
    const q = text.trim()
    if (!q) {
      setResults([])
      setMore(false)
      return setStatus(PROMPT)
    }
    setStatus("Searching…")
    timer = setTimeout(() => {
      company.search(q).then(
        (r) => {
          if (n !== latest) return
          setResults(r.results)
          setMore(r.more)
          setStatus("No results")
        },
        (err: unknown) => {
          if (n !== latest) return
          setResults([])
          setStatus(err instanceof ApiError && err.status === 429 ? "Too many searches; wait a moment and type again" : `Search failed: ${(err as Error).message}`)
        },
      )
    }, DEBOUNCE_MS)
  }

  const open = (r: SearchResult) => {
    dialog.clear()
    if (r.type === "task") route.navigate({ name: "thread", id: r.id })
    else if (r.type === "agent") route.navigate({ name: "agent", id: r.id })
    // shortcut: the Tasks filter matches word starts, so a project whose first word another project shares shows both.
    else route.navigate({ name: "tasks", filter: `project:${r.title.split(/\s+/)[0]!.toLowerCase()}` })
  }

  const options = (): SelectOption<SearchResult>[] =>
    results().map((r) => ({
      value: r,
      title: r.type === "task" ? `${r.identifier ?? "—"}  ${r.title}` : r.title,
      description: r.excerpt ?? undefined,
      footer: r.type === "task" ? (r.where ?? "Task") : r.type === "agent" ? "Agent" : "Project",
    }))

  return (
    <DialogSelect
      title="Search"
      placeholder="Search"
      options={options()}
      onFilter={search}
      empty={status()}
      hint={more() ? "More matches than shown; type more to narrow" : undefined}
      onSelect={(o) => open(o.value)}
    />
  )
}
