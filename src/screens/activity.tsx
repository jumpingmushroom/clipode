// Activity: what agents, people and the system did in the company, newest first. Bookkeeping is hidden until `a`.
import { RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { ActivityEntry } from "../api/model.ts"
import { useCommands } from "../keymap/commands.tsx"
import { useRoute } from "../route.tsx"
import { useCompany, useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { age, dateTime, fit } from "../ui/format.ts"
import { Frame } from "./frame.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

export function ActivityScreen(props: { version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const { session } = useStores()
  const route = useRoute()
  const [all, setAll] = createSignal(false)
  const [selected, setSelected] = createSignal(0)
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    void company.activity.load()
    void company.agents.list.load()
    void company.issues.list.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 30_000)
  onCleanup(() => clearInterval(tick))

  const entries = createMemo(() => company.activity.data.filter((e) => all() || !e.minor))
  const current = () => entries()[Math.min(selected(), entries().length - 1)]
  const actor = (e: ActivityEntry) =>
    e.actor.type === "agent"
      ? (company.agents.byId(e.actor.id)?.name ?? "an agent")
      : e.actor.type === "user"
        ? e.actor.id === session.state.userId
          ? "You"
          : "Board"
        : e.actor.type === "plugin"
          ? "A plugin"
          : "System"
  const subject = (e: ActivityEntry) => {
    if (e.subject) return e.subject
    if (e.target?.kind === "task") {
      const t = company.issues.byId(e.target.id)
      return t ? `${t.identifier ?? ""} ${t.title}`.trim() : ""
    }
    if (e.target?.kind === "agent") return company.agents.byId(e.target.id)?.name ?? ""
    if (e.target?.kind === "run") return company.agents.byId(e.target.agentId)?.name ?? ""
    return ""
  }
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(entries().length - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`activity-row-${next}`)
  }
  const open = () => {
    const t = current()?.target
    if (t?.kind === "task") route.navigate({ name: "thread", id: t.id })
    else if (t?.kind === "agent") route.navigate({ name: "agent", id: t.id })
    else if (t?.kind === "run") route.navigate({ name: "run", id: t.id })
  }

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "return", cmd: open },
    ],
  }))
  useCommands(() => [
    { name: "activity.all", title: all() ? "Hide bookkeeping" : "Show all activity", category: "View", keys: "a", run: () => (setSelected(0), setAll((v) => !v)) },
    { name: "activity.refresh", title: "Refresh", category: "View", keys: "r", run: () => void company.activity.refresh() },
  ])

  return (
    <Frame
      view="Activity"
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={current()}>{(e: () => ActivityEntry) => <ActivitySidebar entry={e()} actor={actor(e())} shown={entries().length} total={company.activity.data.length} />}</Show>}
      hints={[["j/k", "move"], ["enter", "open"], ["a", all() ? "hide bookkeeping" : "show all"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "move"], ["enter", "open"], ["a", "all"]]}
      version={props.version}
    >
      <text fg={theme().text} paddingLeft={2} flexShrink={0}>
        <span style={{ attributes: TextAttributes.BOLD }}>Activity</span>
        <span style={{ fg: theme().muted }}>{`  ${entries().length}${all() ? "" : "  without bookkeeping"}`}</span>
      </text>
      <Show
        when={entries().length}
        fallback={
          <text fg={theme().muted} paddingLeft={2} marginTop={1}>
            {company.activity.status === "ready" ? "Nothing yet" : company.activity.error ?? "Loading…"}
          </text>
        }
      >
        <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} minHeight={0} marginTop={1} scrollbarOptions={{ visible: false }}>
          <For each={entries()}>
            {(e, i) => (
              <box
                id={`activity-row-${i()}`}
                flexDirection="row"
                paddingLeft={2}
                backgroundColor={current() === e ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                onMouseDown={() => setSelected(i())}
                onMouseUp={open}
              >
                <text fg={theme().text} wrapMode="none">
                  <span style={{ fg: theme().muted }}>{fit(age(e.at, now()), 4)}</span>
                  <span style={{ fg: e.actor.type === "agent" ? theme().accent : theme().text }}>{fit(actor(e), 14)}</span>
                  <span style={{ fg: e.minor ? theme().muted : theme().text }}>{e.verb}</span>
                  {" " + subject(e)}
                </text>
              </box>
            )}
          </For>
        </scrollbox>
      </Show>
    </Frame>
  )
}

function ActivitySidebar(props: { entry: ActivityEntry; actor: string; shown: number; total: number }) {
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Entry" />
        <SidebarLine label="By" value={props.actor} />
        <SidebarLine label="When" value={dateTime(props.entry.at)} />
        <SidebarLine label="Action" value={props.entry.action} />
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Shown" count={props.shown} />
        <SidebarLine label="Loaded" value={props.total} />
        <SidebarLine label="Bookkeeping" value={props.total - props.shown} />
      </box>
    </box>
  )
}
