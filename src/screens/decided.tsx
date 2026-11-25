// Decided: questions, confirmations, decisions and approvals that have been resolved, newest first, with their results.
import { RGBA, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { DecidedEntry, InboxItem } from "../api/model.ts"
import { useCommands } from "../keymap/commands.tsx"
import { useRoute } from "../route.tsx"
import { useCompany, useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import type { Theme } from "../theme/tokens.ts"
import { useToast } from "../ui/toast.tsx"
import { age, dateTime, fit } from "../ui/format.ts"
import { Frame } from "./frame.tsx"
import { MARKERS, markerColor } from "./inbox-row.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

/** The inbox kind whose marker an entry shares. */
const MARKER_KIND: Record<DecidedEntry["kind"], InboxItem["kind"]> = { approval: "approval", interaction: "question", decision: "decision", other: "other" }
const KIND_NAMES: Record<DecidedEntry["kind"], string> = { approval: "Approval", interaction: "Question or confirmation", decision: "Decision", other: "Other" }

function resultColor(outcome: string, theme: Theme): RGBA {
  if (["approved", "accepted", "answered", "decided"].includes(outcome)) return theme.success
  if (["rejected", "revision_requested"].includes(outcome)) return theme.error
  return theme.muted
}

export function DecidedScreen(props: { version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const { session } = useStores()
  const route = useRoute()
  const toast = useToast()
  const [selected, setSelected] = createSignal(0)
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    void company.decided.load()
    void company.agents.list.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 30_000)
  onCleanup(() => clearInterval(tick))

  const entries = () => company.decided.data
  const current = () => entries()[Math.min(selected(), entries().length - 1)]
  const by = (e: DecidedEntry) =>
    !e.by ? "—" : e.by.type === "agent" ? (company.agents.byId(e.by.id)?.name ?? "an agent") : e.by.id === session.state.userId ? "You" : "Board"
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(entries().length - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`decided-row-${next}`)
  }
  const open = async () => {
    const e = current()
    if (!e) return
    const issueId = e.issueId ?? (e.kind === "approval" ? await company.approvalTask(e.id).catch(() => null) : null)
    if (issueId) route.navigate({ name: "thread", id: issueId })
    else toast.show("Not linked to a task", "info")
  }

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "pagedown", cmd: () => move(10) },
      { key: "pageup", cmd: () => move(-10) },
      { key: "return", cmd: () => void open() },
    ],
  }))
  useCommands(() => [{ name: "decided.refresh", title: "Refresh", category: "View", keys: "r", run: () => void company.decided.refresh() }])

  return (
    <Frame
      view="Decided"
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={current()}>{(e: () => DecidedEntry) => <DecidedSidebar entry={e()} by={by(e())} />}</Show>}
      hints={[["j/k", "move"], ["enter", "open task"], ["r", "refresh"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "move"], ["enter", "open"]]}
      version={props.version}
    >
      <Show
        when={entries().length}
        fallback={
          <text fg={theme().muted} paddingLeft={2}>
            {company.decided.status === "ready" ? "Nothing decided yet" : (company.decided.error ?? "Loading…")}
          </text>
        }
      >
        <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} minHeight={0} scrollbarOptions={{ visible: false }}>
          <For each={entries()}>
            {(e, i) => (
              <box
                id={`decided-row-${i()}`}
                flexDirection="row"
                paddingLeft={2}
                backgroundColor={current() === e ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                onMouseDown={() => setSelected(i())}
                onMouseUp={() => void open()}
              >
                <text fg={theme().text} wrapMode="none">
                  <span style={{ fg: theme().muted }}>{fit(age(e.at, now()), 4)}</span>
                  <span style={{ fg: markerColor(MARKER_KIND[e.kind], theme()) }}>{MARKERS[MARKER_KIND[e.kind]]}</span>
                  {" "}
                  <span style={{ fg: resultColor(e.outcome, theme()) }}>{fit(e.result, 18)}</span>
                  <span style={{ fg: theme().muted }}>{fit(e.identifier ?? "", 9)}</span>
                  {e.title}
                </text>
              </box>
            )}
          </For>
        </scrollbox>
      </Show>
    </Frame>
  )
}

function DecidedSidebar(props: { entry: DecidedEntry; by: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title={KIND_NAMES[props.entry.kind]} />
        <SidebarLine label="Result" value={props.entry.result} />
        <SidebarLine label="By" value={props.by} />
        <SidebarLine label="When" value={dateTime(props.entry.at)} />
        <Show when={props.entry.identifier}>
          <SidebarLine label="Task" value={props.entry.identifier!} />
        </Show>
      </box>
      <Show when={props.entry.note}>
        <box flexDirection="column">
          <SidebarHeader title="Note" />
          <text fg={theme().text}>{props.entry.note}</text>
        </box>
      </Show>
    </box>
  )
}
