// Routines: scheduled work, with when each runs next and how its last run went. The sidebar shows the selected one.
import { RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { useTerminalDimensions } from "@opentui/solid"
import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { RoutineSummary } from "../api/model.ts"
import { useCommands } from "../keymap/commands.tsx"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { age, dateTime, fit, until } from "../ui/format.ts"
import { Frame, SIDEBAR_MIN_COLUMNS, SIDEBAR_WIDTH } from "./frame.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

const schedule = (r: RoutineSummary) => (r.schedule ?? "no trigger") + (r.moreTriggers ? ` +${r.moreTriggers}` : "")
/** The task to open: the one a run is working on, else the last run's. */
const taskOf = (r: RoutineSummary) => r.activeTask?.id ?? r.lastRun?.taskId ?? null

export function RoutinesScreen(props: { version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const [selected, setSelected] = createSignal(0)
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    void company.routines.load()
    void company.agents.list.load()
    void company.issues.projects.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 30_000)
  onCleanup(() => clearInterval(tick))

  // Agent, schedule, next and last run are fixed; the title takes the rest.
  const AGENT = 13, SCHEDULE = 24, NEXT = 8, LAST = 14
  const mainWidth = () => dimensions().width - (dimensions().width >= SIDEBAR_MIN_COLUMNS && props.sidebar ? SIDEBAR_WIDTH : 0) - 4
  const titleWidth = () => Math.max(12, mainWidth() - AGENT - SCHEDULE - NEXT - LAST - 2)
  const routines = () => company.routines.data
  const current = () => routines()[Math.min(selected(), routines().length - 1)]
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(routines().length - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`routine-row-${next}`)
  }
  const open = () => {
    const id = current() && taskOf(current()!)
    if (id) route.navigate({ name: "thread", id })
  }

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "return", cmd: open },
    ],
  }))
  useCommands(() => [{ name: "routines.refresh", title: "Refresh", category: "View", keys: "r", run: () => void company.routines.refresh() }])

  return (
    <Frame
      view="Routines"
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={current()}>{(r: () => RoutineSummary) => <RoutineSidebar routine={r()} now={now()} />}</Show>}
      hints={[["j/k", "move"], ["enter", "open last task"], ["r", "refresh"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "move"], ["enter", "open"], ["^p", "cmds"]]}
      version={props.version}
    >
      <text fg={theme().text} paddingLeft={2} flexShrink={0}>
        <span style={{ attributes: TextAttributes.BOLD }}>Routines</span>
        <span style={{ fg: theme().muted }}>{`  ${routines().length}`}</span>
      </text>
      <Show
        when={routines().length}
        fallback={
          <text fg={theme().muted} paddingLeft={2} marginTop={1}>
            {company.routines.status === "ready" ? "No routines in this company" : company.routines.error ?? "Loading…"}
          </text>
        }
      >
        <text fg={theme().muted} paddingLeft={4} marginTop={1} wrapMode="none" flexShrink={0}>
          {fit("Routine", titleWidth()) + fit("Agent", AGENT) + fit("Schedule", SCHEDULE) + fit("Next", NEXT) + "Last run"}
        </text>
        <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} minHeight={0} scrollbarOptions={{ visible: false }}>
          <For each={routines()}>
            {(r, i) => (
              <box
                id={`routine-row-${i()}`}
                flexDirection="row"
                paddingLeft={2}
                backgroundColor={current() === r ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                onMouseDown={() => setSelected(i())}
                onMouseUp={open}
              >
                <text fg={theme().text} wrapMode="none">
                  <span style={{ fg: r.status === "active" ? theme().success : theme().muted }}>{"● "}</span>
                  {fit(r.title, titleWidth() - 1) + " "}
                  {fit(company.agents.byId(r.assigneeAgentId)?.name ?? "—", AGENT - 1) + " "}
                  <span style={{ fg: theme().muted }}>{fit(schedule(r), SCHEDULE - 1) + " "}</span>
                  {fit(r.status === "active" ? until(r.nextRunAt, now()) : "paused", NEXT)}
                  <span style={{ fg: r.lastRun?.status === "failed" ? theme().error : theme().muted }}>
                    {r.activeTask ? `running ${r.activeTask.identifier ?? ""}` : r.lastRun ? `${r.lastRun.status} ${age(r.lastRun.at, now())}` : "never"}
                  </span>
                </text>
              </box>
            )}
          </For>
        </scrollbox>
      </Show>
    </Frame>
  )
}

function RoutineSidebar(props: { routine: RoutineSummary; now: number }) {
  const company = useCompany()
  const r = () => props.routine
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title={r().title} />
        <SidebarLine label="Status" value={r().status} />
        <SidebarLine label="Agent" value={company.agents.byId(r().assigneeAgentId)?.name ?? "—"} />
        <SidebarLine label="Project" value={company.issues.projectName(r().projectId) ?? "none"} />
        <SidebarLine label="If still running" value={r().concurrency.replace(/_/g, " ")} />
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Schedule" />
        <SidebarLine label="When" value={schedule(r())} />
        <SidebarLine label="Time zone" value={r().timezone ?? "—"} />
        <SidebarLine label="Next run" value={r().nextRunAt ? dateTime(r().nextRunAt) : "—"} />
      </box>
      <Show when={r().lastRun}>
        <box flexDirection="column">
          <SidebarHeader title="Last run" />
          <SidebarLine label="Started" value={dateTime(r().lastRun!.at)} />
          <SidebarLine label="Result" value={r().lastRun!.status} />
          <SidebarLine label="Task" value={r().lastRun!.identifier ?? "—"} />
        </box>
      </Show>
    </box>
  )
}
