// Artifacts: the documents and files agents produced across the company, newest first. `enter` opens a document, or
// the task a file belongs to.
import { RGBA, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import type { Artifact } from "../api/model.ts"
import { useCommands } from "../keymap/commands.tsx"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { age, dateTime, fit } from "../ui/format.ts"
import { Frame, useMainWidth } from "./frame.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

const GLYPHS: Record<Artifact["kind"], string> = { document: "▤", image: "▣", text: "≡", video: "▶", file: "▪" }

export function ArtifactsScreen(props: { version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const [selected, setSelected] = createSignal(0)
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    void company.artifacts.load()
    void company.agents.list.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 30_000)
  onCleanup(() => clearInterval(tick))

  const entries = () => company.artifacts.data
  const current = () => entries()[Math.min(selected(), entries().length - 1)]
  const agent = (a: Artifact) => company.agents.byId(a.agentId)?.name ?? ""
  const mainWidth = useMainWidth(() => props.sidebar, 2)
  const titleWidth = () => Math.max(10, mainWidth() - 2 - 4 - 2 - 10 - 12)
  const move = (delta: number) => {
    const next = Math.max(0, Math.min(entries().length - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`artifact-row-${next}`)
  }
  const openTask = () => {
    const issue = current()?.issue
    if (issue) route.navigate({ name: "thread", id: issue.id })
  }
  const open = () => {
    const a = current()
    if (a?.issue && a.documentKey) route.navigate({ name: "document", issueId: a.issue.id, key: a.documentKey })
    else openTask()
  }

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "pagedown", cmd: () => move(10) },
      { key: "pageup", cmd: () => move(-10) },
      { key: "return", cmd: open },
      { key: "o", cmd: openTask },
    ],
  }))
  useCommands(() => [{ name: "artifacts.refresh", title: "Refresh", category: "View", keys: "r", run: () => void company.artifacts.refresh() }])

  return (
    <Frame
      view="Artifacts"
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={current()}>{(a: () => Artifact) => <ArtifactSidebar artifact={a()} agent={agent(a())} />}</Show>}
      hints={[["j/k", "move"], ["enter", "open"], ["o", "open task"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "move"], ["enter", "open"], ["o", "task"]]}
      version={props.version}
    >
      <Show
        when={entries().length}
        fallback={
          <text fg={theme().muted} paddingLeft={2}>
            {company.artifacts.status === "ready" ? "No artifacts yet" : (company.artifacts.error ?? "Loading…")}
          </text>
        }
      >
        <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} minHeight={0} scrollbarOptions={{ visible: false }}>
          <For each={entries()}>
            {(a, i) => (
              <box
                id={`artifact-row-${i()}`}
                flexDirection="row"
                paddingLeft={2}
                backgroundColor={current() === a ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                onMouseDown={() => setSelected(i())}
                onMouseUp={open}
              >
                <text fg={theme().text} wrapMode="none">
                  <span style={{ fg: theme().muted }}>{fit(age(a.updatedAt, now()), 4)}</span>
                  <span style={{ fg: theme().accent }}>{GLYPHS[a.kind]}</span>
                  {" " + fit(a.title, titleWidth())}
                  <span style={{ fg: theme().muted }}>{fit(a.issue?.identifier ?? "", 10)}</span>
                  {fit(agent(a), 12)}
                </text>
              </box>
            )}
          </For>
        </scrollbox>
      </Show>
    </Frame>
  )
}

function ArtifactSidebar(props: { artifact: Artifact; agent: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Artifact" />
        <SidebarLine label="Kind" value={props.artifact.kind} />
        <Show when={props.artifact.contentType}>
          <SidebarLine label="Type" value={props.artifact.contentType!} />
        </Show>
        <SidebarLine label="By" value={props.agent || "—"} />
        <SidebarLine label="Updated" value={dateTime(props.artifact.updatedAt)} />
      </box>
      <Show when={props.artifact.issue}>
        <box flexDirection="column">
          <SidebarHeader title="Task" />
          <text fg={theme().muted}>{props.artifact.issue!.identifier ?? ""}</text>
          <text fg={theme().text}>{props.artifact.issue!.title}</text>
        </box>
      </Show>
      <Show when={props.artifact.preview}>
        <box flexDirection="column">
          <SidebarHeader title="Preview" />
          <text fg={theme().muted}>{props.artifact.preview!.slice(0, 400)}</text>
        </box>
      </Show>
    </box>
  )
}
