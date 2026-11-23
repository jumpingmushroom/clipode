// A run transcript in opencode's style: messages, collapsed reasoning, tool calls with output, the final result.
// A live run is polled every 2 seconds and the view follows the tail.
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useRoute } from "../route.tsx"
import { useCommands } from "../keymap/commands.tsx"
import { createDialogs } from "../plugin/dialogs.tsx"
import { useStores } from "../store/context.tsx"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"
import { useCompany } from "../store/context.tsx"
import type { ToolEntry, TranscriptItem } from "../store/runs.ts"
import { useTheme } from "../theme/context.tsx"
import { dateTime, elapsed, truncate } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { Frame } from "./frame.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

const POLL_MS = 2000
const PREVIEW_LINES = 3

/** The most telling string argument of a tool call: a command, path, pattern or query. */
export function toolSummary(input: unknown): string {
  if (typeof input === "string") return input
  if (!input || typeof input !== "object") return ""
  const rec = input as Record<string, unknown>
  for (const key of ["command", "file_path", "path", "pattern", "query", "url", "description", "text"]) {
    if (typeof rec[key] === "string" && rec[key]) return (rec[key] as string).split("\n")[0]!
  }
  const json = JSON.stringify(rec)
  return json === "{}" ? "" : json
}

const tokens = (n: number | null | undefined) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

export function RunScreen(props: { id: string; version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const transcript = company.runs.transcript(props.id)
  const [now, setNow] = createSignal(Date.now())
  const [thinking, setThinking] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  const [system, setSystem] = createSignal(false)
  const [following, setFollowing] = createSignal(true)
  let scroll: ScrollBoxRenderable | undefined

  onCleanup(company.runs.watch(props.id))
  onMount(() => {
    void transcript.load()
    void company.agents.list.load()
    void company.issues.list.load()
  })
  const clock = setInterval(() => setNow(Date.now()), 1000)
  const poller = setInterval(() => transcript.live() && void transcript.poll(), POLL_MS)
  onCleanup(() => {
    clearInterval(clock)
    clearInterval(poller)
  })

  const run = () => transcript.run.data
  const { session } = useStores()
  const toast = useToast()
  const dialogs = createDialogs(useDialog())
  // Cancelling interrupts work, so it asks first.
  const cancel = () =>
    afterDispatch(async () => {
      if (!transcript.live()) return
      if (!(await dialogs.confirm("Cancel this run?", "The agent stops where it is."))) return
      company.runs.cancel(props.id).then(
        () => toast.show("Run cancelled", "success"),
        (err) => toast.error(err),
      )
    })
  useCommands(() => (session.client().writes && transcript.live() ? [{ name: "run.cancel", title: "Cancel run", category: "Run", keys: "x", run: cancel }] : []))
  const agent = () => company.agents.byId(run()?.agentId)
  const task = () => company.issues.byId(run()?.issueId)
  const items = createMemo(() => transcript.items().filter((i) => system() || i.kind !== "system"))
  const result = () => transcript.items().findLast((i) => i.kind === "result") as Extract<TranscriptItem, { kind: "result" }> | undefined
  const model = () => (transcript.items().find((i) => i.kind === "init") as { model: string } | undefined)?.model
  const tools = createMemo(() => transcript.items().filter((i): i is ToolEntry => i.kind === "tool"))
  const duration = () => (run()?.startedAt ? elapsed(run()!.startedAt, run()!.finishedAt ? Date.parse(run()!.finishedAt!) : now()) : "")
  const cost = () => result()?.costUsd || run()?.costUsd || null
  const totalTokens = () => {
    const r = result()
    const n = (r?.inputTokens ?? run()?.inputTokens ?? 0) + (r?.outputTokens ?? run()?.outputTokens ?? 0)
    return n || null
  }

  const scrollBy = (n: number) => {
    setFollowing(false)
    scroll?.scrollBy(n)
  }
  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "escape,backspace", cmd: () => route.back() },
      { key: "down,j", cmd: () => scrollBy(1) },
      { key: "up,k", cmd: () => scrollBy(-1) },
      { key: "pagedown,space", cmd: () => scrollBy(10) },
      { key: "pageup", cmd: () => scrollBy(-10) },
      {
        key: "G,end",
        cmd: () => {
          setFollowing(true)
          scroll?.scrollTo(scroll.scrollHeight)
        },
      },
      { key: "t", cmd: () => setThinking((v) => !v) },
      { key: "e", cmd: () => setExpanded((v) => !v) },
      { key: "s", cmd: () => setSystem((v) => !v) },
    ],
  }))

  const statusMark = () => (
    <Show when={transcript.live()} fallback={<text fg={run()?.status === "succeeded" ? theme().success : theme().error}>{run()?.status === "succeeded" ? "✓" : "✗"}</text>}>
      <Spinner color={theme().accent} />
    </Show>
  )

  return (
    <Frame
      view={`Run · ${task()?.identifier ?? props.id.slice(0, 8)}`}
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<RunSidebar runId={props.id} model={model()} duration={duration()} cost={cost()} tools={tools()} result={result()} />}
      hints={[["esc", "back"], ["j/k", "scroll"], ["G", "follow"], ["t", "thinking"], ["e", "tools"], ["s", "status"], ...(transcript.live() && session.client().writes ? ([["x", "cancel run"]] as [string, string][]) : [])]}
      narrowHints={[["esc", "back"], ["j/k", "scroll"], ["t", "think"], ["e", "tools"]]}
      version={props.version}
    >
      <Switch>
        <Match when={transcript.run.status === "error" && !run()}>
          <text fg={theme().error} paddingLeft={2}>
            ✗ Could not load the run: {transcript.run.error}
          </text>
        </Match>
        <Match when={!run()}>
          <box flexDirection="row" paddingLeft={2}>
            <Spinner color={theme().accent} />
            <text fg={theme().muted}> loading</text>
          </box>
        </Match>
        <Match when={run()}>
          <box flexDirection="column" flexGrow={1} minHeight={0}>
          <box flexDirection="row" paddingLeft={2} paddingRight={2} flexShrink={0}>
            {statusMark()}
            <text fg={theme().muted} flexGrow={1} wrapMode="none">
              {" "}
              <span style={{ fg: theme().text, attributes: TextAttributes.BOLD }}>Run {props.id.slice(0, 4)}</span>
              {`  ${agent()?.name ?? "agent"}${task()?.identifier ? ` on ${task()!.identifier}` : ""} · started ${dateTime(run()!.startedAt ?? run()!.createdAt)}`}
            </text>
            <Show when={transcript.live() && following()}>
              <text fg={theme().muted}>
                following tail <span style={{ fg: theme().accent }}>↓</span>
              </text>
            </Show>
          </box>
          <scrollbox
            ref={(r: ScrollBoxRenderable) => (scroll = r)}
            flexGrow={1}
            flexShrink={1}
            minHeight={0}
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            stickyScroll={following()}
            stickyStart="bottom"
            scrollbarOptions={{ visible: false }}
          >
            <Show when={run()!.error}>
              <text fg={theme().error}>✗ {run()!.error}</text>
            </Show>
            <Show when={transcript.error()}>
              <text fg={theme().error}>✗ Could not read the log: {transcript.error()}</text>
            </Show>
            <For each={items()}>
              {(item, i) => <Item item={item} last={i() === items().length - 1} live={transcript.live()} thinking={thinking()} expanded={expanded()} />}
            </For>
            <Show when={items().length === 0 && !transcript.error()}>
              <text fg={theme().muted}>{transcript.live() ? "Waiting for output…" : "This run wrote no output."}</text>
            </Show>
          </scrollbox>
          <box flexDirection="row" paddingLeft={2} paddingRight={2} flexShrink={0}>
            {statusMark()}
            <text fg={theme().muted} wrapMode="none">
              {" "}
              <span style={{ fg: theme().text }}>{agent()?.name ?? "agent"}</span>
              {[model(), duration(), totalTokens() ? `${tokens(totalTokens())} tokens` : "", cost() ? `$${cost()!.toFixed(2)}` : ""]
                .filter(Boolean)
                .map((s) => ` · ${s}`)
                .join("")}
            </text>
          </box>
          </box>
        </Match>
      </Switch>
    </Frame>
  )
}

function Item(props: { item: TranscriptItem; last: boolean; live: boolean; thinking: boolean; expanded: boolean }) {
  const { theme } = useTheme()
  const item = props.item
  return (
    <Switch>
      <Match when={item.kind === "assistant"}>
        <box marginBottom={1}>
          <Markdown content={(item as { text: string }).text} streaming={props.live && props.last} />
        </box>
      </Match>
      <Match when={item.kind === "thinking"}>
        <box marginBottom={1} flexDirection="column">
          <text fg={theme().muted}>{props.thinking ? "▾" : "▸"} Thinking</text>
          <Show when={props.thinking}>
            <box paddingLeft={2}>
              <text fg={theme().muted} attributes={TextAttributes.ITALIC}>
                {(item as { text: string }).text}
              </text>
            </box>
          </Show>
        </box>
      </Match>
      <Match when={item.kind === "tool"}>
        <Tool tool={item as ToolEntry} expanded={props.expanded} />
      </Match>
      <Match when={item.kind === "user"}>
        <text fg={theme().muted} marginBottom={1}>
          › {(item as { text: string }).text}
        </text>
      </Match>
      <Match when={item.kind === "result"}>
        {(() => {
          const r = item as Extract<TranscriptItem, { kind: "result" }>
          return (
            <box flexDirection="column" marginBottom={1}>
              <text fg={r.isError ? theme().error : theme().success}>
                {r.isError ? "✗" : "✓"} <span style={{ fg: theme().text }}>{r.text || (r.isError ? "Run failed" : "Run finished")}</span>
              </text>
              <For each={r.errors}>{(e) => <text fg={theme().error}>  {e}</text>}</For>
            </box>
          )
        })()}
      </Match>
      <Match when={item.kind === "stderr"}>
        <text fg={theme().error}>{(item as { text: string }).text}</text>
      </Match>
      <Match when={item.kind === "system" || item.kind === "raw"}>
        <text fg={theme().muted}>{(item as { text: string }).text}</text>
      </Match>
    </Switch>
  )
}

function Tool(props: { tool: ToolEntry; expanded: boolean }) {
  const { theme } = useTheme()
  const lines = () => (props.tool.output ?? "").replace(/\s+$/, "").split("\n").filter((l, i, all) => l || i < all.length - 1)
  const shown = () => (props.expanded ? lines() : lines().slice(0, PREVIEW_LINES))
  return (
    <box flexDirection="column" marginBottom={1} paddingLeft={2}>
      <box flexDirection="row">
        <Show when={props.tool.status === "running"}>
          <Spinner color={theme().accent} />
          <text> </text>
        </Show>
        <text fg={props.tool.status === "error" ? theme().error : theme().text} wrapMode="none">
          <span style={{ attributes: TextAttributes.BOLD }}>{props.tool.name}</span>
          <span style={{ fg: theme().muted }}>{"  " + truncate(toolSummary(props.tool.input), 100)}</span>
        </text>
      </box>
      <Show when={props.tool.output}>
        <box paddingLeft={2} flexDirection="column">
          <For each={shown()}>
            {(line) => (
              <text fg={props.tool.status === "error" ? theme().error : theme().muted} wrapMode="none">
                {line}
              </text>
            )}
          </For>
          <Show when={lines().length > shown().length}>
            <text fg={theme().muted} attributes={TextAttributes.DIM}>
              … {lines().length - shown().length} more lines (e to expand)
            </text>
          </Show>
        </box>
      </Show>
    </box>
  )
}

function RunSidebar(props: {
  runId: string
  model?: string
  duration: string
  cost: number | null
  tools: ToolEntry[]
  result?: Extract<TranscriptItem, { kind: "result" }>
}) {
  const company = useCompany()
  const run = () => company.runs.transcript(props.runId).run.data
  const byName = () => {
    const counts = new Map<string, number>()
    for (const t of props.tools) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Run" />
        <SidebarLine label="Status" value={run()?.status.replace(/_/g, " ") ?? ""} />
        <SidebarLine label="Agent" value={company.agents.byId(run()?.agentId)?.name ?? "—"} />
        <SidebarLine label="Task" value={company.issues.byId(run()?.issueId)?.identifier ?? "—"} />
        <SidebarLine label="Model" value={props.model ?? "—"} />
        <SidebarLine label="Duration" value={props.duration} />
      </box>
      <box flexDirection="column">
        <SidebarHeader title="Usage" />
        <SidebarLine label="Input" value={tokens(props.result?.inputTokens || run()?.inputTokens)} />
        <SidebarLine label="Output" value={tokens(props.result?.outputTokens || run()?.outputTokens)} />
        <SidebarLine label="Cost" value={props.cost ? `$${props.cost.toFixed(2)}` : "—"} />
      </box>
      <Show when={props.tools.length}>
        <box flexDirection="column">
          <SidebarHeader title="Tool calls" count={props.tools.length} />
          <For each={byName().slice(0, 8)}>{([name, n]) => <SidebarLine label={name} value={n} />}</For>
        </box>
      </Show>
    </box>
  )
}
