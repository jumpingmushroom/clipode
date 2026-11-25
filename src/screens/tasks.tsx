// Tasks grouped by status, with a filter line, priority markers, live-run spinners and sub-task progress.
import { RGBA, TextAttributes, type InputRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings, useKeymap } from "@opentui/keymap/solid"
import { createMemo, createSignal, For, Index, onCleanup, onMount, Show } from "solid-js"
import { useCommands } from "../keymap/commands.tsx"
import { setMode } from "../keymap/provider.tsx"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import type { MineTask, TaskSummary } from "../store/issues.ts"
import { matchesFilter, parseFilter } from "../store/task-filter.ts"
import { useTheme } from "../theme/context.tsx"
import type { Theme } from "../theme/tokens.ts"
import { fit, elapsed } from "../ui/format.ts"
import { Spinner } from "../ui/spinner.tsx"
import { Frame, useMainWidth } from "./frame.tsx"
import { useTaskActions } from "./task-actions.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

export const STATUS_GROUPS: { status: string; title: string }[] = [
  { status: "in_progress", title: "In progress" },
  { status: "todo", title: "Todo" },
  { status: "blocked", title: "Blocked" },
  { status: "in_review", title: "In review" },
  { status: "backlog", title: "Backlog" },
  { status: "done", title: "Done" },
  { status: "cancelled", title: "Cancelled" },
]
/** Done and cancelled show this many rows until expanded. */
const COLLAPSED = 3

export const PRIORITY: Record<string, { mark: string; label: string }> = {
  critical: { mark: "!", label: "urgent" },
  high: { mark: "↑", label: "high" },
  medium: { mark: "·", label: "medium" },
  low: { mark: "↓", label: "low" },
}

export function priorityColor(priority: string, theme: Theme): RGBA {
  return priority === "critical" ? theme.error : priority === "high" ? theme.warning : theme.muted
}

type Row = { type: "task"; task: TaskSummary } | { type: "more"; status: string; count: number }

/**
 * With a projectId, only that project's tasks; the frame names the project. With mine, the tasks you have touched,
 * unread first, as in the web UI's Mine inbox.
 */
export function TasksScreen(props: { version: string; sidebar: boolean; filter?: string; projectId?: string; mine?: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const keymap = useKeymap()
  const issues = company.issues
  const source = () => (props.mine ? issues.mine : issues.list)
  const [query, setQuery] = createSignal(props.filter ?? "")
  const [filtering, setFiltering] = createSignal(false)
  const [expanded, setExpanded] = createSignal<string[]>([])
  const [selected, setSelected] = createSignal(0)
  const [now, setNow] = createSignal(Date.now())
  let input: InputRenderable | undefined
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    void issues.list.load()
    if (props.mine) void issues.mine.refresh()
    void issues.projects.load()
    void company.agents.list.load()
    void company.runs.live.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => {
    clearInterval(tick)
    setMode(keymap, "base")
  })

  const assignee = (t: TaskSummary) => company.agents.byId(t.assigneeAgentId)?.name ?? (t.assigneeUserId ? "you" : undefined)
  const filter = createMemo(() => parseFilter(query()))
  const shown = createMemo(() => source().data.filter((t) => (!props.projectId || t.projectId === props.projectId) && matchesFilter(t, filter(), { assignee, project: (t) => issues.projectName(t.projectId) })))
  const liveTasks = createMemo(() => new Set(company.runs.live.data.map((r) => r.issueId).filter(Boolean)))
  const unread = (t: TaskSummary) => "unread" in t && !!t.unread
  const groups = createMemo(() => {
    if (props.mine) {
      const recent = [...shown()].sort((a, b) => ((b as MineTask).lastActivityAt ?? "").localeCompare((a as MineTask).lastActivityAt ?? ""))
      return [
        { status: "unread", title: "Unread", all: recent.filter(unread) },
        { status: "read", title: "Recent", all: recent.filter((t) => !unread(t)) },
      ].map((g) => ({ ...g, visible: g.all })).filter((g) => g.all.length > 0)
    }
    return STATUS_GROUPS.map((g) => {
      const all = shown().filter((t) => t.status === g.status)
      const collapsible = (g.status === "done" || g.status === "cancelled") && !expanded().includes(g.status)
      return { ...g, all, visible: collapsible ? all.slice(0, COLLAPSED) : all }
    }).filter((g) => g.all.length > 0)
  })
  const rows = createMemo<Row[]>(() =>
    groups().flatMap((g): Row[] => [
      ...g.visible.map((task): Row => ({ type: "task", task })),
      ...(g.all.length > g.visible.length ? [{ type: "more" as const, status: g.status, count: g.all.length - g.visible.length }] : []),
    ]),
  )
  const current = () => rows()[Math.min(selected(), rows().length - 1)]
  useTaskActions(() => {
    const row = current()
    return row?.type === "task" ? row.task : undefined
  })

  const mainWidth = useMainWidth(() => props.sidebar, 2)
  const idWidth = createMemo(() => Math.max(7, ...issues.list.data.map((t) => (t.identifier ?? "").length)))
  const titleWidth = () => Math.max(10, mainWidth() - 2 - 2 - (idWidth() + 2) - 3 - 10 - 5 - 2)

  const move = (delta: number) => {
    const count = rows().length
    if (!count) return
    const next = Math.max(0, Math.min(count - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`task-row-${next}`)
  }
  const open = () => {
    const row = current()
    if (!row) return
    if (row.type === "more") return setExpanded((e) => [...e, row.status])
    route.navigate({ name: "thread", id: row.task.id })
  }
  const startFilter = () => {
    setFiltering(true)
    setMode(keymap, "input")
    setTimeout(() => input?.focus(), 1)
  }
  const stopFilter = (clear: boolean) => {
    if (clear) {
      setQuery("")
      if (input) input.value = ""
    }
    setFiltering(false)
    input?.blur()
    setMode(keymap, "base")
    setSelected(0)
  }

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "pagedown", cmd: () => move(10) },
      { key: "pageup", cmd: () => move(-10) },
      { key: "return", cmd: open },
      { key: "escape", cmd: () => query() && stopFilter(true) },
    ],
  }))
  useBindings(() => ({
    mode: "input",
    bindings: [
      { key: "return", cmd: () => stopFilter(false) },
      { key: "escape", cmd: () => stopFilter(true) },
      { key: "down", cmd: () => move(1) },
      { key: "up", cmd: () => move(-1) },
    ],
  }))
  useCommands(() => [
    { name: "tasks.filter", title: "Filter tasks", category: "View", keys: "/", hidden: true, run: startFilter },
    { name: "tasks.refresh", title: "Refresh", category: "View", keys: "r", run: () => void source().refresh() },
  ])

  // Each row's place in the list, worked out once per list rather than searched for by every row.
  const position = createMemo(() => new Map(rows().map((r, i) => [r.type === "task" ? r.task.id : `more:${r.status}`, i])))
  const isCurrent = (at: number) => Math.min(selected(), rows().length - 1) === at

  return (
    <Frame
      view={props.mine ? "Mine" : props.projectId ? `Tasks · ${issues.projectName(props.projectId) ?? "project"}` : "Tasks"}
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<TasksSidebar tasks={shown()} now={now()} />}
      hints={[["j/k", "move"], ["enter", "open"], ["/", "filter"], ["n", "new"], ["s/p/a", "status, priority, assign"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "move"], ["enter", "open"], ["/", "filter"]]}
      version={props.version}
    >
      <box flexDirection="row" paddingLeft={2} paddingRight={2} height={1}>
        <text fg={filtering() ? theme().accent : theme().muted} flexShrink={0}>
          /{" "}
        </text>
        <Show when={filtering() || query()} fallback={<text fg={theme().muted} flexGrow={1}>type to filter    project:any  assignee:any  priority:any</text>}>
          <input
            ref={(r: InputRenderable) => (input = r)}
            flexGrow={1}
            value={query()}
            onInput={(v: string) => {
              setQuery(v)
              setSelected(0)
            }}
            textColor={theme().text}
            focusedTextColor={theme().text}
            backgroundColor={theme().background}
            focusedBackgroundColor={theme().background}
            cursorColor={theme().accent}
          />
        </Show>
        <text fg={theme().muted} flexShrink={0}>
          {source().status === "loading" && !source().loadedAt ? "loading" : `${shown().length} tasks`}
        </text>
      </box>
      <Show when={source().loadedAt} fallback={<Show when={source().status === "error"}><text fg={theme().error} paddingLeft={2}>✗ {source().error}</text></Show>}>
        <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} paddingTop={1} scrollbarOptions={{ visible: false }}>
          <Show when={rows().length === 0}>
            <text fg={theme().muted} paddingLeft={2}>
              {props.mine && !query() ? "No tasks you are on." : "No tasks match."}
            </text>
          </Show>
          {/* Index, not For: groups are rebuilt on every change, and their rows should stay when their tasks do. */}
          <Index each={groups()}>
            {(group) => (
              <box flexDirection="column" marginBottom={1}>
                <text fg={theme().text} paddingLeft={2}>
                  <span style={{ attributes: TextAttributes.BOLD }}>{group().title}</span>
                  <span style={{ fg: theme().muted }}>{`  ${group().all.length}`}</span>
                </text>
                <For each={group().visible}>
                  {(task) => {
                    const at = () => position().get(task.id)!
                    const progress = () => issues.progress(task.id)
                    const pri = () => PRIORITY[task.priority] ?? PRIORITY.medium!
                    return (
                      <box
                        id={`task-row-${at()}`}
                        flexDirection="row"
                        paddingLeft={2}
                        backgroundColor={isCurrent(at()) ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                        onMouseDown={() => setSelected(at())}
                        onMouseUp={open}
                      >
                        <box width={2} flexShrink={0}>
                          <Show when={liveTasks().has(task.id)} fallback={unread(task) ? <text fg={theme().accent}>●</text> : <StatusMark status={task.status} />}>
                            <Spinner color={theme().accent} />
                          </Show>
                        </box>
                        <text fg={theme().text} wrapMode="none">
                          <span style={{ fg: theme().muted }}>{fit(task.identifier ?? "", idWidth() + 2)}</span>
                          {fit(task.title, titleWidth()) + "  "}
                          <span style={{ fg: priorityColor(task.priority, theme()) }}>{pri().mark}</span>
                          {"  " + fit(assignee(task) ?? "—", 10)}
                          <span style={{ fg: theme().muted }}>{fit(progress() ? `${progress()![0]}/${progress()![1]}` : "—", 5, "right")}</span>
                        </text>
                      </box>
                    )
                  }}
                </For>
                <Show when={group().all.length > group().visible.length}>
                  {(() => {
                    const at = () => position().get(`more:${group().status}`)!
                    return (
                      <box
                        id={`task-row-${at()}`}
                        paddingLeft={4 + idWidth() + 2}
                        backgroundColor={isCurrent(at()) ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                        onMouseUp={() => setExpanded((e) => [...e, group().status])}
                      >
                        <text fg={theme().muted}>… {group().all.length - group().visible.length} more</text>
                      </box>
                    )
                  })()}
                </Show>
              </box>
            )}
          </Index>
        </scrollbox>
      </Show>
    </Frame>
  )
}

export function StatusMark(props: { status: string }) {
  const { theme } = useTheme()
  return (
    <Show when={props.status === "done" || props.status === "blocked" || props.status === "cancelled"} fallback={<text> </text>}>
      <text fg={props.status === "done" ? theme().success : props.status === "blocked" ? theme().warning : theme().muted}>
        {props.status === "done" ? "✓" : props.status === "blocked" ? "■" : "×"}
      </text>
    </Show>
  )
}

function TasksSidebar(props: { tasks: TaskSummary[]; now: number }) {
  const { theme } = useTheme()
  const company = useCompany()
  const count = (status: string) => props.tasks.filter((t) => t.status === status).length
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Tasks" count={props.tasks.length} />
        <For each={STATUS_GROUPS.filter((g) => count(g.status) > 0)}>{(g) => <SidebarLine label={g.title} value={count(g.status)} />}</For>
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Priority" />
        <For each={Object.entries(PRIORITY)}>
          {([key, p]) => (
            <SidebarLine
              marker={<span style={{ fg: priorityColor(key, theme()) }}>{p.mark}</span>}
              label={p.label}
              value={props.tasks.filter((t) => t.priority === key).length}
            />
          )}
        </For>
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Live runs" count={company.runs.live.data.length} />
        <For each={company.runs.live.data}>
          {(run) => (
            <box flexDirection="row">
              <Spinner color={theme().accent} />
              <text fg={theme().muted} wrapMode="none">
                {" " + fit(run.agentName, 9) + fit(company.issues.byId(run.issueId)?.identifier ?? "", 9)}
                {fit(elapsed(run.startedAt ?? run.createdAt, props.now), 8, "right")}
              </text>
            </box>
          )}
        </For>
      </box>
    </box>
  )
}
