// One routine: what it asks for, its triggers, and its runs, newest first; enter opens the task a run created.
import { RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { RoutineDetail, RoutineRun } from "../api/model.ts"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import type { Theme } from "../theme/tokens.ts"
import { dateTime, fit, until } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { Frame } from "./frame.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"
import { useRoutineActions } from "./routine-actions.tsx"
import { useTaskRefs } from "./task-refs.tsx"

function runMark(status: string, theme: Theme): [string, RGBA] {
  if (status === "completed") return ["✓", theme.success]
  if (status === "failed") return ["✗", theme.error]
  if (status === "issue_created") return ["◐", theme.accent]
  return ["·", theme.muted]
}

export function RoutineScreen(props: { id: string; version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const links = useTaskRefs()
  const detail = company.routine.detail(props.id)
  const runs = company.routine.runs(props.id)
  const [selected, setSelected] = createSignal(0)
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    // Cached for the session; runs come and go, so read both again on every visit.
    void detail.refresh()
    void runs.refresh()
    void company.agents.list.load()
    void company.issues.projects.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 30_000)
  onCleanup(() => clearInterval(tick))

  const r = () => detail.data
  useRoutineActions(() => r() ?? undefined)
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(runs.data.length - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`routine-run-${next}`)
  }
  const open = () => {
    const taskId = runs.data[selected()]?.taskId
    if (taskId) route.navigate({ name: "thread", id: taskId })
  }
  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "escape,backspace", cmd: () => route.back() },
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "return", cmd: open },
      { key: "r", cmd: () => void Promise.all([detail.refresh(), runs.refresh()]) },
    ],
  }))

  return (
    <Frame
      view={`Routine · ${r()?.title ?? ""}`}
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={r()}>{(d: () => RoutineDetail) => <RoutineDetailSidebar routine={d()} />}</Show>}
      hints={[["esc", "back"], ["j/k", "move"], ["enter", "open task"], ["w", "run now"], ["p", "pause/resume"], ["r", "refresh"], ["ctrl+p", "commands"]]}
      narrowHints={[["esc", "back"], ["enter", "open task"]]}
      version={props.version}
    >
      <Show when={r()} fallback={<text fg={theme().muted} paddingLeft={2}>{detail.status === "error" ? `✗ ${detail.error}` : "loading"}</text>}>
        <scrollbox ref={(s: ScrollBoxRenderable) => (scroll = s)} flexGrow={1} minHeight={0} paddingLeft={2} paddingRight={2} scrollbarOptions={{ visible: false }}>
          <text fg={theme().muted} wrapMode="none">
            ‹ Routines <span style={{ attributes: TextAttributes.DIM }}> / </span>
            {r()!.title}
          </text>
          <text fg={theme().text} attributes={TextAttributes.BOLD} marginTop={1}>
            {r()!.title}
          </text>
          <text fg={theme().muted}>
            <span style={{ fg: r()!.status === "active" ? theme().success : theme().muted }}>●</span>
            {` ${r()!.status} · ${company.agents.byId(r()!.assigneeAgentId)?.name ?? "no agent"}`}
            {r()!.activeTask ? ` · running ${r()!.activeTask!.identifier ?? ""}` : ""}
          </text>
          <Show when={r()!.description}>
            <box marginTop={1}>
              <Markdown content={r()!.description!} links={links} />
            </box>
          </Show>
          <text fg={theme().accent} attributes={TextAttributes.BOLD} marginTop={1}>
            Triggers
          </text>
          <Show when={r()!.triggers.length} fallback={<text fg={theme().muted}>None: it runs only when started by hand (w).</text>}>
            <For each={r()!.triggers}>
              {(t) => (
                <text fg={t.enabled ? theme().text : theme().muted} wrapMode="none">
                  {fit(t.label, 36) + " "}
                  <span style={{ fg: theme().muted }}>
                    {t.enabled ? (r()!.status === "active" && t.nextRunAt ? `next ${until(t.nextRunAt, now())}` : "paused") : "off"}
                    {t.timezone ? `  ${t.timezone}` : ""}
                  </span>
                </text>
              )}
            </For>
          </Show>
          <text fg={theme().accent} attributes={TextAttributes.BOLD} marginTop={1}>
            Runs
          </text>
          <Show when={runs.data.length} fallback={<text fg={theme().muted}>{runs.status === "error" ? `✗ ${runs.error}` : runs.loadedAt ? "No runs yet." : "loading"}</text>}>
            <For each={runs.data}>
              {(run: RoutineRun, i) => {
                const [mark, color] = runMark(run.status, theme())
                return (
                  <box
                    id={`routine-run-${i()}`}
                    flexDirection="row"
                    backgroundColor={selected() === i() ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                    onMouseDown={() => setSelected(i())}
                    onMouseUp={open}
                  >
                    <text fg={theme().text} wrapMode="none">
                      <span style={{ fg: color }}>{mark}</span> {fit(run.status.replace(/_/g, " "), 14)}
                      <span style={{ fg: theme().muted }}>{fit(run.source, 10) + fit(dateTime(run.at), 20)}</span>
                      {fit(run.identifier ?? company.issues.byId(run.taskId)?.identifier ?? "—", 10)}
                      <span style={{ fg: theme().error }}>{run.failure ?? ""}</span>
                    </text>
                  </box>
                )
              }}
            </For>
          </Show>
        </scrollbox>
      </Show>
    </Frame>
  )
}

function RoutineDetailSidebar(props: { routine: RoutineDetail }) {
  const company = useCompany()
  const r = () => props.routine
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Routine" />
        <SidebarLine label="Status" value={r().status} />
        <SidebarLine label="Agent" value={company.agents.byId(r().assigneeAgentId)?.name ?? "—"} />
        <SidebarLine label="Project" value={company.issues.projectName(r().projectId) ?? "none"} />
        <SidebarLine label="If still running" value={r().concurrency.replace(/_/g, " ")} />
        <SidebarLine label="Missed runs" value={r().catchUp.replace(/_/g, " ")} />
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Next run" />
        <SidebarLine label="When" value={r().status === "active" && r().nextRunAt ? dateTime(r().nextRunAt) : "—"} />
      </box>
    </box>
  )
}
