// An opened inbox item: the request as the agent wrote it, with answer options shown but inactive in phase 1.
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal, For, Match, onCleanup, onMount, Show, Switch, type Accessor } from "solid-js"
import { useRoute } from "../route.tsx"
import type { InboxItem, ItemDetail } from "../store/attention.ts"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { age, dateTime, elapsed } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { Frame } from "./frame.tsx"
import { KIND_LABELS, MARKERS, markerColor } from "./inbox-row.tsx"

export function ItemScreen(props: { id: string; version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const item = () => company.attention.feed.data.items.find((i) => i.id === props.id)
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    const it = item()
    if (it) company.attention.open(it)
  })
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(tick))

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "escape,backspace,h", cmd: () => route.back() },
      {
        key: "return",
        cmd: () => {
          const it = item()
          if (it?.kind === "failed_run") route.navigate({ name: "run", id: it.subjectId })
          else if (it?.issueId) route.navigate({ name: "thread", id: it.issueId })
        },
      },
      { key: "down,j", cmd: () => scroll?.scrollBy(1) },
      { key: "up,k", cmd: () => scroll?.scrollBy(-1) },
      { key: "pagedown,space", cmd: () => scroll?.scrollBy(10) },
      { key: "pageup", cmd: () => scroll?.scrollBy(-10) },
    ],
  }))

  const kindLabel = () => (item() ? KIND_LABELS[item()!.kind][0] : "item")
  return (
    <Frame
      view={`Inbox · ${kindLabel()}`}
      badge={company.attention.feed.data.totalCount}
      showSidebar={props.sidebar}
      sidebar={<Show when={item()}>{(it: Accessor<InboxItem>) => <ItemSidebar item={it()} now={now()} />}</Show>}
      hints={[["esc", "back"], ["enter", "open task"], ["j/k", "scroll"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["esc", "back"], ["j/k", "scroll"], ["^p", "cmds"]]}
      version={props.version}
    >
      <Show when={item()} fallback={<text fg={theme().muted} paddingLeft={2}>This item is no longer in the inbox.</text>}>
        {(it: Accessor<InboxItem>) => (
          <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} paddingLeft={2} paddingRight={2} scrollbarOptions={{ visible: false }}>
            <text fg={theme().muted} wrapMode="none">
              ‹ Inbox <span style={{ attributes: TextAttributes.DIM }}> / </span>
              <span style={{ fg: markerColor(it().kind, theme()) }}>{MARKERS[it().kind]}</span>{" "}
              {KIND_LABELS[it().kind][0].replace(/^./, (c: string) => c.toUpperCase())}
            </text>
            <text fg={theme().text} attributes={TextAttributes.BOLD} marginTop={1}>
              {it().title}
            </text>
            <text fg={theme().muted}>
              {[it().agentName ?? company.agents.byId(it().agentId)?.name, agentRole(it()), `asked ${age(it().createdAt, now())} ago`].filter(Boolean).join(" · ")}
            </text>
            <box marginTop={1} flexDirection="column">
              <Switch>
                <Match when={company.attention.detail(it().id)?.status === "ready"}>
                  <Body item={it()} detail={company.attention.detail(it().id)!.detail!} />
                </Match>
                <Match when={company.attention.detail(it().id)?.status === "error"}>
                  <text fg={theme().error}>Could not load the request: {company.attention.detail(it().id)?.error}</text>
                </Match>
                <Match when={true}>
                  <box flexDirection="row">
                    <Spinner color={theme().accent} />
                    <text fg={theme().muted}> loading</text>
                  </box>
                </Match>
              </Switch>
            </box>
          </scrollbox>
        )}
      </Show>
    </Frame>
  )

  function agentRole(it: InboxItem) {
    const agent = company.agents.byId(it.agentId)
    return agent?.title ?? agent?.role
  }
}

function Section(props: { title: string }) {
  const { theme } = useTheme()
  return (
    <text fg={theme().accent} attributes={TextAttributes.BOLD} marginTop={1}>
      {props.title}
    </text>
  )
}

function Options(props: { options: string[]; multiple?: boolean }) {
  const { theme } = useTheme()
  return (
    <For each={props.options}>
      {(label) => (
        <text fg={theme().muted}>
          <span style={{ attributes: TextAttributes.DIM }}>{props.multiple ? "[ ]" : "( )"}</span> {label}
        </text>
      )}
    </For>
  )
}

function NotYet() {
  const { theme } = useTheme()
  return (
    <text fg={theme().muted}>
      <span style={{ fg: theme().warning }}>·</span> Answering is not available yet. This version only shows the request.
    </text>
  )
}

function Body(props: { item: InboxItem; detail: ItemDetail }) {
  const { theme } = useTheme()
  const d = props.detail
  return (
    <Switch fallback={<Markdown content={props.item.summary ?? props.item.whyNow} />}>
      <Match when={d.kind === "question" && d}>
        {(q: Accessor<Extract<ItemDetail, { kind: "question" }>>) => (
          <For each={q().questions}>
            {(question, i) => (
              <box flexDirection="column">
                <Section title={q().questions.length > 1 ? `Question ${i() + 1}` : "Question"} />
                <Markdown content={question.prompt} />
                <Section title="Answer" />
                <Options options={[...question.options, ...(question.allowOther ? ["Something else, with a written reply"] : [])]} multiple={question.multiple} />
                <Show when={i() === q().questions.length - 1}>
                  <NotYet />
                </Show>
              </box>
            )}
          </For>
        )}
      </Match>
      <Match when={d.kind === "confirmation" && d}>
        {(c: Accessor<Extract<ItemDetail, { kind: "confirmation" }>>) => (
          <box flexDirection="column">
            <Markdown content={c().prompt} />
            <Show when={c().detailsMarkdown}>
              <Section title="Details" />
              <Markdown content={c().detailsMarkdown!} />
            </Show>
            <Section title="Answer" />
            <Options options={[c().acceptLabel, c().rejectLabel]} />
            <NotYet />
          </box>
        )}
      </Match>
      <Match when={d.kind === "approval" && d}>
        {(a: Accessor<Extract<ItemDetail, { kind: "approval" }>>) => (
          <box flexDirection="column">
            <Markdown content={a().summary} />
            <Section title="Answer" />
            <Options options={["Approve", "Reject", "Request revision"]} />
            <NotYet />
          </box>
        )}
      </Match>
      <Match when={d.kind === "failed_run" && d}>
        {(f: Accessor<Extract<ItemDetail, { kind: "failed_run" }>>) => (
          <box flexDirection="column">
            <Section title="Error" />
            <box backgroundColor={theme().panel} paddingLeft={1} paddingRight={1}>
              <text fg={theme().text}>{f().error}</text>
            </box>
          </box>
        )}
      </Match>
      <Match when={d.kind === "blocked" && d}>
        {(b: Accessor<Extract<ItemDetail, { kind: "blocked" }>>) => (
          <box flexDirection="column">
            <text fg={theme().text}>{props.item.whyNow}</text>
            <Show when={props.item.blocked}>
              <Section title="Blocked task" />
              <text fg={theme().text}>
                <span style={{ fg: theme().muted }}>{props.item.blocked!.identifier ?? ""}</span> {props.item.blocked!.title}
              </text>
            </Show>
            <Show when={b().blockers.length}>
              <Section title="Waiting on" />
              <For each={b().blockers}>
                {(blocker) => (
                  <text fg={theme().text}>
                    <span style={{ fg: theme().muted }}>{blocker.identifier ?? ""}</span> {blocker.title}{" "}
                    <span style={{ fg: theme().muted }}>{blocker.status.replace(/_/g, " ")}</span>
                  </text>
                )}
              </For>
            </Show>
            <Show when={b().description}>
              <Section title="Description" />
              <Markdown content={b().description!} />
            </Show>
          </box>
        )}
      </Match>
    </Switch>
  )
}

function ItemSidebar(props: { item: InboxItem; now: number }) {
  const { theme } = useTheme()
  const company = useCompany()
  const agent = () => company.agents.byId(props.item.agentId)
  const task = () => company.issues.byId(props.item.issueId)
  const run = () => company.runs.live.data.find((r) => r.agentId === props.item.agentId)
  const expires = () => (props.item.expiresAt ? Date.parse(props.item.expiresAt) - props.now : null)
  const heading = (title: string) => (
    <text fg={theme().text} attributes={TextAttributes.BOLD}>
      {title}
    </text>
  )
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        {heading("Task")}
        <text fg={theme().text}>{props.item.blocked?.identifier ?? props.item.identifier ?? "—"}</text>
        <Show when={props.item.blocked?.title ?? task()?.title}>
          <text fg={theme().muted}>{props.item.blocked?.title ?? task()?.title}</text>
        </Show>
        <Show when={task()}>
          <text fg={theme().muted}>
            <span style={{ fg: theme().accent }}>●</span> Status{"  "}
            {task()!.status.replace(/_/g, " ")}
          </text>
        </Show>
      </box>
      <box flexDirection="column">
        {heading("Agent")}
        <text fg={theme().text}>{props.item.agentName ?? agent()?.name ?? "—"}</text>
        <Show when={agent()?.title ?? agent()?.role}>
          <text fg={theme().muted}>{agent()?.title ?? agent()?.role}</text>
        </Show>
        <Show when={run()}>
          <box flexDirection="row">
            <Spinner color={theme().accent} />
            <text fg={theme().muted}> running  {elapsed(run()!.startedAt ?? run()!.createdAt, props.now)}</text>
          </box>
        </Show>
      </box>
      <box flexDirection="column">
        {heading("Asked")}
        <text fg={theme().muted}>{age(props.item.createdAt, props.now)} ago</text>
        <text fg={theme().muted}>{dateTime(props.item.createdAt)}</text>
      </box>
      <box flexDirection="column">
        {heading("Decide by")}
        <text fg={props.item.decideBy ? theme().warning : theme().muted}>{props.item.decideBy?.replace(/_/g, " ") ?? "not set"}</text>
        <Show when={expires() !== null}>
          <text fg={theme().muted}>{expires()! > 0 ? `expires in ${elapsed(new Date(props.now - expires()!).toISOString(), props.now)}` : "expired"}</text>
        </Show>
        <Show when={props.item.blockedTaskCount}>
          <text fg={theme().muted}>holds up {props.item.blockedTaskCount} task{props.item.blockedTaskCount === 1 ? "" : "s"}</text>
        </Show>
      </box>
    </box>
  )
}
