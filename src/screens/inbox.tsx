// The home screen: attention items on three shelves plus a collapsed Snoozed group.
import { RGBA, TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useCommands } from "../keymap/commands.tsx"
import { useRoute } from "../route.tsx"
import type { InboxItem } from "../store/attention.ts"
import { useCompany, useStores } from "../store/context.tsx"
import { SNOOZE_CHOICES, snoozeUntil } from "../store/snooze.ts"
import { createDialogs } from "../plugin/dialogs.tsx"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"
import { groupByShelf, SHELVES } from "../store/shelves.ts"
import { useTheme } from "../theme/context.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { Frame, SIDEBAR_MIN_COLUMNS, SIDEBAR_WIDTH } from "./frame.tsx"
import { columns, InboxRow } from "./inbox-row.tsx"
import { InboxSidebar } from "./inbox-sidebar.tsx"
import { Slot } from "../plugin/host.tsx"

type Row = { type: "item"; item: InboxItem } | { type: "snoozed"; count: number }

export function InboxScreen(props: { version: string; sidebar: boolean }) {
  const { theme } = useTheme()
  const company = useCompany()
  const route = useRoute()
  const dimensions = useTerminalDimensions()
  const attention = company.attention
  const [selected, setSelected] = createSignal(0)
  const [showSnoozed, setShowSnoozed] = createSignal(false)
  const [now, setNow] = createSignal(Date.now())
  let scroll: ScrollBoxRenderable | undefined

  onMount(() => {
    void attention.feed.load()
    void company.agents.list.load()
    void company.issues.list.load()
    void company.runs.live.load()
  })
  const tick = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(tick))

  const items = () => attention.items()
  const shelves = createMemo(() => groupByShelf(items(), new Date(now())))
  // Rows in display order: shelf items, then the Snoozed toggle and, when open, its items.
  const rows = createMemo<Row[]>(() => {
    const g = shelves()
    const list: Row[] = [...g.decide, ...g.today, ...g.earlier].map((item) => ({ type: "item", item }))
    if (g.snoozed.length) {
      list.push({ type: "snoozed", count: g.snoozed.length })
      if (showSnoozed()) list.push(...g.snoozed.map((item): Row => ({ type: "item", item })))
    }
    return list
  })
  const current = () => rows()[Math.min(selected(), rows().length - 1)]
  const agentName = (item: InboxItem) => item.agentName ?? company.agents.byId(item.agentId)?.name ?? "—"

  const wide = () => dimensions().width >= SIDEBAR_MIN_COLUMNS
  const mainWidth = () => dimensions().width - (wide() && props.sidebar ? SIDEBAR_WIDTH : 0) - 2
  const cols = () => columns(mainWidth(), Math.max(7, ...items().map((i) => (i.identifier ?? "").length)))

  const move = (delta: number) => {
    const count = rows().length
    if (!count) return
    const next = Math.max(0, Math.min(count - 1, selected() + delta))
    setSelected(next)
    scroll?.scrollChildIntoView(`inbox-row-${next}`)
  }
  const open = () => {
    const row = current()
    if (!row) return
    if (row.type === "snoozed") return setShowSnoozed((v) => !v)
    route.navigate({ name: "item", id: row.item.id })
  }

  useBindings(() => ({
    mode: "base",
    bindings: [
      { key: "down,j", cmd: () => move(1) },
      { key: "up,k", cmd: () => move(-1) },
      { key: "pagedown", cmd: () => move(10) },
      { key: "pageup", cmd: () => move(-10) },
      { key: "home", cmd: () => move(-rows().length) },
      { key: "end", cmd: () => move(rows().length) },
      { key: "return", cmd: open },
    ],
  }))
  const { session } = useStores()
  const toast = useToast()
  const dialogs = createDialogs(useDialog())
  // The last item dismissed or snoozed in this session, so u can bring it back from anywhere in the list.
  let lastPut: InboxItem | undefined
  const selectedItem = () => {
    const row = current()
    return row?.type === "item" ? row.item : undefined
  }
  const run = async (done: string, action: () => Promise<void>) => {
    try {
      await action()
      toast.show(done, "success")
    } catch (err) {
      toast.error(err)
    }
  }
  const dismiss = () => {
    const item = selectedItem()
    if (!item || item.snoozed) return
    lastPut = item
    void run("Dismissed · u to undo", () => attention.dismiss(item))
  }
  const snooze = () => {
    const item = selectedItem()
    if (!item || item.snoozed) return
    afterDispatch(async () => {
      const choice = await dialogs.select("Snooze until", SNOOZE_CHOICES.map((c) => ({ title: c.title, value: c.value })))
      if (!choice) return
      lastPut = item
      void run(`Snoozed until ${SNOOZE_CHOICES.find((c) => c.value === choice)!.title.toLowerCase()} · u to undo`, () => attention.snooze(item, snoozeUntil(choice)))
    })
  }
  const restore = () => {
    const selected = selectedItem()
    const item = selected?.snoozed ? selected : (lastPut && attention.items().find((i) => i.id === lastPut!.id && i.snoozed))
    if (!item) return toast.show("Select a snoozed item to restore", "info", 2000)
    lastPut = undefined
    void run("Restored", () => attention.restore(item))
  }

  useCommands(() => [
    ...(session.client().writes
      ? [
          { name: "inbox.dismiss", title: "Dismiss item", category: "Inbox", keys: "d", run: dismiss },
          { name: "inbox.snooze", title: "Snooze item", category: "Inbox", keys: "s", run: snooze },
          { name: "inbox.restore", title: "Restore a dismissed or snoozed item", category: "Inbox", keys: "u", run: restore },
        ]
      : []),
    { name: "inbox.sort", title: "Sort by activity or decide-by", category: "View", keys: "tab", run: () => attention.setSort(attention.sort() === "activity" ? "decide" : "activity") },
    { name: "inbox.refresh", title: "Refresh", category: "View", keys: "r", run: () => void attention.refresh() },
  ])

  const indexOf = (row: Row) => rows().indexOf(row)
  const rowFor = (item: InboxItem) => rows().find((r) => r.type === "item" && r.item === item)!

  return (
    <Frame
      view="Inbox"
      badge={attention.badge()}
      showSidebar={props.sidebar}
      sidebar={<InboxSidebar items={items()} now={now()} />}
      hints={[["j/k", "move"], ["enter", "open"], ...(session.client().writes ? ([["d", "dismiss"], ["s", "snooze"]] as [string, string][]) : []), ["tab", "sort"], ["g", "go to"], ["ctrl+p", "commands"], ["?", "help"]]}
      narrowHints={[["j/k", "move"], ["enter", "open"], ["^p", "cmds"]]}
      version={props.version}
    >
      <box flexDirection="row" paddingLeft={2} paddingRight={2} height={1}>
        <text fg={theme().text} flexGrow={1} wrapMode="none">
          <span style={{ attributes: TextAttributes.BOLD }}>Inbox</span>
          {"   "}
          <SortTab label="Latest" active={attention.sort() === "activity"} />
          {"  "}
          <SortTab label="Decide by" active={attention.sort() === "decide"} />
        </text>
        <Switch>
          <Match when={attention.feed.status === "loading"}>
            <box flexDirection="row">
              <Spinner color={theme().accent} />
              <text fg={theme().muted}> loading</text>
            </box>
          </Match>
          <Match when={attention.feed.status === "error" && attention.feed.loadedAt}>
            <text fg={theme().error}>refresh failed · r retry</text>
          </Match>
        </Switch>
      </box>
      <Switch>
        <Match when={attention.feed.status === "error" && !attention.feed.loadedAt}>
          <box paddingLeft={2} paddingTop={1} flexDirection="column">
            <text fg={theme().error}>✗ Could not load the inbox</text>
            <text fg={theme().muted}>{attention.feed.error}</text>
            <text fg={theme().muted}>r retry</text>
          </box>
        </Match>
        <Match when={!attention.feed.loadedAt}>
          <Skeleton width={mainWidth()} />
        </Match>
        <Match when={rows().length === 0}>
          <box flexGrow={1} alignItems="center" justifyContent="center" flexDirection="column">
            <text fg={theme().success}>
              ✓ <span style={{ fg: theme().text }}>Nothing needs you</span>
            </text>
            <text fg={theme().muted} marginTop={1}>
              Agents ask here when they need a decision.
            </text>
            <text fg={theme().muted}>
              {company.runs.live.data.length} live runs · {company.issues.inFlight().length} tasks in flight
            </text>
          </box>
        </Match>
        <Match when={true}>
          <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} flexGrow={1} paddingTop={1} scrollbarOptions={{ visible: false }}>
            <For each={SHELVES.filter((s) => s.id !== "snoozed" && shelves()[s.id].length > 0)}>
              {(shelf) => (
                <box flexDirection="column" marginBottom={1}>
                  <ShelfHeader title={shelf.title} count={shelves()[shelf.id].length} />
                  <For each={shelves()[shelf.id]}>
                    {(item) => (
                      <box id={`inbox-row-${indexOf(rowFor(item))}`} onMouseDown={() => setSelected(indexOf(rowFor(item)))} onMouseUp={open}>
                        <InboxRow item={item} agentName={agentName(item)} selected={current() === rowFor(item)} cols={cols()} theme={theme()} now={now()} />
                      </box>
                    )}
                  </For>
                </box>
              )}
            </For>
            <For each={rows().filter((r): r is Extract<Row, { type: "snoozed" }> => r.type === "snoozed")}>
              {(row) => (
                <box flexDirection="column">
                  <box
                    id={`inbox-row-${indexOf(row)}`}
                    paddingLeft={2}
                    backgroundColor={current() === row ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                    onMouseUp={() => setShowSnoozed((v) => !v)}
                  >
                    <text fg={theme().muted}>
                      {`${showSnoozed() ? "▾" : "▸"} Snoozed  ${row.count}`}
                    </text>
                  </box>
                  <Show when={showSnoozed()}>
                    <For each={shelves().snoozed}>
                      {(item) => (
                        <box id={`inbox-row-${indexOf(rowFor(item))}`} onMouseDown={() => setSelected(indexOf(rowFor(item)))} onMouseUp={open}>
                          <InboxRow item={item} agentName={agentName(item)} selected={current() === rowFor(item)} cols={cols()} theme={theme()} now={now()} />
                        </box>
                      )}
                    </For>
                  </Show>
                </box>
              )}
            </For>
          </scrollbox>
        </Match>
      </Switch>
      <box paddingLeft={2} paddingRight={2}>
        <Slot name="home_bottom" />
      </box>
    </Frame>
  )
}

function SortTab(props: { label: string; active: boolean }) {
  const { theme } = useTheme()
  return (
    <span
      style={{
        fg: props.active ? theme().text : theme().muted,
        bg: props.active ? theme().selection : undefined,
        attributes: props.active ? TextAttributes.BOLD : undefined,
      }}
    >
      {` ${props.label} `}
    </span>
  )
}

function ShelfHeader(props: { title: string; count: number }) {
  const { theme } = useTheme()
  return (
    <box paddingLeft={2}>
      <text fg={theme().text}>
        <span style={{ attributes: TextAttributes.BOLD }}>{props.title}</span>
        <span style={{ fg: theme().muted }}>{`  ${props.count}`}</span>
      </text>
    </box>
  )
}

/** Placeholder rows while the first load runs, as in the mockup's loading frame. */
function Skeleton(props: { width: number }) {
  const { theme } = useTheme()
  const lengths = [[26, 22, 26], [20, 24], [38, 28]]
  const titles = ["Decide now", "New today", "Earlier"]
  const tail = "░░░░░░░  ░░░░░     ░░░"
  return (
    <box flexDirection="column" paddingTop={1} paddingLeft={2}>
      <For each={lengths}>
        {(group, i) => (
          <box flexDirection="column" marginBottom={1}>
            <text fg={theme().muted} attributes={TextAttributes.BOLD}>
              {titles[i()]}
            </text>
            <For each={group}>
              {(n) => (
                <text fg={theme().border} wrapMode="none">
                  {("░ " + "░".repeat(Math.min(n, props.width - 30))).padEnd(Math.max(0, props.width - tail.length - 2)) + tail}
                </text>
              )}
            </For>
          </box>
        )}
      </For>
    </box>
  )
}
