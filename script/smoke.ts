// Smoke test against a real instance: sign in, list companies, read the attention feed and one heartbeat run
// for the first company (or SMOKE_COMPANY, an issue prefix), print a summary, sign out. GET only, apart from sign-in and sign-out.
// Fixtures are recorded by script/record.ts.
import { signOut } from "../src/api/auth.ts"
import { signedInClient } from "./env.ts"

type Company = { id: string; name: string; issuePrefix?: string; status?: string }
type Feed = { totalCount: number; deskBadgeCount: number; nextCursor: string | null; items: { sourceKind: string; detail?: { kind?: string } }[] }
type Run = { id: string; status: string; agentId: string; invocationSource?: string; createdAt: string; finishedAt?: string | null }

const client = await signedInClient({ fresh: true })
console.log(`signed in to ${client.origin}`)
try {
  const health = await client.get<{ status: string; version?: string; commit?: string; deploymentMode?: string }>("/api/health")
  console.log(`health: ${health.status}, version ${health.version ?? "?"}, commit ${health.commit?.slice(0, 7) ?? "?"}, mode ${health.deploymentMode ?? "?"}`)

  const companies = await client.get<Company[]>("/api/companies")
  console.log(`companies: ${companies.length}`)
  for (const c of companies) console.log(`  ${c.issuePrefix ?? "?"}  ${c.name}`)

  // SMOKE_COMPANY picks a company by issue prefix; the first company may have an empty inbox.
  const wanted = process.env.SMOKE_COMPANY
  const first = wanted ? companies.find((c) => c.issuePrefix === wanted) : companies[0]
  if (!first) throw new Error(wanted ? `no company with prefix ${wanted}` : "no companies visible to this user")
  console.log(`\ncompany: ${first.name}`)

  const feed = await client.get<Feed>(`/api/companies/${first.id}/attention`, { all: true, includeDismissed: true })
  const kinds = new Map<string, number>()
  for (const item of feed.items) {
    const key = `${item.sourceKind}/${item.detail?.kind ?? "-"}`
    kinds.set(key, (kinds.get(key) ?? 0) + 1)
  }
  console.log(`attention: ${feed.items.length} items, totalCount ${feed.totalCount}, deskBadgeCount ${feed.deskBadgeCount}`)
  for (const [k, n] of kinds) console.log(`  ${n} × ${k}`)

  const summary = await client.get<{ totalCount: number }>(`/api/companies/${first.id}/attention/summary`)
  console.log(`attention summary: totalCount ${summary.totalCount}`)

  const runs = await client.get<Run[]>(`/api/companies/${first.id}/heartbeat-runs`, { limit: 1 })
  const latest = runs[0]
  if (!latest) {
    console.log("heartbeat runs: none")
  } else {
    const run = await client.get<Run & Record<string, unknown>>(`/api/heartbeat-runs/${latest.id}`)
    console.log(`latest heartbeat run: ${run.status}, source ${run.invocationSource ?? "?"}, created ${run.createdAt}, finished ${run.finishedAt ?? "-"}`)
    console.log(`  ${Object.keys(run).length} fields: ${Object.keys(run).join(", ")}`)
  }
} finally {
  await signOut(client)
  console.log("\nsigned out")
}
