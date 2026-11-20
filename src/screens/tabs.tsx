// Tasks opened in this session, shown as a one-line tab bar when more than one is open.
import { RGBA } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createContext, createSignal, For, Show, useContext, type ParentProps } from "solid-js"
import { useRoute } from "../route.tsx"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { truncate } from "../ui/format.ts"
import { Spinner } from "../ui/spinner.tsx"

const MAX_TABS = 9

function init(initial: string[], onChange?: (ids: string[]) => void) {
  const route = useRoute()
  const [tabs, setTabs] = createSignal(initial.slice(0, MAX_TABS))
  const update = (next: string[]) => {
    setTabs(next)
    onChange?.(next)
  }
  const current = () => {
    const r = route.current()
    return r.name === "thread" ? r.id : null
  }
  const go = (id: string) => (current() === id ? undefined : route.navigate({ name: "thread", id }))
  return {
    tabs,
    current,
    /** Adds a task when its thread opens; the oldest tab goes when there are nine. */
    open(id: string) {
      if (!tabs().includes(id)) update([...tabs(), id].slice(-MAX_TABS))
    },
    close(id = current()) {
      if (!id) return
      const index = tabs().indexOf(id)
      const next = tabs().filter((t) => t !== id)
      update(next)
      if (current() === id) {
        const neighbour = next[Math.min(index, next.length - 1)]
        if (neighbour) route.navigate({ name: "thread", id: neighbour })
        else route.reset({ name: "inbox" })
      }
    },
    jump(n: number) {
      const id = tabs()[n]
      if (id) go(id)
    },
    cycle(delta: number) {
      const list = tabs()
      if (!list.length) return
      const at = list.indexOf(current() ?? "")
      go(list[(at + delta + list.length) % list.length]!)
    },
  }
}

export type Tabs = ReturnType<typeof init>
const Ctx = createContext<Tabs>()

export function TabsProvider(props: ParentProps<{ initial?: string[]; onChange?: (ids: string[]) => void }>) {
  return <Ctx.Provider value={init(props.initial ?? [], props.onChange)}>{props.children}</Ctx.Provider>
}

export const useTabs = () => useContext(Ctx)

export function TabBar() {
  const tabs = useTabs()
  const { theme } = useTheme()
  const company = useCompany()
  const dimensions = useTerminalDimensions()
  const narrow = () => dimensions().width < 100
  const marker = (id: string) => {
    if (company.runs.live.data.some((r) => r.issueId === id)) return "live"
    const items = company.attention.feed.data.items.filter((i) => !i.snoozed && (i.issueId === id || i.blocked?.identifier === company.issues.byId(id)?.identifier))
    if (items.some((i) => i.kind === "failed_run")) return "error"
    return items.length ? "attention" : null
  }
  return (
    <Show when={tabs && tabs.tabs().length > 1} fallback={<box height={1} />}>
      <box flexDirection="row" height={1} paddingLeft={2} gap={3}>
        <For each={tabs!.tabs()}>
          {(id) => {
            const task = () => company.issues.byId(id)
            const active = () => tabs!.current() === id
            return (
              <box flexDirection="row" onMouseUp={() => tabs!.jump(tabs!.tabs().indexOf(id))} backgroundColor={RGBA.fromInts(0, 0, 0, 0)}>
                <Show when={marker(id) === "live"} fallback={
                  <text fg={marker(id) === "error" ? theme().error : theme().warning}>{marker(id) === "error" ? "✗" : marker(id) === "attention" ? "▲" : " "}</text>
                }>
                  <Spinner color={theme().accent} />
                </Show>
                <text fg={active() ? theme().text : theme().muted} wrapMode="none">
                  {` ${task()?.identifier ?? "…"}${narrow() ? "" : ` ${truncate((task()?.title ?? "").toLowerCase(), 16)}`}`}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    </Show>
  )
}
