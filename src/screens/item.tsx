// An opened inbox item: the request as the agent wrote it, and the answer: options to choose, or a decision to make.
import { RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch, untrack, type Accessor } from "solid-js"
import { createDialogs } from "../plugin/dialogs.tsx"
import { useRoute } from "../route.tsx"
import type { DecisionOption, InboxItem, ItemDetail } from "../store/attention.ts"
import { useCompany, useStores } from "../store/context.tsx"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"
import { choicesFor, missing, toAnswers, toggle, writeOther, type Choice, type Selection } from "./answer.ts"
import { useTheme } from "../theme/context.tsx"
import { ago, dateTime, elapsed } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { Frame } from "./frame.tsx"
import { useTaskRefs } from "./task-refs.tsx"
import { KIND_LABELS, MARKERS, markerColor } from "./inbox-row.tsx"

/** Reasons and notes typed for a decision, kept until the server takes it, so a refused one need not be typed again. */
const drafts = new Map<string, string>()

export function ItemScreen(props: { id: string; version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  // The full feed, not items(): the item stays on screen while its answer is being sent.
  const item = () => company.attention.feed.data.items.find((i) => i.id === props.id)
  const { session } = useStores()
  const toast = useToast()
  const dialogs = createDialogs(useDialog())
  const [now, setNow] = createSignal(Date.now())
  const [cursor, setCursor] = createSignal(0)
  const [selection, setSelection] = createSignal<Selection>({})
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => void company.attention.feed.load())
  // Opened from a tab or a route before the inbox loaded: fetch the detail once the item is known.
  createEffect(() => {
    const it = item()
    if (it) untrack(() => company.attention.open(it))
  })
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(tick))

  const detail = () => company.attention.detail(props.id)?.detail
  const choices = createMemo(() => (detail() && session.client().writes ? choicesFor(detail()!) : []))
  const questions = () => {
    const d = detail()
    return d?.kind === "question" ? d.questions : []
  }

  /** Asks for a reason or note, starting from what was typed last time for this item and choice. */
  const note = async (key: string, title: string, placeholder: string) => {
    const text = await dialogs.prompt(title, placeholder, drafts.get(`${props.id}:${key}`))
    if (text !== null) drafts.set(`${props.id}:${key}`, text)
    return text
  }
  /** Leaves the item and sends; the store hides it at once and brings it back if the server refuses. */
  const send = async (done: string, action: (it: InboxItem) => Promise<void>, draft?: string) => {
    const it = item()
    if (!it) return
    route.back()
    try {
      await action(it)
      if (draft) drafts.delete(`${it.id}:${draft}`)
      toast.show(done, "success")
    } catch (err) {
      toast.error(err)
    }
  }

  const activate = async (choice: Choice) => {
    const q = questions().find((x) => "questionId" in choice && x.id === choice.questionId)
    if (choice.kind === "option" && q) return setSelection((s) => toggle(s, q, choice.optionId))
    if (choice.kind === "other" && q) {
      const text = await dialogs.prompt("Something else", "Your answer")
      if (text !== null) setSelection((s) => writeOther(s, q, text))
      return
    }
    if (choice.kind === "accept") return send("Accepted", (it) => company.attention.accept(it))
    // Rejections and approval decisions are confirmed: the prompt shows what is sent and takes an optional reason.
    if (choice.kind === "reject") {
      const reason = await note("reject", `Reject: ${choice.label}`, "Optional reason, then enter to send")
      if (reason !== null) void send("Rejected", (it) => company.attention.reject(it, reason || undefined), "reject")
      return
    }
    if (choice.kind === "review") {
      // Request changes needs a note; approving and sending back take one optionally.
      const required = choice.action === "request_changes"
      const text = await note(choice.action, choice.label, required ? "What should change? Required" : "Optional note, then enter to send")
      if (text === null) return
      if (required && !text.trim()) return toast.show("Request changes needs a note", "warning")
      void send(`${choice.label}: sent`, (it) => company.attention.review(it, choice.action, text.trim() || undefined), choice.action)
      return
    }
    if (choice.kind === "approval") {
      const text = await note(choice.decision, choice.label, "Optional note, then enter to send")
      if (text !== null) void send(`${choice.label}: sent`, (it) => company.attention.decide(it, choice.decision, text || undefined), choice.decision)
      return
    }
    if (choice.kind === "approval-comment") {
      const text = await note("comment", "Comment on the approval", "Your comment, then enter to post")
      const it = item()
      if (!text?.trim() || !it) return
      return company.attention.commentOnApproval(it, text.trim()).then(
        () => (drafts.delete(`${it.id}:comment`), toast.show("Comment posted", "success")),
        (err) => toast.error(err),
      )
    }
    if (choice.kind === "decision") return chooseOption(choice.option, choice.label)
    if (choice.kind === "decision-dismiss") {
      const reason = await note("dismiss", "Dismiss the decision", "Optional reason, then enter to dismiss")
      if (reason !== null) void send("Decision dismissed", (it) => company.attention.dismissDecision(it, reason.trim() || undefined), "dismiss")
      return
    }
    if (choice.kind === "retry") return send("Retry queued", (it) => company.attention.retry(it))
    if (choice.kind === "clear-error") return send("Error cleared", (it) => company.attention.clearError(it))
    if (choice.kind === "recovery") {
      const text = await note(choice.label, choice.outcome.label, "Optional note, then enter to send")
      if (text !== null) void send(`${choice.label}: sent`, (it) => company.attention.resolveRecovery(it, choice.outcome, text.trim() || undefined), choice.label)
    }
  }

  /** A decision's option: its inputs are asked for first; a destructive one is confirmed, a task-tree cancel typed out. */
  const chooseOption = async (option: DecisionOption, label: string) => {
    const d = detail()
    const it = item()
    if (d?.kind !== "decision" || !it) return
    const values: Record<string, string> = {}
    for (const input of d.inputs) {
      const text = await note(`input:${input.id}`, input.label, input.placeholder ?? (input.required ? "Required" : "Optional, enter to skip"))
      if (text === null) return
      if (input.required && !text.trim()) return toast.show(`${input.label} is required`, "warning")
      if (input.maxLength && text.length > input.maxLength) return toast.show(`${input.label} takes at most ${input.maxLength} characters`, "warning")
      if (text.trim()) values[input.id] = text.trim()
    }
    if (option.cancelsTree) {
      const want = it.identifier ?? "cancel"
      const typed = await dialogs.prompt(`${option.label}: this cancels a task and its subtasks`, `Type ${want} to confirm`)
      if (typed === null) return
      if (typed.trim() !== want) return toast.show(`Not sent: type ${want} to confirm`, "warning")
    } else if (option.destructive && !(await dialogs.confirm(option.label, label))) return
    void send(`${option.label}: sent`, async (i) => {
      await company.attention.choose(i, option.id, values)
      for (const input of d.inputs) drafts.delete(`${i.id}:input:${input.id}`)
    })
  }

  const submit = () => {
    if (!questions().length) return
    const left = missing(questions(), selection())
    if (left.length) return toast.show(`Answer every question first (${left.length} left)`, "warning")
    void send("Answer sent", (it) => company.attention.answer(it, toAnswers(questions(), selection())))
  }

  const move = (delta: number) => {
    if (!choices().length) return scroll?.scrollBy(delta)
    setCursor((c) => Math.max(0, Math.min(choices().length - 1, c + delta)))
    scroll?.scrollChildIntoView(`choice-${cursor()}`)
  }

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "escape,backspace,h", cmd: () => route.back() },
      {
        key: "o",
        cmd: () => {
          const it = item()
          if (it?.kind === "failed_run") route.navigate({ name: "run", id: it.subjectId })
          else if (it?.kind === "agent_error") route.navigate({ name: "agent", id: it.subjectId })
          else if (it?.issueId) route.navigate({ name: "thread", id: it.issueId })
        },
      },
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "return,space", cmd: () => choices()[cursor()] && afterDispatch(() => void activate(choices()[cursor()]!)) },
      { key: "ctrl+s", cmd: submit },
      { key: "pagedown", cmd: () => scroll?.scrollBy(10) },
      { key: "pageup", cmd: () => scroll?.scrollBy(-10) },
    ],
  }))

  const kindLabel = () => (item() ? KIND_LABELS[item()!.kind][0] : "item")
  return (
    <Frame
      view={`Inbox · ${kindLabel()}`}
      badge={company.attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<Show when={item()}>{(it: Accessor<InboxItem>) => <ItemSidebar item={it()} now={now()} />}</Show>}
      hints={
        choices().length
          ? [["j/k", "choose"], ["enter", "select"], ...(questions().length ? [["ctrl+s", "send"] as [string, string]] : []), ["o", "open task"], ["esc", "back"]]
          : [["esc", "back"], ["o", "open task"], ["pgup/pgdn", "scroll"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]
      }
      narrowHints={choices().length ? [["j/k", "choose"], ["enter", "select"], ["esc", "back"]] : [["esc", "back"], ["o", "open"], ["^p", "cmds"]]}
      version={props.version}
      composer={item()?.issueId ? { label: item()!.blocked?.identifier ?? item()!.identifier ?? "this task", send: (text, files, assignTo) => company.issues.comment(item()!.issueId!, text, files, assignTo), handBack: () => company.issues.handBackTo(item()!.issueId!) } : undefined}
    >
      <Show
        when={item()}
        fallback={
          <text fg={theme().muted} paddingLeft={2}>
            {company.attention.feed.loadedAt ? "This item is no longer in the inbox." : "loading"}
          </text>
        }
      >
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
              {[it().agentName ?? company.agents.byId(it().agentId)?.name, agentRole(it()), `asked ${ago(it().createdAt, now())}`].filter(Boolean).join(" · ")}
            </text>
            <box marginTop={1} flexDirection="column">
              <Switch>
                <Match when={company.attention.detail(it().id)?.status === "ready"}>
                  <Body
                    item={it()}
                    detail={company.attention.detail(it().id)!.detail!}
                    choices={choices()}
                    cursor={cursor()}
                    selection={selection()}
                    onPick={(i) => {
                      setCursor(i)
                      void activate(choices()[i]!)
                    }}
                  />
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

type Pick = { choices: Choice[]; cursor: number; selection: Selection; onPick: (index: number) => void }

/** Answer rows. Without writes (readOnly) they are shown inactive, with the phase 1 note. */
function Options(props: Pick & { show: Choice[]; multiple?: boolean }) {
  const { theme } = useTheme()
  const chosen = (c: Choice) => {
    if (c.kind === "option") return props.selection[c.questionId]?.optionIds.includes(c.optionId) ?? false
    if (c.kind === "other") return !!props.selection[c.questionId]?.otherText
    return false
  }
  const box = (c: Choice) => (props.multiple ? (chosen(c) ? "[x]" : "[ ]") : chosen(c) ? "(•)" : "( )")
  return (
    <For each={props.show}>
      {(choice) => {
        const index = () => props.choices.indexOf(choice)
        const active = () => index() >= 0 && index() === props.cursor
        return (
          <box
            id={`choice-${index()}`}
            flexDirection="row"
            backgroundColor={active() ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
            onMouseUp={() => index() >= 0 && props.onPick(index())}
          >
            <text fg={index() >= 0 ? theme().text : theme().muted}>
              <span style={{ fg: chosen(choice) ? theme().accent : theme().muted, attributes: index() >= 0 ? undefined : TextAttributes.DIM }}>
                {choice.kind === "option" || choice.kind === "other" ? box(choice) : "›"}
              </span>{" "}
              {choice.label}
              <Show when={choice.kind === "other" && props.selection[(choice as { questionId: string }).questionId]?.otherText}>
                <span style={{ fg: theme().muted }}>: {props.selection[(choice as { questionId: string }).questionId]?.otherText}</span>
              </Show>
            </text>
          </box>
        )
      }}
    </For>
  )
}

/** Choices for rendering when writes are off: the same rows, not in the cursor's list. */
const inert = (detail: ItemDetail) => choicesFor(detail)

function NotYet() {
  const { theme } = useTheme()
  return (
    <text fg={theme().muted}>
      <span style={{ fg: theme().warning }}>·</span> Answering is turned off (readOnly in cli.json).
    </text>
  )
}

function Body(props: { item: InboxItem; detail: ItemDetail } & Pick) {
  const { theme } = useTheme()
  const company = useCompany()
  const d = props.detail
  const all = () => (props.choices.length ? props.choices : inert(d))
  const links = useTaskRefs()
  const pick = () => ({ choices: props.choices, cursor: props.cursor, selection: props.selection, onPick: props.onPick })
  return (
    <Switch
      fallback={
        <box flexDirection="column">
          <Markdown content={props.item.summary ?? props.item.whyNow} links={links} />
          <text fg={theme().muted} marginTop={1}>
            clipode cannot decide this kind of item yet; use Paperclip's web UI.
          </text>
        </box>
      }
    >
      <Match when={d.kind === "question" && d}>
        {(q: Accessor<Extract<ItemDetail, { kind: "question" }>>) => (
          <box flexDirection="column">
          <Show when={q().context}>
            <Section title="Context" />
            <Markdown content={q().context!} links={links} />
          </Show>
          <For each={q().questions}>
            {(question, i) => (
              <box flexDirection="column">
                <Section title={q().questions.length > 1 ? `Question ${i() + 1}` : "Question"} />
                <Markdown content={question.prompt} links={links} />
                <Section title="Answer" />
                <Options {...pick()} show={all().filter((c) => "questionId" in c && c.questionId === question.id)} multiple={question.multiple} />
                <Show when={i() === q().questions.length - 1 && !props.choices.length}>
                  <NotYet />
                </Show>
              </box>
            )}
          </For>
          </box>
        )}
      </Match>
      <Match when={d.kind === "confirmation" && d}>
        {(c: Accessor<Extract<ItemDetail, { kind: "confirmation" }>>) => (
          <box flexDirection="column">
            <Markdown content={c().prompt} links={links} />
            <Show when={c().detailsMarkdown}>
              <Section title="Details" />
              <Markdown content={c().detailsMarkdown!} links={links} />
            </Show>
            <Section title="Answer" />
            <Options {...pick()} show={all()} />
            <Show when={!props.choices.length}>
              <NotYet />
            </Show>
          </box>
        )}
      </Match>
      <Match when={d.kind === "approval" && d}>
        {(a: Accessor<Extract<ItemDetail, { kind: "approval" }>>) => (
          <box flexDirection="column">
            <Markdown content={a().summary} links={links} />
            <Show when={a().comments.length}>
              <Section title="Discussion" />
              <For each={a().comments}>
                {(c) => (
                  <box flexDirection="column" marginBottom={1}>
                    <text fg={theme().muted}>
                      <span style={{ fg: theme().text, attributes: TextAttributes.BOLD }}>{c.agentId ? (company.agents.byId(c.agentId)?.name ?? "agent") : "You"}</span> ·{" "}
                      {dateTime(c.at)}
                    </text>
                    <Markdown content={c.body} links={links} />
                  </box>
                )}
              </For>
            </Show>
            <Section title="Answer" />
            <Options {...pick()} show={all()} />
            <Show when={!props.choices.length}>
              <NotYet />
            </Show>
          </box>
        )}
      </Match>
      <Match when={d.kind === "review" && d}>
        {(r: Accessor<Extract<ItemDetail, { kind: "review" }>>) => (
          <box flexDirection="column">
            <text fg={theme().text}>{r().whyNow}</text>
            <Show
              when={r().stalled}
              fallback={
                <text fg={theme().muted} marginTop={1}>
                  This review is decided where it waits (an approval or a reviewer). o opens the task.
                </text>
              }
            >
              <Section title="Decide" />
              <Options {...pick()} show={all()} />
              <Show when={!props.choices.length}>
                <NotYet />
              </Show>
            </Show>
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
            <Section title="Answer" />
            <Options {...pick()} show={all()} />
            <Show when={!props.choices.length}>
              <NotYet />
            </Show>
          </box>
        )}
      </Match>
      <Match when={d.kind === "agent_error" && d}>
        {(e: Accessor<Extract<ItemDetail, { kind: "agent_error" }>>) => (
          <box flexDirection="column">
            <text fg={theme().text}>{props.item.whyNow}</text>
            <Section title="Error" />
            <box backgroundColor={theme().panel} paddingLeft={1} paddingRight={1}>
              <text fg={theme().text}>{e().error}</text>
            </box>
            <Section title="Answer" />
            <Options {...pick()} show={all()} />
            <Show when={!props.choices.length}>
              <NotYet />
            </Show>
          </box>
        )}
      </Match>
      <Match when={d.kind === "decision" && d}>
        {(dec: Accessor<Extract<ItemDetail, { kind: "decision" }>>) => (
          <box flexDirection="column">
            <Markdown content={dec().body} links={links} />
            <Show when={dec().inputs.length}>
              <text fg={theme().muted} marginTop={1}>
                Choosing asks for: {dec().inputs.map((i) => `${i.label}${i.required ? "" : " (optional)"}`).join(", ")}
              </text>
            </Show>
            <Section title="Answer" />
            <Options {...pick()} show={all()} />
            <Show when={!props.choices.length}>
              <NotYet />
            </Show>
          </box>
        )}
      </Match>
      <Match when={d.kind === "recovery" && d}>
        {(r: Accessor<Extract<ItemDetail, { kind: "recovery" }>>) => (
          <box flexDirection="column">
            <text fg={theme().text}>{props.item.whyNow}</text>
            <Markdown content={r().summary} links={links} />
            <Show when={r().cause}>
              <text fg={theme().muted}>Cause: {r().cause!.replace(/_/g, " ")}</text>
            </Show>
            <Section title="Resolve" />
            <Options {...pick()} show={all()} />
            <Show when={!props.choices.length}>
              <NotYet />
            </Show>
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
              <Markdown content={b().description!} links={links} />
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
        <text fg={theme().muted}>{ago(props.item.createdAt, props.now)}</text>
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
