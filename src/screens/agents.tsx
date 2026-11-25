// The team: status, role, model and what each agent is doing now. The sidebar shows the selected agent.
import { RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useCommands } from "../keymap/commands.tsx"
import { useRoute } from "../route.tsx"
import type { AgentSummary } from "../store/agents.ts"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import type { Theme } from "../theme/tokens.ts"
import { elapsed, fit } from "../ui/format.ts"
import { Spinner } from "../ui/spinner.tsx"
import { Frame } from "./frame.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"
import { useAgentActions } from "./agent-actions.tsx"

/** What an agent is doing now, from live runs and the inbox. */
export function useAgentNow() {
  const company = useCompany()
  return (agent: AgentSummary, now: number) => {
    const run = company.runs.live.data.find((r) => r.agentId === agent.id)
    if (run) {
      const task = company.issues.byId(run.issueId)
      return { state: "running" as const, line: `running · ${elapsed(run.startedAt ?? run.createdAt, now)}`, detail: task ? `${task.identifier ?? ""} ${task.title}` : "", run, task }
    }
    const waiting = company.attention.items().filter((i) => !i.snoozed && (i.agentId === agent.id || i.agentName === agent.name))
    if (waiting.length) {
      const first = waiting[0]!
      return { state: "waiting" as const, line: "waiting on you", detail: `${first.title}${first.identifier ? ` · ${first.identifier}` : ""}`, run: undefined, task: undefined }
    }
    return { state: agent.status === "error" ? ("error" as const) : ("idle" as const), line: agent.status.replace(/_/g, " "), detail: "", run: undefined, task: undefined }
  }
}

export function stateColor(state: string, theme: Theme): RGBA {
  return state === "running" ? theme.success : state === "waiting" ? theme.warning : state === "error" ? theme.error : theme.muted
}

export function AgentsScreen(props: { version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const nowOf = useAgentNow()
  const [selected, setSelected] = createSignal(0)
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    void company.agents.list.load()
    void company.runs.live.load()
    void company.issues.list.load()
    void company.attention.feed.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(tick))

  const agents = createMemo(() => company.agents.active())
  const current = () => agents()[Math.min(selected(), agents().length - 1)]
  useAgentActions(current)
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(agents().length - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`agent-row-${next}`)
  }
  const open = () => current() && route.navigate({ name: "agent", id: current()!.id })

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "return", cmd: open },
    ],
  }))
  useCommands(() => [{ name: "agents.refresh", title: "Refresh", category: "View", keys: "r", run: () => void company.agents.list.refresh() }])

  return (
    <Frame
      view="Agents"
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={current()}>{(a: () => AgentSummary) => <AgentSidebar agent={a()} now={now()} />}</Show>}
      hints={[["j/k", "move"], ["enter", "open"], ["w", "wake"], ["p", "pause/resume"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "move"], ["enter", "open"], ["^p", "cmds"]]}
      version={props.version}
    >
      <text fg={theme().text} paddingLeft={2} flexShrink={0}>
        <span style={{ attributes: TextAttributes.BOLD }}>Agents</span>
        <span style={{ fg: theme().muted }}>{`  ${agents().length}`}</span>
      </text>
      <text fg={theme().muted} paddingLeft={4} marginTop={1} wrapMode="none" flexShrink={0}>
        {fit("Name", 10) + fit("Role", 20) + fit("Model", 22) + "Now"}
      </text>
      <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} minHeight={0} scrollbarOptions={{ visible: false }}>
        <For each={agents()}>
          {(agent, i) => {
            const state = () => nowOf(agent, now())
            return (
              <box
                id={`agent-row-${i()}`}
                flexDirection="column"
                paddingLeft={2}
                paddingBottom={1}
                backgroundColor={current() === agent ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                onMouseDown={() => setSelected(i())}
                onMouseUp={open}
              >
                <box flexDirection="row">
                  <box width={2} flexShrink={0}>
                    <Show when={state().state === "running"} fallback={<text fg={stateColor(state().state, theme())}>●</text>}>
                      <Spinner color={theme().accent} />
                    </Show>
                  </box>
                  <text fg={theme().text} wrapMode="none">
                    {fit(agent.name, 10)}
                    {fit(agent.title ?? agent.role, 20)}
                    <span style={{ fg: theme().muted }}>{fit(agent.model ?? agent.adapterType, 22)}</span>
                    {state().line}
                  </text>
                </box>
                <Show when={state().detail}>
                  <text fg={theme().muted} paddingLeft={54} wrapMode="none">
                    {state().detail}
                  </text>
                </Show>
              </box>
            )
          }}
        </For>
      </scrollbox>
    </Frame>
  )
}

function AgentSidebar(props: { agent: AgentSummary; now: number }) {
  const { theme } = useTheme()
  const company = useCompany()
  const nowOf = useAgentNow()
  const state = () => nowOf(props.agent, props.now)
  const agents = () => company.agents.active()
  const count = (s: string) => agents().filter((a) => nowOf(a, props.now).state === s).length
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title={props.agent.name} />
        <SidebarLine label="Role" value={props.agent.title ?? props.agent.role} />
        <SidebarLine label="Reports to" value={company.agents.byId(props.agent.reportsTo)?.name ?? "—"} />
        <SidebarLine label="Model" value={props.agent.model ?? props.agent.adapterType} />
        <SidebarLine marker={<span style={{ fg: stateColor(state().state, theme()) }}>●</span>} label="Status" value={props.agent.status.replace(/_/g, " ")} />
      </box>
      <Show when={state().run}>
        <box flexDirection="column">
          <SidebarHeader title="Now" />
          <text fg={theme().text}>{state().task?.identifier ?? ""}</text>
          <text fg={theme().muted}>{state().task?.title ?? ""}</text>
          <SidebarLine label={`Run ${state().run!.id.slice(0, 4)}`} value={elapsed(state().run!.startedAt ?? state().run!.createdAt, props.now)} />
        </box>
      </Show>
      <box flexDirection="column">
        <SidebarHeader title="Team" count={agents().length} />
        <SidebarLine marker={<span style={{ fg: theme().success }}>●</span>} label="Running" value={count("running")} />
        <SidebarLine marker={<span style={{ fg: theme().warning }}>●</span>} label="Waiting on you" value={count("waiting")} />
        <SidebarLine marker={<span style={{ fg: theme().error }}>●</span>} label="Error" value={count("error")} />
      </box>
    </box>
  )
}
