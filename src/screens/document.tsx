// One document of a task (a plan, a spec), as Markdown at its latest revision.
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { Match, onMount, Switch } from "solid-js"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { dateTime } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { Frame } from "./frame.tsx"
import { useTaskRefs } from "./task-refs.tsx"

export function DocumentScreen(props: { issueId: string; docKey: string; version: string }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const doc = company.issues.document(props.issueId, props.docKey)
  const links = useTaskRefs()
  let scroll: ScrollBoxRenderable | undefined

  // Agents revise documents; read it again on every visit.
  onMount(() => void doc.refresh())

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "escape,backspace", cmd: () => route.back() },
      { key: "down,j", cmd: () => scroll?.scrollBy(1) },
      { key: "up,k", cmd: () => scroll?.scrollBy(-1) },
      { key: "pagedown,space", cmd: () => scroll?.scrollBy(10) },
      { key: "pageup", cmd: () => scroll?.scrollBy(-10) },
      { key: "G,end", cmd: () => scroll?.scrollTo(scroll.scrollHeight) },
      { key: "r", cmd: () => void doc.refresh() },
    ],
  }))

  const task = () => company.issues.byId(props.issueId)
  const d = () => doc.data
  return (
    <Frame
      view={`Document · ${task()?.identifier ?? ""}`}
      badge={company.attention.badge()}
      showSidebar={false}
      hints={[["esc", "back"], ["j/k", "scroll"], ["r", "refresh"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["esc", "back"], ["j/k", "scroll"]]}
      version={props.version}
    >
      <Switch>
        <Match when={doc.status === "error" && !d()}>
          <text fg={theme().error} paddingLeft={2}>
            ✗ Could not load the document: {doc.error}
          </text>
        </Match>
        <Match when={!d()}>
          <box flexDirection="row" paddingLeft={2}>
            <Spinner color={theme().accent} />
            <text fg={theme().muted}> loading</text>
          </box>
        </Match>
        <Match when={d()}>
          <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} paddingLeft={2} paddingRight={2} scrollbarOptions={{ visible: false }}>
            <text fg={theme().muted} wrapMode="none">
              ‹ {task()?.identifier ?? "Task"} <span style={{ attributes: TextAttributes.DIM }}> / </span>
              {d()!.title}
            </text>
            <text fg={theme().muted} marginBottom={1}>
              {[`revision ${d()!.revision}`, company.agents.byId(d()!.agentId)?.name ?? (d()!.agentId ? "agent" : "you"), dateTime(d()!.updatedAt)].join(" · ")}
            </text>
            <Markdown content={d()!.body} links={links} />
          </scrollbox>
        </Match>
      </Switch>
    </Frame>
  )
}
