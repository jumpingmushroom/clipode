// Company search: tasks with their comments, documents and files, agents and projects, ranked by the server.
import type { CompanySearchResponse, CompanySearchResult } from "@paperclipai/shared"
import type { Client } from "../client.ts"
import type { SearchResult } from "../model.ts"

/** The server's largest page; it allows 60 searches a minute per user. */
export const SEARCH_LIMIT = 50
// Fields whose snippet only repeats the row title.
const TITLE_FIELDS = ["title", "identifier", "agent", "project"]

export async function searchCompany(client: Client, companyId: string, q: string): Promise<{ results: SearchResult[]; more: boolean }> {
  const res = await client.get<CompanySearchResponse>(`/api/companies/${encodeURIComponent(companyId)}/search`, { q, limit: SEARCH_LIMIT })
  return { results: res.results.map(toResult), more: res.hasMore }
}

export function toResult(r: CompanySearchResult): SearchResult {
  const first = r.snippets[0]
  const excerpt = first && !TITLE_FIELDS.includes(first.field) ? around(first.text, first.highlights[0]?.start ?? 0) : null
  if (r.type === "agent" || r.type === "project") return { type: r.type, id: r.id, title: r.title, identifier: null, where: null, excerpt: null }
  // An artifact hit belongs to a task; open that task.
  const task = r.artifact ? { id: r.artifact.issueId, identifier: r.artifact.issueIdentifier, title: r.artifact.issueTitle } : (r.issue ?? r)
  return { type: "task", id: task.id, title: task.title, identifier: "identifier" in task ? task.identifier : null, where: r.sourceLabel, excerpt }
}

/** One line of the snippet, starting a little before the match so it is visible in a narrow row. */
function around(text: string, start: number): string {
  const from = Math.max(0, start - 20)
  return (from > 0 ? "…" : "") + text.slice(from).replace(/\s+/g, " ").trim()
}
