import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const tokens = { inputTokens: 1_500_000, cachedInputTokens: 12_000_000, outputTokens: 250_000 }
const periods: string[] = []
const routes = (soon: string) => ({
  summary: (url: URL) => (periods.push(url.searchParams.get("period")!), { eventCount: 40, pendingRunCount: 2, pricingComplete: false, spendCents: 1234, budgetCents: 0, utilizationPercent: 0 }),
  "by-agent": [
    { agentId: "a1", agentName: "Quiet", ...tokens, costCents: 34, apiRunCount: 2, subscriptionRunCount: 0 },
    { agentId: "a2", agentName: "Busy", ...tokens, costCents: 1200, apiRunCount: 30, subscriptionRunCount: 8 },
  ],
  "by-provider": [{ provider: "anthropic", model: "opus", billingType: "metered_api", ...tokens, costCents: 1234, apiRunCount: 32, subscriptionRunCount: 8 }],
  "by-project": [{ projectId: null, projectName: null, eventCount: 40, ...tokens, costCents: 1234 }],
  "window-spend": [{ provider: "anthropic", window: "5h", ...tokens, costCents: 100 }],
  "quota-windows": [
    { provider: "anthropic", accountLabel: "Team plan", ok: true, windows: [{ label: "5h", usedPercent: 80, resetsAt: soon, valueLabel: null }] },
    { provider: "openai", ok: false, windows: [], error: "Quota unavailable" },
  ],
})

test("g c shows totals, spend, windows, quotas and breakdowns; a switches to all time", async () => {
  const soon = new Date(Date.now() + 90 * 60_000).toISOString()
  app = await startApp({
    route: { name: "thread", id: THREAD_ID },
    before: (s) => {
      for (const [path, body] of Object.entries(routes(soon))) s.set(`/api/companies/${COMPANY_ID}/costs/${path}`, body)
      s.set(`/api/companies/${COMPANY_ID}/budgets/overview`, { policies: [], activeIncidents: [], pausedAgentCount: 0, pausedProjectCount: 0, pendingApprovalCount: 0 })
    },
  })
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("c")
  let text = await app.frame()
  expect(text.split("\n")[0]).toContain("Costs")
  expect(text).toMatch(/Runs\s+Input\s+Cached\s+Output\s+Cost/)
  expect(text).toMatch(/All agents\s+40\s+1\.5M\s+12\.0M\s+250k\s+\$12\.34/)
  expect(text).toContain("Spend $12.34  (2 runs not priced yet)")
  expect(text).toMatch(/anthropic 5h\s+—\s+1\.5M/)
  expect(text).toMatch(/5h\s+█{16}░{4}\s+80% used\s+resets in 1h/)
  expect(text).toContain("Quota unavailable")
  // Busiest agent first.
  expect(text.indexOf("Busy")).toBeLessThan(text.indexOf("Quiet"))
  app.mockInput.pressKey("a")
  text = await app.frame()
  expect(text).toContain("Costs  all time")
  expect(periods).toEqual(["month", "all"])
})
