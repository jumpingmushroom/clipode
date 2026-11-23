// One agent: what it is doing now and its recent runs; enter opens a run's transcript.
import { RGBA, TextAttributes } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { LIVE_STATUSES } from "../store/runs.ts"
import { useTheme } from "../theme/context.tsx"
import { dateTime, fit } from "../ui/format.ts"
import { Spinner } from "../ui/spinner.tsx"
import { useAgentNow, stateColor } from "./agents.tsx"
import { Frame } from "./frame.tsx"
import { runDuration } from "./thread.tsx"
import { useAgentActions } from "./agent-actions.tsx"

export function AgentScreen(props: { id: string; version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const nowOf = useAgentNow()
  const runs = company.agents.runs(props.id)
  const [selected, setSelected] = createSignal(0)
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    void company.agents.list.load()
    void company.issues.list.load()
    void runs.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(tick))

  const agent = () => company.agents.byId(props.id)
  useAgentActions(agent)
  const move = (d: number) => setSelected((s) => Math.max(0, Math.min(runs.data.length - 1, s + d)))
  const open = () => {
    const run = runs.data[selected()]
    if (run) route.navigate({ name: "run", id: run.id })
  }
  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "escape,backspace", cmd: () => route.back() },
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "return", cmd: open },
      { key: "r", cmd: () => void runs.refresh() },
    ],
  }))

  return (
    <Frame
      view={`Agent · ${agent()?.name ?? ""}`}
      badge={company.attention.badge()}
      hints={[["esc", "back"], ["j/k", "move"], ["enter", "open run"], ["w", "wake"], ["p", "pause/resume"], ["ctrl+p", "commands"]]}
      narrowHints={[["esc", "back"], ["enter", "open run"]]}
      version={props.version}
    >
      <Show when={agent()}>
        {(() => {
          const state = () => nowOf(agent()!, now())
          return (
            <box flexDirection="column" paddingLeft={2} paddingRight={2}>
              <text fg={theme().text}>
                <span style={{ attributes: TextAttributes.BOLD }}>{agent()!.name}</span>
                <span style={{ fg: theme().muted }}>{`  ${agent()!.title ?? agent()!.role} · ${agent()!.model ?? agent()!.adapterType}`}</span>
              </text>
              <text fg={theme().muted}>
                <span style={{ fg: stateColor(state().state, theme()) }}>●</span> {state().line}
                {state().detail ? `  ${state().detail}` : ""}
              </text>
              <text fg={theme().text} attributes={TextAttributes.BOLD} marginTop={1}>
                Recent runs
              </text>
            </box>
          )
        })()}
      </Show>
      <Show when={runs.loadedAt} fallback={<text fg={theme().muted} paddingLeft={2}>{runs.status === "error" ? `✗ ${runs.error}` : "loading"}</text>}>
        <Show when={runs.data.length} fallback={<text fg={theme().muted} paddingLeft={2}>No runs yet.</text>}>
          <scrollbox flexGrow={1} scrollbarOptions={{ visible: false }}>
            <For each={runs.data}>
              {(run, i) => (
                <box
                  flexDirection="row"
                  paddingLeft={2}
                  backgroundColor={selected() === i() ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                  onMouseDown={() => setSelected(i())}
                  onMouseUp={open}
                >
                  <box width={2} flexShrink={0}>
                    <Show
                      when={LIVE_STATUSES.includes(run.status)}
                      fallback={<text fg={run.status === "succeeded" ? theme().success : theme().error}>{run.status === "succeeded" ? "✓" : "✗"}</text>}
                    >
                      <Spinner color={theme().accent} />
                    </Show>
                  </box>
                  <text fg={theme().text} wrapMode="none">
                    {fit(run.id.slice(0, 8), 10)}
                    <span style={{ fg: theme().muted }}>{fit(company.issues.byId(run.issueId)?.identifier ?? "—", 10)}</span>
                    {fit(run.status.replace(/_/g, " "), 12)}
                    <span style={{ fg: theme().muted }}>
                      {fit(runDuration(run, now()), 10) + fit(run.costUsd !== null ? `$${run.costUsd.toFixed(2)}` : "", 8) + dateTime(run.startedAt ?? run.createdAt)}
                    </span>
                  </text>
                </box>
              )}
            </For>
          </scrollbox>
        </Show>
      </Show>
    </Frame>
  )
}
