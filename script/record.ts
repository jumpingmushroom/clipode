// Records scrubbed fixtures of the phase 1 read surface for one company, for parser, store and screen tests.
// GET only, apart from sign-in and sign-out. Usage: SMOKE_COMPANY=<issue prefix> bun --env-file=smoke.env run record
// Writes test/fixtures/company/*.json. One scrubber covers every file, so ids stay consistent across them.
import { mkdir, rm, writeFile } from "node:fs/promises"
import type { Agent, AttentionFeed, Company, HeartbeatRun } from "@paperclipai/shared"
import { signedInClient } from "./env.ts"
import { createScrubber } from "./scrub.ts"

const outDir = new URL("../test/fixtures/company/", import.meta.url).pathname
const { scrub, scrubLog } = createScrubber()
const save = async (name: string, data: unknown) => {
  await writeFile(outDir + name, JSON.stringify(data, null, 2) + "\n")
  console.log(`  ${name}`)
}

const client = await signedInClient()
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const companies = await client.get<Company[]>("/api/companies")
const prefix = process.env.SMOKE_COMPANY
const company = prefix ? companies.find((c) => c.issuePrefix === prefix) : companies[0]
if (!company) throw new Error("company not found; set SMOKE_COMPANY to an issue prefix")
const cid = company.id
console.log(`recording company ${company.issuePrefix}`)

await save("companies.json", scrub(companies))
await save("company.json", scrub(company))
await save("agents.json", scrub(await client.get<Agent[]>(`/api/companies/${cid}/agents`)))

const feed = await client.get<AttentionFeed>(`/api/companies/${cid}/attention`, { all: true, includeDismissed: true })
await save("attention-feed.json", scrub(feed))
await save("attention-summary.json", scrub(await client.get(`/api/companies/${cid}/attention/summary`)))

// Follow-ups for opening items: interactions and detail for each task the inbox points at.
const issueIds = new Set<string>()
for (const item of feed.items) {
  const meta = item.subject.metadata as { issueId?: string } | null
  const id = meta?.issueId ?? item.relatedIssue?.id ?? (item.subject.kind === "issue" ? item.subject.id : undefined)
  if (id) issueIds.add(id)
}
const interactions: Record<string, unknown> = {}
const issues: Record<string, unknown> = {}
for (const id of issueIds) {
  interactions[id] = await client.get(`/api/issues/${id}/interactions`)
  issues[id] = await client.get(`/api/issues/${id}`)
}
await save("issue-interactions.json", scrub(interactions))
await save("issue-details.json", scrub(issues))

// Task list (capped so the fixture stays small) and one thread with comments.
const list = await client.get<{ id: string }[]>(`/api/companies/${cid}/issues`, { view: "index" })
// The whole list keeps parents and their sub-tasks together; it is the largest fixture.
await save("issues.json", scrub(list))
const threadId = [...issueIds][0] ?? list[0]?.id
if (threadId) {
  if (!issues[threadId]) await save("thread-issue.json", scrub(await client.get(`/api/issues/${threadId}`)))
  await save("thread-comments.json", scrub(await client.get(`/api/issues/${threadId}/comments`)))
  await save("thread-runs.json", scrub(await client.get(`/api/issues/${threadId}/runs`)))
  await save("thread-cost.json", scrub(await client.get(`/api/issues/${threadId}/cost-summary`)))
}

await save("projects.json", scrub(await client.get(`/api/companies/${cid}/projects`)))
await save("live-runs.json", scrub(await client.get(`/api/companies/${cid}/live-runs`)))

// Runs: the recent list, then one finished run with its events and the start of its log.
const runs = await client.get<HeartbeatRun[]>(`/api/companies/${cid}/heartbeat-runs`, { limit: 20 })
await save("heartbeat-runs.json", scrub(runs))
const run = runs.find((r) => r.status === "succeeded") ?? runs[0]
if (run) {
  await save("run.json", scrub(await client.get(`/api/heartbeat-runs/${run.id}`)))
  await save("run-events.json", scrub(await client.get(`/api/heartbeat-runs/${run.id}/events`, { limit: 100 })))
  const log = await client.get<{ content: string; nextOffset: number | null } & Record<string, unknown>>(
    `/api/heartbeat-runs/${run.id}/log`,
    { limitBytes: 200_000 },
  )
  await save("run-log.json", { ...(scrub({ ...log, content: "" }) as object), content: scrubLog(log.content) })
}
console.log(`written to ${outDir}; review before committing`)
