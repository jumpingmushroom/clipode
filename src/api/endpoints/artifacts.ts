// Artifacts: the documents and files agents produced across the company, newest first.
import type { Client } from "../client.ts"
import type { Artifact } from "../model.ts"

/** The most the server returns at once; no company on the instance had more than 61 (2026-11-25). */
export const ARTIFACTS_LIMIT = 100

type WireArtifact = {
  id: string
  source: string
  mediaKind: string
  title: string
  previewText: string | null
  contentType: string | null
  issue: { id: string; identifier: string | null; title: string } | null
  createdByAgent: { id: string } | null
  updatedAt: string
  href: string | null
}

const KINDS = ["document", "image", "text", "video", "file"] as const

export async function listArtifacts(client: Client, companyId: string): Promise<Artifact[]> {
  const body = await client.get<{ artifacts: WireArtifact[] }>(`/api/companies/${encodeURIComponent(companyId)}/artifacts`, { limit: ARTIFACTS_LIMIT })
  return body.artifacts.map((a) => ({
    id: a.id,
    kind: KINDS.find((k) => k === a.mediaKind) ?? "file",
    title: a.title,
    preview: a.previewText,
    contentType: a.contentType,
    // A document's link ends in "#document-<key>"; the row carries no key of its own.
    documentKey: a.source === "document" ? (a.href?.match(/#document-(.+)$/)?.[1] ?? null) : null,
    issue: a.issue,
    agentId: a.createdByAgent?.id ?? null,
    updatedAt: a.updatedAt,
  }))
}
