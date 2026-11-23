import { expect, test } from "bun:test"
import type { CompanySearchResult } from "@paperclipai/shared"
import { toResult } from "../../src/api/endpoints/search.ts"

const base = { score: 1, href: "", matchedFields: [], snippet: null, snippets: [], updatedAt: null, previewImageUrl: null, sourceLabel: null }
const issue = { id: "t1", identifier: "DEMO-1", title: "Fix the importer" } as CompanySearchResult["issue"]
const snippet = (field: string, text: string, start: number) => ({ field, label: field, text, highlights: [{ start, end: start + 3 }] })

test("a title match has no excerpt; a comment match has one that starts near the match", () => {
  expect(toResult({ ...base, id: "t1", type: "issue", title: "Fix the importer", issue, sourceLabel: "Title", snippets: [snippet("title", "Fix the importer", 8)] })).toEqual({
    type: "task", id: "t1", title: "Fix the importer", identifier: "DEMO-1", where: "Title", excerpt: null,
  })
  const text = "The first forty characters say nothing;\n then the csv importer line"
  const r = toResult({ ...base, id: "t1", type: "issue", title: "Fix the importer", issue, sourceLabel: "Comment", snippets: [snippet("comment", text, text.indexOf("csv"))] })
  expect(r.excerpt).toBe("…nothing; then the csv importer line")
})

test("an artifact opens its task; agents and projects keep their own id", () => {
  const artifact = { id: "a1", source: "attachment", mediaKind: "file", issueId: "t9", issueIdentifier: "DEMO-9", issueTitle: "Logs", projectId: null, projectName: null, updatedAt: "" } as const
  expect(toResult({ ...base, id: "a1", type: "artifact", title: "log.txt", artifact, sourceLabel: "File" })).toMatchObject({ type: "task", id: "t9", identifier: "DEMO-9", title: "Logs" })
  expect(toResult({ ...base, id: "g1", type: "agent", title: "Builder" })).toMatchObject({ type: "agent", id: "g1", excerpt: null })
  expect(toResult({ ...base, id: "p1", type: "project", title: "Website" })).toMatchObject({ type: "project", id: "p1" })
})
