// Agent commentary: complaints and suggestions agents file from their runs, newest first.
import type { Client } from "../client.ts"
import type { CommentaryEntry } from "../model.ts"

const id = encodeURIComponent
/** The most the server returns at once. */
export const COMMENTARY_LIMIT = 100

type WireEntry = {
  id: string
  kind: string
  preview: string
  createdAt: string
  agent: { id: string; name: string }
  runId: string
  task: { id: string; identifier: string | null; title: string } | null
}

export async function listCommentary(client: Client, companyId: string): Promise<CommentaryEntry[]> {
  const page = await client.get<{ items: WireEntry[] }>(`/api/companies/${id(companyId)}/agent-commentary`, { limit: COMMENTARY_LIMIT })
  return page.items.map((e) => ({ id: e.id, kind: e.kind, preview: e.preview, at: e.createdAt, agentId: e.agent.id, agentName: e.agent.name, runId: e.runId, task: e.task }))
}

/** The whole text of one entry, as Markdown. */
export async function getCommentaryBody(client: Client, companyId: string, entryId: string): Promise<string> {
  return (await client.get<{ body: string }>(`/api/companies/${id(companyId)}/agent-commentary/${id(entryId)}`)).body
}
