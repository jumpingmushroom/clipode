// Projects: status and task counts per project; enter shows the project's tasks. The sidebar shows the selected one.
import { RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, onMount, Show } from "solid-js"
import type { ProjectSummary } from "../api/model.ts"
import { useCommands } from "../keymap/commands.tsx"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { IN_FLIGHT } from "../store/issues.ts"
import { useTheme } from "../theme/context.tsx"
import { fit } from "../ui/format.ts"
import { Frame, SIDEBAR_MIN_COLUMNS, SIDEBAR_WIDTH } from "./frame.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

const CLOSED = ["done", "cancelled"]
const STATUS = 14, COUNT = 10

export function ProjectsScreen(props: { version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const [selected, setSelected] = createSignal(0)
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    void company.issues.projects.load()
    void company.issues.list.load()
    void company.agents.list.load()
  })

  const projects = createMemo(() => company.issues.projects.data.filter((p) => !p.archived))
  const current = () => projects()[Math.min(selected(), projects().length - 1)]
  const counts = (p: ProjectSummary) => {
    const tasks = company.issues.list.data.filter((t) => t.projectId === p.id)
    return { open: tasks.filter((t) => !CLOSED.includes(t.status)).length, inFlight: tasks.filter((t) => IN_FLIGHT.includes(t.status)).length, done: tasks.filter((t) => t.status === "done").length }
  }
  const mainWidth = () => dimensions().width - (dimensions().width >= SIDEBAR_MIN_COLUMNS && props.sidebar ? SIDEBAR_WIDTH : 0) - 4
  const nameWidth = () => Math.max(12, mainWidth() - STATUS - 3 * COUNT)
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(projects().length - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`project-row-${next}`)
  }
  const open = () => current() && route.navigate({ name: "tasks", projectId: current()!.id })

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "return", cmd: open },
    ],
  }))
  useCommands(() => [{ name: "projects.refresh", title: "Refresh", category: "View", keys: "r", run: () => void company.issues.projects.refresh() }])

  return (
    <Frame
      view="Projects"
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={current()}>{(p: () => ProjectSummary) => <ProjectSidebar project={p()} />}</Show>}
      hints={[["j/k", "move"], ["enter", "tasks"], ["r", "refresh"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "move"], ["enter", "tasks"], ["^p", "cmds"]]}
      version={props.version}
    >
      <text fg={theme().text} paddingLeft={2} flexShrink={0}>
        <span style={{ attributes: TextAttributes.BOLD }}>Projects</span>
        <span style={{ fg: theme().muted }}>{`  ${projects().length}`}</span>
      </text>
      <Show
        when={projects().length}
        fallback={
          <text fg={theme().muted} paddingLeft={2} marginTop={1}>
            {company.issues.projects.status === "ready" ? "No projects in this company" : company.issues.projects.error ?? "Loading…"}
          </text>
        }
      >
        <text fg={theme().muted} paddingLeft={4} marginTop={1} wrapMode="none" flexShrink={0}>
          {fit("Project", nameWidth()) + fit("Status", STATUS) + fit("Open", COUNT) + fit("In flight", COUNT) + "Done"}
        </text>
        <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} minHeight={0} scrollbarOptions={{ visible: false }}>
          <For each={projects()}>
            {(p, i) => {
              const c = () => counts(p)
              return (
                <box
                  id={`project-row-${i()}`}
                  flexDirection="row"
                  paddingLeft={2}
                  backgroundColor={current() === p ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                  onMouseDown={() => setSelected(i())}
                  onMouseUp={open}
                >
                  <text fg={theme().text} wrapMode="none">
                    <span style={{ fg: p.status === "in_progress" ? theme().success : theme().muted }}>{"● "}</span>
                    {fit(p.name, nameWidth() - 1) + " "}
                    <span style={{ fg: theme().muted }}>{fit(p.status.replace(/_/g, " "), STATUS)}</span>
                    {fit(String(c().open), COUNT) + fit(String(c().inFlight), COUNT)}
                    <span style={{ fg: theme().muted }}>{String(c().done)}</span>
                  </text>
                </box>
              )
            }}
          </For>
        </scrollbox>
      </Show>
    </Frame>
  )
}

function ProjectSidebar(props: { project: ProjectSummary }) {
  const { theme } = useTheme()
  const company = useCompany()
  const p = () => props.project
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title={p().name} />
        <SidebarLine label="Status" value={p().status.replace(/_/g, " ")} />
        <SidebarLine label="Lead" value={company.agents.byId(p().leadAgentId)?.name ?? "—"} />
        <SidebarLine label="Target" value={p().targetDate?.slice(0, 10) ?? "—"} />
      </box>
      <Show when={p().description}>
        <text fg={theme().muted}>{p().description}</text>
      </Show>
    </box>
  )
}
