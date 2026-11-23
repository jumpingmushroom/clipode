// A task thread: title and description, then comments and runs in time order. The sidebar holds the task's fields.
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useRoute } from "../route.tsx"
import { useDialog } from "../ui/dialog.tsx"
import { DialogSelect } from "../ui/dialog-select.tsx"
import { useCompany } from "../store/context.tsx"
import type { TaskDetail, ThreadEntry } from "../store/issues.ts"
import { useTheme } from "../theme/context.tsx"
import { dateTime, elapsed, fit } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { Frame } from "./frame.tsx"
import { SidebarHeader } from "./inbox-sidebar.tsx"
import { PRIORITY, priorityColor, StatusMark } from "./tasks.tsx"
import { useTabs } from "./tabs.tsx"
import { Slot } from "../plugin/host.tsx"

const LIVE = ["queued", "running"]

/** "6m 41s" from start to finish, or to now for a live run. */
export function runDuration(e: { startedAt: string | null; finishedAt: string | null }, now: number): string {
  if (!e.startedAt) return ""
  return elapsed(e.startedAt, e.finishedAt ? Date.parse(e.finishedAt) : now)
}

export function ThreadScreen(props: { id: string; version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const thread = company.issues.thread(props.id)
  const dialog = useDialog()
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  const tabs = useTabs()
  onMount(() => {
    tabs?.open(props.id)
    void thread.detail.load()
    void thread.entries.load()
    void thread.cost.load()
    void company.issues.list.load()
    void company.agents.list.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(tick))

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "escape,backspace", cmd: () => route.back() },
      { key: "down,j", cmd: () => scroll?.scrollBy(1) },
      { key: "up,k", cmd: () => scroll?.scrollBy(-1) },
      { key: "pagedown,space", cmd: () => scroll?.scrollBy(10) },
      { key: "pageup", cmd: () => scroll?.scrollBy(-10) },
      { key: "G,end", cmd: () => scroll?.scrollTo(scroll.scrollHeight) },
      { key: "r", cmd: () => void Promise.all([thread.detail.refresh(), thread.entries.refresh(), thread.cost.refresh()]) },
      { key: "o", cmd: () => openRuns() },
    ],
  }))

  const openRuns = () => {
    const runs = thread.entries.data.filter((e): e is Extract<ThreadEntry, { kind: "run" }> => e.kind === "run").reverse()
    if (!runs.length) return
    dialog.replace(() => (
      <DialogSelect
        title="Runs"
        options={runs.map((r) => ({
          title: `${agentName(r.agentId) ?? "agent"}  ${r.status.replace(/_/g, " ")}  ${runDuration(r, now())}`,
          value: r.id,
          footer: dateTime(r.at),
        }))}
        onSelect={(o) => {
          dialog.clear()
          route.navigate({ name: "run", id: o.value })
        }}
      />
    ))
  }
  const detail = () => thread.detail.data
  const agentName = (id: string | null) => company.agents.byId(id)?.name
  const agentRole = (id: string | null) => {
    const a = company.agents.byId(id)
    return a?.title ?? a?.role
  }

  return (
    <Frame
      view={`Task · ${detail()?.identifier ?? company.issues.byId(props.id)?.identifier ?? ""}`}
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={detail()}>{(d: () => TaskDetail) => <ThreadSidebar task={d()} now={now()} />}</Show>}
      hints={[["esc", "back"], ["o", "open run"], ["j/k", "scroll"], ["G", "end"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["esc", "back"], ["j/k", "scroll"], ["^p", "cmds"]]}
      version={props.version}
      composer={{ label: detail()?.identifier ?? "this task", send: (text) => company.issues.comment(props.id, text) }}
    >
      <Switch>
        <Match when={thread.detail.status === "error" && !detail()}>
          <text fg={theme().error} paddingLeft={2}>
            ✗ Could not load the task: {thread.detail.error}
          </text>
        </Match>
        <Match when={!detail()}>
          <box flexDirection="row" paddingLeft={2}>
            <Spinner color={theme().accent} />
            <text fg={theme().muted}> loading</text>
          </box>
        </Match>
        <Match when={detail()}>
          <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} paddingLeft={2} paddingRight={2} scrollbarOptions={{ visible: false }}>
            <Slot name="thread_header" />
            <text fg={theme().text} attributes={TextAttributes.BOLD}>
              <span style={{ fg: theme().muted }}>{detail()!.identifier ?? ""}</span>
              {"  " + detail()!.title}
            </text>
            <Show when={detail()!.description}>
              <Markdown content={detail()!.description!} />
            </Show>
            <Show when={thread.entries.status === "error"}>
              <text fg={theme().error} marginTop={1}>
                ✗ Could not load the thread: {thread.entries.error}
              </text>
            </Show>
            <For each={thread.entries.data}>
              {(entry) => (
                <Show when={entry.kind === "comment"} fallback={<RunLine entry={entry as Extract<ThreadEntry, { kind: "run" }>} name={agentName((entry as { agentId: string }).agentId)} now={now()} />}>
                  {(() => {
                    const c = entry as Extract<ThreadEntry, { kind: "comment" }>
                    return (
                      <box flexDirection="column" marginTop={1}>
                        <box flexDirection="row">
                          <text fg={theme().text} flexGrow={1} wrapMode="none">
                            <span style={{ attributes: TextAttributes.BOLD }}>{c.agentId ? (agentName(c.agentId) ?? "agent") : "You"}</span>
                            <span style={{ fg: theme().muted }}>{"  " + (c.agentId ? (agentRole(c.agentId) ?? "") : "board")}</span>
                          </text>
                          <text fg={theme().muted}>{dateTime(c.at)}</text>
                        </box>
                        <box paddingLeft={2}>
                          <Markdown content={c.body} />
                        </box>
                      </box>
                    )
                  })()}
                </Show>
              )}
            </For>
          </scrollbox>
        </Match>
      </Switch>
    </Frame>
  )
}

function RunLine(props: { entry: Extract<ThreadEntry, { kind: "run" }>; name?: string; now: number }) {
  const { theme } = useTheme()
  const live = () => LIVE.includes(props.entry.status)
  const failed = () => ["failed", "timed_out", "error"].includes(props.entry.status)
  return (
    <box flexDirection="row" marginTop={1} paddingLeft={1}>
      <Show when={live()} fallback={<text fg={failed() ? theme().error : theme().success}>{failed() ? "✗" : "✓"}</text>}>
        <Spinner color={theme().accent} />
      </Show>
      <text fg={theme().muted} flexGrow={1} wrapMode="none">
        {" run  "}
        <span style={{ fg: theme().text }}>{props.name ?? "agent"}</span>
        {`  ${props.entry.status.replace(/_/g, " ")}  ${runDuration(props.entry, props.now)}`}
        {props.entry.costUsd !== null ? `  $${props.entry.costUsd.toFixed(2)}` : ""}
      </text>
      <text fg={theme().muted}>{dateTime(props.entry.at)}</text>
    </box>
  )
}

function Field(props: { label: string; value: string; color?: "text" | "muted" }) {
  const { theme } = useTheme()
  return (
    <text fg={theme().muted} wrapMode="none">
      {fit(props.label, 8)}
      <span style={{ fg: props.color === "muted" ? theme().muted : theme().text }}>{fit(props.value, 20, "right")}</span>
    </text>
  )
}

function ThreadSidebar(props: { task: TaskDetail; now: number }) {
  const { theme } = useTheme()
  const company = useCompany()
  const thread = company.issues.thread(props.task.id)
  const kids = () => company.issues.children(props.task.id)
  const run = () => company.runs.live.data.find((r) => r.issueId === props.task.id)
  const pri = () => PRIORITY[props.task.priority] ?? PRIORITY.medium!
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Task" />
        <text fg={theme().muted} wrapMode="none">
          <span style={{ fg: theme().accent }}>●</span>
          {" " + fit("Status", 7)}
          <span style={{ fg: theme().text }}>{fit(props.task.status.replace(/_/g, " "), 18, "right")}</span>
        </text>
        <text fg={theme().muted} wrapMode="none">
          {fit("Priority", 10)}
          <span style={{ fg: priorityColor(props.task.priority, theme()) }}>{fit(`${pri().mark} ${pri().label}`, 18, "right")}</span>
        </text>
        <Field label="Assignee" value={company.agents.byId(props.task.assigneeAgentId)?.name ?? (props.task.assigneeUserId ? "you" : "none")} />
        <Field label="Project" value={props.task.projectName ?? "none"} />
        <Field label="Goal" value={props.task.goalTitle ?? "none"} />
        <Field label="Parent" value={props.task.parent?.identifier ?? "none"} />
      </box>
      <Show when={kids().length}>
        <box flexDirection="column">
          <SidebarHeader title="Sub-tasks" count={`${kids().filter((k) => k.status === "done").length}/${kids().length}`} />
          <For each={kids()}>
            {(kid) => (
              <box flexDirection="row">
                <StatusMark status={kid.status} />
                <text fg={theme().muted} wrapMode="none">
                  {" " + fit(kid.title, 26)}
                </text>
              </box>
            )}
          </For>
        </box>
      </Show>
      <Show when={props.task.blockers.length}>
        <box flexDirection="column">
          <SidebarHeader title="Blockers" count={props.task.blockers.length} />
          <For each={props.task.blockers}>
            {(b) => (
              <text fg={theme().muted} wrapMode="none">
                <span style={{ fg: theme().warning }}>■</span> {fit(`${b.identifier ?? ""} ${b.title}`, 26)}
              </text>
            )}
          </For>
        </box>
      </Show>
      <Show when={run()}>
        <box flexDirection="column">
          <SidebarHeader title="Live run" />
          <box flexDirection="row">
            <Spinner color={theme().accent} />
            <text fg={theme().muted}> {fit(run()!.agentName, 12)}{fit(elapsed(run()!.startedAt ?? run()!.createdAt, props.now), 13, "right")}</text>
          </box>
        </box>
      </Show>
      <Show when={thread.cost.data}>
        <box flexDirection="column">
          <SidebarHeader title="Cost so far" />
          <Field label="This task" value={`$${thread.cost.data!.costUsd.toFixed(2)}`} />
          <Field label="Runs" value={String(thread.cost.data!.runCount)} color="muted" />
        </box>
      </Show>
    </box>
  )
}
