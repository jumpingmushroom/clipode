// A run still going, inline in its task's thread as in the web UI: what the agent says, with its tool calls folded
// between, newest last. The transcript screen has the whole of it.
import { TextAttributes } from "@opentui/core"
import { createEffect, For, onCleanup, onMount, Show, untrack } from "solid-js"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import type { ToolEntry, TranscriptItem } from "../store/runs.ts"
import { useTheme } from "../theme/context.tsx"
import { elapsed, truncate } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { toolSummary } from "./run.tsx"

const POLL_MS = 2000
/** The tail shows this many groups; older ones are on the transcript screen. */
const TAIL = 6

export type Group = { kind: "text"; text: string } | { kind: "tools"; tools: ToolEntry[] }

/** What the agent said, with each run of consecutive tool calls as one group. Thinking and bookkeeping are left out. */
export function groupItems(items: TranscriptItem[]): Group[] {
  const groups: Group[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (item.kind === "tool") {
      if (last?.kind === "tools") last.tools.push(item)
      else groups.push({ kind: "tools", tools: [item] })
    } else if (item.kind === "assistant" && item.text.trim()) groups.push({ kind: "text", text: item.text })
  }
  return groups
}

/** "Bash ×4" when the calls share a tool, else "5 tool calls". */
export function toolsLabel(tools: ToolEntry[]): string {
  const names = new Set(tools.map((t) => t.name))
  if (names.size === 1) return tools.length === 1 ? tools[0]!.name : `${tools[0]!.name} ×${tools.length}`
  return `${tools.length} tool calls`
}

export function LiveRun(props: { runId: string; agentName?: string; startedAt: string | null; now: number; onEnd: () => void }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const transcript = company.runs.transcript(props.runId)

  onCleanup(company.runs.watch(props.runId))
  onMount(() => void transcript.load())
  const poller = setInterval(() => transcript.live() && void transcript.poll(), POLL_MS)
  onCleanup(() => clearInterval(poller))
  // The thread still lists the run as going until it is read again; it then shows the run as one line.
  createEffect(() => transcript.run.data && !transcript.live() && untrack(props.onEnd))

  const groups = () => groupItems(transcript.items())
  const tools = () => transcript.items().filter((i) => i.kind === "tool").length
  const earlier = () => Math.max(0, groups().length - TAIL)
  return (
    <box flexDirection="column" marginTop={1} paddingLeft={1} onMouseUp={() => route.navigate({ name: "run", id: props.runId })}>
      <box flexDirection="row">
        <Spinner color={theme().accent} />
        <text fg={theme().muted} wrapMode="none">
          {" "}
          <span style={{ fg: theme().text, attributes: TextAttributes.BOLD }}>{props.agentName ?? "agent"}</span>
          {`  working for ${elapsed(props.startedAt, props.now) || "a moment"}${tools() ? ` · called ${tools()} tool${tools() === 1 ? "" : "s"}` : ""}`}
        </text>
      </box>
      <box flexDirection="column" paddingLeft={2}>
        <Show when={earlier()}>
          <text fg={theme().muted} attributes={TextAttributes.DIM}>
            … {earlier()} earlier (enter opens the whole run)
          </text>
        </Show>
        <For each={groups().slice(-TAIL)}>
          {(g) =>
            g.kind === "text" ? (
              <box marginTop={1}>
                <Markdown content={g.text} />
              </box>
            ) : (
              <text fg={theme().muted} wrapMode="none" marginTop={1}>
                <span style={{ fg: g.tools.some((t) => t.status === "error") ? theme().error : theme().accent }}>{"›_ "}</span>
                <span style={{ fg: theme().text }}>{toolsLabel(g.tools)}</span>
                {"  " + truncate(toolSummary(g.tools.at(-1)!.input), 90)}
              </text>
            )
          }
        </For>
      </box>
    </box>
  )
}
