// A task thread: title and description, then comments and runs in time order. The sidebar holds the task's fields.
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useRoute } from "../route.tsx"
import { createDialogs } from "../plugin/dialogs.tsx"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"
import { DialogSelect } from "../ui/dialog-select.tsx"
import { useCompany, useStores } from "../store/context.tsx"
import type { HeldComments, TaskDetail, ThreadEntry, Waiting } from "../store/issues.ts"
import { useTheme } from "../theme/context.tsx"
import { dateTime, elapsed, fit, until } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { Frame } from "./frame.tsx"
import { SidebarHeader } from "./inbox-sidebar.tsx"
import { PRIORITY, priorityColor } from "./tasks.tsx"
import { STATUS_GLYPHS, statusColor, useTaskRefs } from "./task-refs.tsx"
import { useTabs } from "./tabs.tsx"
import { Slot } from "../plugin/host.tsx"
import { useTaskActions } from "./task-actions.tsx"
import { LiveRun } from "./live-run.tsx"

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
  const dialogs = createDialogs(dialog)
  const toast = useToast()
  const { session } = useStores()
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  const tabs = useTabs()
  const links = useTaskRefs()
  onMount(() => {
    tabs?.open(props.id)
    // The thread is cached for the session; read it again, since live events reach it only while it is watched.
    void thread.detail.refresh()
    void thread.entries.refresh()
    void thread.cost.refresh()
    void thread.held.refresh()
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
      { key: "r", cmd: () => company.issues.refreshThread(props.id) },
      { key: "o", cmd: () => openRuns() },
      { key: "return", cmd: () => openLatestRun() },
      { key: "d", cmd: () => openDocuments() },
      { key: "t", cmd: () => openRelated() },
      { key: "w", cmd: () => afterDispatch(() => void wake()) },
    ],
  }))

  /** What w does here: send held comments, else run a scheduled monitor check or retry now; null when nothing waits. */
  const wakeLabel = () => (thread.held.data ? "send held" : detail()?.waiting?.kind === "monitor" ? "check now" : detail()?.waiting ? "retry now" : null)
  const wake = async () => {
    if (!session.client().writes) return
    const waiting = detail()?.waiting
    if (!thread.held.data && waiting) {
      // As in the web UI, one press: the agent only looks again sooner.
      return company.issues.wakeNow(props.id, waiting.kind).then(
        () => toast.show(waiting.kind === "monitor" ? "Check started" : "Retry started", "success"),
        (err) => toast.error(err),
      )
    }
    await sendHeld()
  }
  /** Sends held comments after saying what that overrides: an unconfirmed stop, or a run still going. */
  const sendHeld = async () => {
    const held = thread.held.data
    if (!held) return
    const n = held.comments.length === 1 ? "the held comment" : `${held.comments.length} held comments`
    const why = held.targetRunId
      ? "This stops the agent's current run and starts a new one with them."
      : `${held.reason ?? "Paperclip is holding them."} Sending starts the agent anyway.`
    if (!(await dialogs.confirm(`Send ${n} now?`, why))) return
    company.issues.sendHeld(props.id, held).then(
      () => toast.show("Held comments sent", "success"),
      (err) => toast.error(err),
    )
  }

  const openDocument = (key: string) => route.navigate({ name: "document", issueId: props.id, key })
  const openDocuments = () => {
    const docs = detail()?.documents ?? []
    if (docs.length === 1) return openDocument(docs[0]!.key)
    if (!docs.length) return
    dialog.replace(() => (
      <DialogSelect
        title="Documents"
        options={docs.map((d) => ({ title: d.title, value: d.key, footer: `rev ${d.revision} · ${dateTime(d.updatedAt)}` }))}
        onSelect={(o) => {
          dialog.clear()
          openDocument(o.value)
        }}
      />
    ))
  }
  /** The parent and the sub-tasks, to move around a task tree. */
  const openRelated = () => {
    const parent = company.issues.byId(detail()?.parentId)
    const related = [...(parent ? [{ task: parent, footer: "parent" }] : []), ...company.issues.children(props.id).map((task) => ({ task, footer: "sub-task" }))]
    if (!related.length) return
    dialog.replace(() => (
      <DialogSelect
        title="Parent and sub-tasks"
        options={related.map((r) => ({ title: `${STATUS_GLYPHS[r.task.status] ?? "○"} ${r.task.identifier ?? ""}  ${r.task.title}`, value: r.task.id, footer: r.footer }))}
        onSelect={(o) => {
          dialog.clear()
          route.navigate({ name: "thread", id: o.value })
        }}
      />
    ))
  }

  /** The run going now, else the latest. */
  const openLatestRun = () => {
    const runs = thread.entries.data.filter((e): e is Extract<ThreadEntry, { kind: "run" }> => e.kind === "run")
    const run = runs.findLast((r) => LIVE.includes(r.status)) ?? runs.at(-1)
    if (run) route.navigate({ name: "run", id: run.id })
  }
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
  useTaskActions(() => detail() ?? undefined, { description: () => detail()?.description ?? null })
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
      hints={[
        ["esc", "back"],
        ...(detail()?.documents.length ? [["d", "documents"] as [string, string]] : []),
        ...(detail()?.parentId || company.issues.children(props.id).length ? [["t", "sub-tasks"] as [string, string]] : []),
        ...(wakeLabel() && session.client().writes ? [["w", wakeLabel()!] as [string, string]] : []),
        ["s/p/a", "status, priority, assign"],
        ["e", "edit"],
        ["f", "attach"],
        ["enter", "latest run"],
        ["o", "runs"],
        ["j/k", "scroll"],
        ["g", "go to"],
        ["ctrl+p", "commands"],
        ["?", "help"],
      ]}
      narrowHints={[["esc", "back"], ["j/k", "scroll"], ["^p", "cmds"]]}
      version={props.version}
      composer={{ label: detail()?.identifier ?? "this task", send: (text, files, assignTo) => company.issues.comment(props.id, text, files, assignTo), handBack: () => company.issues.handBackTo(props.id) }}
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
          <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} paddingLeft={2} paddingRight={2} scrollbarOptions={{ visible: false }} stickyScroll stickyStart="bottom">
            <Slot name="thread_header" />
            <text fg={theme().text} attributes={TextAttributes.BOLD}>
              <span style={{ fg: theme().muted }}>{detail()!.identifier ?? ""}</span>
              {"  " + detail()!.title}
            </text>
            <Show when={detail()!.description}>
              <Markdown content={detail()!.description!} links={links} />
            </Show>
            <Show when={detail()!.documents.length}>
              <text fg={theme().accent} attributes={TextAttributes.BOLD} marginTop={1}>
                Documents <span style={{ fg: theme().muted, attributes: 0 }}> d opens</span>
              </text>
              <For each={detail()!.documents}>
                {(d) => (
                  <text fg={theme().text} wrapMode="none" onMouseUp={() => openDocument(d.key)}>
                    <span style={{ fg: theme().muted }}>▤</span> {d.title}
                    <span style={{ fg: theme().muted }}>{`  rev ${d.revision} · ${agentName(d.agentId) ?? (d.agentId ? "agent" : "you")} · ${dateTime(d.updatedAt)}`}</span>
                  </text>
                )}
              </For>
            </Show>
            <Show when={detail()!.workProducts.length}>
              <text fg={theme().accent} attributes={TextAttributes.BOLD} marginTop={1}>
                Work products
              </text>
              <Markdown content={workProducts(detail()!.workProducts)} links={links} />
            </Show>
            <Show when={thread.entries.status === "error"}>
              <text fg={theme().error} marginTop={1}>
                ✗ Could not load the thread: {thread.entries.error}
              </text>
            </Show>
            <For each={thread.entries.data}>
              {(entry) => (
                <Show
                  when={entry.kind === "comment"}
                  fallback={
                    LIVE.includes((entry as { status: string }).status) ? (
                      <LiveRun runId={entry.id} agentName={agentName((entry as { agentId: string }).agentId)} startedAt={(entry as { startedAt: string | null }).startedAt ?? entry.at} now={now()} onEnd={() => void thread.entries.refresh()} />
                    ) : (
                      <RunLine entry={entry as Extract<ThreadEntry, { kind: "run" }>} name={agentName((entry as { agentId: string }).agentId)} now={now()} />
                    )
                  }
                >
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
                          <Markdown content={c.body} links={links} />
                        </box>
                      </box>
                    )
                  })()}
                </Show>
              )}
            </For>
            <Show when={thread.held.data}>
              {(held: () => HeldComments) => (
                <box flexDirection="column" marginTop={1} backgroundColor={theme().panel} paddingLeft={1} paddingRight={1}>
                  <text fg={theme().warning} attributes={TextAttributes.BOLD}>
                    Held, not sent to the agent yet
                  </text>
                  <text fg={theme().muted}>{held().reason ?? (held().targetRunId ? "Waiting for the agent's current run to finish." : "Waiting for the agent to start.")}</text>
                  <For each={held().comments}>
                    {(c) => (
                      <text fg={theme().text}>
                        <span style={{ fg: theme().muted }}>{`${c.agentId ? (agentName(c.agentId) ?? "agent") : "You"} · ${dateTime(c.at)}  `}</span>
                        {c.body}
                      </text>
                    )}
                  </For>
                  <Show when={session.client().writes}>
                    <text fg={theme().text} marginTop={1}>
                      <span style={{ fg: theme().accent, attributes: TextAttributes.BOLD }}>w</span> sends {held().comments.length === 1 ? "it" : "them"} now.
                    </text>
                  </Show>
                </box>
              )}
            </Show>
            <Show when={detail()!.waiting}>
              {(w: () => Waiting) => (
                <box flexDirection="column" marginTop={1} backgroundColor={theme().panel} paddingLeft={1} paddingRight={1}>
                  <text fg={theme().accent} attributes={TextAttributes.BOLD}>
                    {w().at ? `${w().kind === "monitor" ? "Resumes" : "Retrying"} ${until(w().at, now())}` : "Retry scheduled"}
                  </text>
                  <text fg={theme().muted}>{waitingLine(w())}</text>
                  <Show when={w().kind === "monitor" && (w() as Extract<Waiting, { kind: "monitor" }>).notes}>
                    <text fg={theme().text}>{(w() as Extract<Waiting, { kind: "monitor" }>).notes}</text>
                  </Show>
                  <Show when={w().kind === "retry" && (w() as Extract<Waiting, { kind: "retry" }>).reason}>
                    <text fg={theme().text}>{(w() as Extract<Waiting, { kind: "retry" }>).reason!.replace(/_/g, " ")}</text>
                  </Show>
                  <text fg={theme().text} marginTop={1}>
                    {session.client().writes && !thread.held.data ? (
                      <>
                        <span style={{ fg: theme().accent, attributes: TextAttributes.BOLD }}>w</span>
                        {` ${w().kind === "monitor" ? "checks" : "retries"} now. A comment also wakes the agent.`}
                      </>
                    ) : (
                      `A comment wakes the agent now, before the scheduled ${w().kind === "monitor" ? "check" : "retry"}.`
                    )}
                  </text>
                </box>
              )}
            </Show>
          </scrollbox>
        </Match>
      </Switch>
    </Frame>
  )
}

function RunLine(props: { entry: Extract<ThreadEntry, { kind: "run" }>; name?: string; now: number }) {
  const { theme } = useTheme()
  const route = useRoute()
  const live = () => LIVE.includes(props.entry.status)
  const failed = () => ["failed", "timed_out", "error"].includes(props.entry.status)
  return (
    <box flexDirection="row" marginTop={1} paddingLeft={1} onMouseUp={() => route.navigate({ name: "run", id: props.entry.id })}>
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

/** "Wed 25 Nov, 14:36 · 9 of 16 checks done · watching radarr-sonarr", the facts of the web UI's banner. */
function waitingLine(w: Waiting): string {
  const parts = [
    w.at ? dateTime(w.at) : null,
    w.kind === "monitor" ? `${w.checksDone}${w.maxAttempts ? ` of ${w.maxAttempts}` : ""} checks done` : `attempt ${w.attempt}`,
  ]
  if (w.kind === "monitor") {
    if (w.service) parts.push(`watching ${w.service}`)
    if (w.until) parts.push(`gives up ${dateTime(w.until)}`)
  }
  return parts.filter(Boolean).join(" · ")
}

/** Work products as a Markdown list, so a pull request's or preview's link can be followed. */
function workProducts(list: TaskDetail["workProducts"]): string {
  return list
    .map((w) => `- ${w.url ? `[${w.title}](${w.url})` : w.title} · ${w.type.replace(/_/g, " ")}${w.status === "active" ? "" : ` · ${w.status.replace(/_/g, " ")}`}`)
    .join("\n")
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
  const route = useRoute()
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
              <text fg={theme().muted} wrapMode="none" onMouseUp={() => route.navigate({ name: "thread", id: kid.id })}>
                <span style={{ fg: statusColor(kid.status, theme()) }}>{STATUS_GLYPHS[kid.status] ?? "○"}</span> {fit(kid.title, 26)}
              </text>
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
                <span style={{ fg: statusColor(b.status, theme()) }}>{STATUS_GLYPHS[b.status] ?? "○"}</span> {fit(`${b.identifier ?? ""} ${b.title}`, 26)}
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
