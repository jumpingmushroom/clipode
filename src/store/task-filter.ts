// The Tasks filter line: free text plus `project:`, `assignee:`, `priority:` and `status:` tokens.
// Each token matches the start of a word, case-insensitively: "assignee:mar" finds Maren.
import type { TaskSummary } from "../api/model.ts"

export type TaskFilter = { text: string; project?: string; assignee?: string; priority?: string; status?: string }
const FIELDS = ["project", "assignee", "priority", "status"] as const

export function parseFilter(input: string): TaskFilter {
  const filter: TaskFilter = { text: "" }
  const words: string[] = []
  for (const word of input.trim().split(/\s+/).filter(Boolean)) {
    const [key, ...rest] = word.split(":")
    const field = FIELDS.find((f) => f === key?.toLowerCase())
    if (field && rest.length) filter[field] = rest.join(":").toLowerCase()
    else words.push(word)
  }
  filter.text = words.join(" ").toLowerCase()
  return filter
}

const startsWord = (value: string | null | undefined, query: string) =>
  !!value && value.toLowerCase().split(/[\s_-]+/).some((w) => w.startsWith(query))

export function matchesFilter(
  task: TaskSummary,
  filter: TaskFilter,
  names: { assignee: (t: TaskSummary) => string | undefined; project: (t: TaskSummary) => string | undefined },
): boolean {
  if (filter.status && !startsWord(task.status, filter.status)) return false
  if (filter.priority && !startsWord(task.priority, filter.priority)) return false
  if (filter.assignee && !startsWord(names.assignee(task), filter.assignee)) return false
  if (filter.project && !startsWord(names.project(task), filter.project)) return false
  if (!filter.text) return true
  return `${task.identifier ?? ""} ${task.title} ${names.assignee(task) ?? ""}`.toLowerCase().includes(filter.text)
}
