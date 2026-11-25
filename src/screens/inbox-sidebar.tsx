// Inbox sidebar: counts per kind, agents, tasks in flight and live runs (from the agents, issues and runs stores).
import { TextAttributes, type RGBA } from "@opentui/core"
import { For, Show, type JSX } from "solid-js"
import type { InboxItem } from "../store/attention.ts"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { elapsed, fit } from "../ui/format.ts"
import { Spinner } from "../ui/spinner.tsx"
import { KIND_LABELS, MARKERS, markerColor } from "./inbox-row.tsx"

const INNER = 28

export function SidebarHeader(props: { title: string; count?: number | string }) {
  const { theme } = useTheme()
  return (
    <text fg={theme().text} wrapMode="none">
      <span style={{ attributes: TextAttributes.BOLD }}>{fit(props.title, INNER - 4)}</span>
      <span style={{ fg: theme().muted }}>{fit(props.count === undefined ? "" : String(props.count), 4, "right")}</span>
    </text>
  )
}

export function SidebarLine(props: { marker?: JSX.Element; label: string; value?: string | number; labelColor?: RGBA }) {
  const { theme } = useTheme()
  const width = () => (props.marker ? INNER - 2 : INNER)
  const value = () => (props.value === undefined ? "" : String(props.value))
  // The value column widens for long values such as a model name, leaving the label at least 6 columns.
  const valueWidth = () => Math.min(width() - 6, Math.max(8, value().length + 1))
  return (
    <text fg={theme().muted} wrapMode="none">
      <Show when={props.marker}>{props.marker} </Show>
      <span style={{ fg: props.labelColor ?? theme().muted }}>{fit(props.label, width() - valueWidth())}</span>
      {fit(value(), valueWidth(), "right")}
    </text>
  )
}

export function InboxSidebar(props: { items: InboxItem[]; now: number }) {
  const { theme } = useTheme()
  const company = useCompany()
  const active = () => props.items.filter((i) => !i.snoozed)
  const kinds = () => {
    const shown: InboxItem["kind"][] = ["question", "confirmation", "approval", "failed_run", "blocked"]
    // Reviews and other kinds are listed only when present, so the mockup's five rows stay the default.
    for (const extra of ["review", "decision", "agent_error", "recovery", "other"] as const) if (active().some((i) => i.kind === extra)) shown.push(extra)
    return shown
  }
  const agents = () => company.agents.active()
  const waiting = () => new Set(active().map((i) => i.agentId ?? i.agentName).filter(Boolean)).size
  const tasks = () => company.issues.inFlight()
  const runs = () => company.runs.live.data

  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Needs you" count={active().length} />
        <For each={kinds()}>
          {(kind) => (
            <SidebarLine
              marker={<span style={{ fg: markerColor(kind, theme()) }}>{MARKERS[kind]}</span>}
              label={KIND_LABELS[kind][1]}
              value={active().filter((i) => i.kind === kind).length}
            />
          )}
        </For>
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Agents" count={agents().length} />
        <SidebarLine marker={<span style={{ fg: theme().success }}>●</span>} label="Running" value={agents().filter((a) => a.status === "running").length} />
        <SidebarLine marker={<span style={{ fg: theme().warning }}>●</span>} label="Waiting on you" value={waiting()} />
        <SidebarLine marker={<span style={{ fg: theme().error }}>●</span>} label="Error" value={agents().filter((a) => a.status === "error").length} />
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Tasks in flight" count={tasks().length} />
        <SidebarLine label="In progress" value={tasks().filter((t) => t.status === "in_progress").length} />
        <SidebarLine label="In review" value={tasks().filter((t) => t.status === "in_review").length} />
        <SidebarLine label="Blocked" value={tasks().filter((t) => t.status === "blocked").length} />
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Live runs" count={runs().length} />
        <For each={runs()}>
          {(run) => (
            <box flexDirection="row">
              <Spinner color={theme().accent} />
              <text fg={theme().muted} wrapMode="none">
                {" " + fit(run.agentName, 9) + fit(company.issues.byId(run.issueId)?.identifier ?? "", 9)}
                {fit(elapsed(run.startedAt ?? run.createdAt, props.now), INNER - 20, "right")}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
