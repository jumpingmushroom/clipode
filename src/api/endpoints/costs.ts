// Costs and quotas: spend and tokens by agent, model and project, rolling windows, provider quotas and budgets.
import type { BudgetOverview, CostByAgent, CostByProject, CostByProviderModel, CostSummary, CostWindowSpendRow, ProviderQuotaResult } from "@paperclipai/shared"
import type { Client } from "../client.ts"
import type { CostReport, Usage } from "../model.ts"

export type CostPeriod = "month" | "all"

type Row = { apiRunCount?: number; subscriptionRunCount?: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; costCents: number }
const busiest = (a: Usage, b: Usage) => (b.runs ?? 0) - (a.runs ?? 0)
const runsOf = (r: Row) => (r.apiRunCount ?? 0) + (r.subscriptionRunCount ?? 0)
const usage = (r: Row, runs: number | null = r.subscriptionRunCount === undefined ? null : runsOf(r)): Usage => ({ runs, input: r.inputTokens, cached: r.cachedInputTokens, output: r.outputTokens, cents: r.costCents })

/** One report from seven reads. Quotas ask the provider through the server, so a failure there leaves them empty. */
export async function getCostReport(client: Client, companyId: string, period: CostPeriod): Promise<CostReport> {
  const base = `/api/companies/${encodeURIComponent(companyId)}`
  const q = { period }
  const [summary, byAgent, byModel, byProject, windows, quotas, budgets] = await Promise.all([
    client.get<CostSummary>(`${base}/costs/summary`, q),
    client.get<CostByAgent[]>(`${base}/costs/by-agent`, q),
    client.get<CostByProviderModel[]>(`${base}/costs/by-provider`, q),
    client.get<CostByProject[]>(`${base}/costs/by-project`, q),
    client.get<CostWindowSpendRow[]>(`${base}/costs/window-spend`),
    client.get<ProviderQuotaResult[]>(`${base}/costs/quota-windows`).catch(() => []),
    client.get<BudgetOverview>(`${base}/budgets/overview`),
  ])
  const sum = (key: "inputTokens" | "cachedInputTokens" | "outputTokens") => byModel.reduce((n, r) => n + r[key], 0)
  // Only the agent and model rows count runs; the summary and project rows count ledger events, which can differ.
  return {
    total: {
      runs: byModel.reduce((n, r) => n + runsOf(r), 0),
      input: sum("inputTokens"),
      cached: sum("cachedInputTokens"),
      output: sum("outputTokens"),
      cents: summary.spendCents,
      budgetCents: summary.budgetCents,
      budgetUsedPercent: summary.utilizationPercent,
      pendingRuns: summary.pendingRunCount,
      pricingComplete: summary.pricingComplete,
      subscriptionOnly: byModel.length > 0 && byModel.every((r) => r.billingType.startsWith("subscription")),
    },
    byAgent: byAgent.map((r) => ({ ...usage(r), agentId: r.agentId, name: r.agentName ?? "—" })).sort(busiest),
    byModel: byModel.map((r) => ({ ...usage(r), provider: r.provider, model: r.model, billing: r.billingType })),
    // shortcut: projects report ledger events, not runs; shown as runs until the server counts runs per project.
    byProject: byProject.map((r) => ({ ...usage(r, r.eventCount), projectId: r.projectId, name: r.projectName })).sort(busiest),
    windows: windows.map((r) => ({ ...usage(r), provider: r.provider, window: r.window })),
    quotas: quotas.map((r) => ({
      provider: r.provider,
      account: r.accountLabel ?? null,
      error: r.ok ? null : (r.error ?? "unavailable"),
      windows: r.windows.map((w) => ({ label: w.label, usedPercent: w.usedPercent, resetsAt: w.resetsAt, value: w.valueLabel })),
    })),
    budgets: { policies: budgets.policies.length, incidents: budgets.activeIncidents.length, pausedAgents: budgets.pausedAgentCount, pausedProjects: budgets.pausedProjectCount },
  }
}
