// Costs and quotas: runs, tokens and spend for the company by agent, model and project, rolling windows, provider
// quotas and budgets. One scrolling report; `a` switches between this month and all time.
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { useTerminalDimensions } from "@opentui/solid"
import { For, onMount, Show, type JSX } from "solid-js"
import { useCommands } from "../keymap/commands.tsx"
import { useCompany } from "../store/context.tsx"
import type { CostReport, Usage } from "../store/costs.ts"
import { useTheme } from "../theme/context.tsx"
import { count, fit, money, until } from "../ui/format.ts"
import { Frame, SIDEBAR_MIN_COLUMNS, SIDEBAR_WIDTH } from "./frame.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

const NUM = 9
const BAR = 20

export function CostsScreen(props: { version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const costs = company.costs
  const dimensions = useTerminalDimensions()
  let scroll: ScrollBoxRenderable | undefined

  // Usage changes with every run, so read it again each time the screen opens.
  onMount(() => void costs.report.refresh())

  const report = () => costs.report.data
  const withCost = () => (report()?.total.cents ?? 0) > 0
  const mainWidth = () => dimensions().width - (dimensions().width >= SIDEBAR_MIN_COLUMNS && props.sidebar ? SIDEBAR_WIDTH : 0) - 4
  const nameWidth = () => Math.max(12, mainWidth() - NUM * (withCost() ? 5 : 4))
  const heading = () => fit("", nameWidth()) + ["Runs", "Input", "Cached", "Output", ...(withCost() ? ["Cost"] : [])].map((h) => fit(h, NUM, "right")).join("")
  const row = (u: Usage) => [u.runs === null ? "—" : String(u.runs), count(u.input), count(u.cached), count(u.output), ...(withCost() ? [money(u.cents)] : [])].map((v) => fit(v, NUM, "right")).join("")

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => scroll?.scrollBy(1) },
      { key: "up,k", cmd: () => scroll?.scrollBy(-1) },
      { key: "pagedown,space", cmd: () => scroll?.scrollBy(10) },
      { key: "pageup", cmd: () => scroll?.scrollBy(-10) },
    ],
  }))
  useCommands(() => [
    { name: "costs.period", title: costs.period() === "month" ? "Show all time" : "Show this month", category: "View", keys: "a", run: () => costs.setPeriod(costs.period() === "month" ? "all" : "month") },
    { name: "costs.refresh", title: "Refresh", category: "View", keys: "r", run: () => void costs.report.refresh() },
  ])

  const Section = (p: { title: string; children: JSX.Element }) => (
    <box flexDirection="column" marginTop={1} paddingLeft={2} flexShrink={0}>
      <text fg={theme().accent} attributes={TextAttributes.BOLD}>
        {p.title}
      </text>
      {p.children}
    </box>
  )
  const Table = (p: { rows: { name: string; usage: Usage }[] }) => (
    <>
      <text fg={theme().muted} wrapMode="none">
        {heading()}
      </text>
      <For each={p.rows}>
        {(r) => (
          <text fg={theme().text} wrapMode="none">
            {fit(r.name, nameWidth() - 1) + " "}
            <span style={{ fg: theme().muted }}>{row(r.usage)}</span>
          </text>
        )}
      </For>
    </>
  )

  return (
    <Frame
      view="Costs"
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={report()}>{(r: () => CostReport) => <CostsSidebar report={r()} />}</Show>}
      hints={[["j/k", "scroll"], ["a", costs.period() === "month" ? "all time" : "this month"], ["r", "refresh"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "scroll"], ["a", "period"], ["r", "refresh"]]}
      version={props.version}
    >
      <text fg={theme().text} paddingLeft={2} flexShrink={0}>
        <span style={{ attributes: TextAttributes.BOLD }}>Costs</span>
        <span style={{ fg: theme().muted }}>{`  ${costs.period() === "month" ? "this month" : "all time"}`}</span>
      </text>
      <Show
        when={report()}
        fallback={
          <text fg={costs.report.error ? theme().error : theme().muted} paddingLeft={2} marginTop={1}>
            {costs.report.error ?? "Loading…"}
          </text>
        }
      >
        {(r: () => CostReport) => (
          <scrollbox ref={(s: ScrollBoxRenderable) => (scroll = s)} flexGrow={1} minHeight={0} scrollbarOptions={{ visible: false }}>
            <Section title="Total">
              <Table rows={[{ name: "All agents", usage: r().total }]} />
              <text fg={theme().muted}>
                {r().total.cents > 0 ? `Spend ${money(r().total.cents)}` : r().total.subscriptionOnly ? "Spend $0.00: every run is billed to a subscription" : "Spend $0.00"}
                {r().total.pricingComplete ? "" : `  (${r().total.pendingRuns} runs not priced yet)`}
              </text>
            </Section>
            <Section title="Rolling windows">
              <Table rows={r().windows.map((w) => ({ name: `${w.provider} ${w.window}`, usage: w }))} />
            </Section>
            <Section title="Quotas">
              <Show when={r().quotas.length} fallback={<text fg={theme().muted}>No provider reports quotas</text>}>
                <For each={r().quotas}>
                  {(q) => (
                    <box flexDirection="column">
                      <text fg={theme().text}>{`${q.provider}${q.account ? ` · ${q.account}` : ""}`}</text>
                      <Show when={!q.error} fallback={<text fg={theme().muted} paddingLeft={2}>{q.error}</text>}>
                        <For each={q.windows}>
                          {(w) => {
                            const used = w.usedPercent ?? 0
                            const filled = Math.round((used / 100) * BAR)
                            return (
                              <text fg={theme().text} paddingLeft={2} wrapMode="none">
                                {fit(w.label, 14)}
                                <span style={{ fg: used >= 90 ? theme().error : used >= 75 ? theme().warning : theme().success }}>{"█".repeat(filled)}</span>
                                <span style={{ fg: theme().muted }}>{"░".repeat(BAR - filled)}</span>
                                {w.usedPercent === null ? `  ${w.value ?? ""}` : `  ${Math.round(used)}% used`}
                                <span style={{ fg: theme().muted }}>{w.resetsAt ? `  resets ${until(w.resetsAt)}` : ""}</span>
                              </text>
                            )
                          }}
                        </For>
                      </Show>
                    </box>
                  )}
                </For>
              </Show>
            </Section>
            <Section title="By agent">
              <Table rows={r().byAgent.map((a) => ({ name: a.name, usage: a }))} />
            </Section>
            <Section title="By model">
              <Table rows={r().byModel.map((m) => ({ name: `${m.model} (${m.provider}, ${m.billing.replace(/_/g, " ")})`, usage: m }))} />
            </Section>
            <Section title="By project">
              <Table rows={r().byProject.map((p) => ({ name: p.name ?? "No project", usage: p }))} />
            </Section>
          </scrollbox>
        )}
      </Show>
    </Frame>
  )
}

function CostsSidebar(props: { report: CostReport }) {
  const t = () => props.report.total
  const b = () => props.report.budgets
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Spend" />
        <SidebarLine label="Spent" value={money(t().cents)} />
        <SidebarLine label="Runs" value={t().runs ?? "—"} />
        <SidebarLine label="Tokens out" value={count(t().output)} />
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Budget" />
        <SidebarLine label="Limit" value={t().budgetCents ? money(t().budgetCents) : "none"} />
        <Show when={t().budgetCents}>
          <SidebarLine label="Used" value={`${Math.round(t().budgetUsedPercent)}%`} />
        </Show>
        <SidebarLine label="Policies" value={b().policies} />
        <SidebarLine label="Incidents" value={b().incidents} />
        <SidebarLine label="Paused agents" value={b().pausedAgents} />
      </box>
    </box>
  )
}
