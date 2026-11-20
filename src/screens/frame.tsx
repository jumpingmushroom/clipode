// The frame every screen shares: header, main column, optional sidebar, read-only composer row, footer.
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createSignal, For, onCleanup, Show, type JSX, type ParentProps } from "solid-js"
import { useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"

export const SIDEBAR_WIDTH = 32
/** Below this width the sidebar is hidden, as in the 80-column mockup frames. */
export const SIDEBAR_MIN_COLUMNS = 100

export type Hint = [key: string, label: string]

export function Frame(
  props: ParentProps<{
    view: string
    badge?: number | null
    sidebar?: JSX.Element
    showSidebar?: boolean
    hints: Hint[]
    /** Shorter hints for narrow terminals. */
    narrowHints?: Hint[]
    version: string
  }>,
) {
  const { theme } = useTheme()
  const { session, company } = useStores()
  const dimensions = useTerminalDimensions()
  const wide = () => dimensions().width >= SIDEBAR_MIN_COLUMNS
  const sidebarShown = () => wide() && props.showSidebar !== false && !!props.sidebar
  const companyName = () => session.state.companies.find((c) => c.id === company()?.companyId)?.name ?? ""
  const connection = () => session.state.connection
  const dot = () => ({ live: theme().success, polling: theme().warning, offline: theme().error, connecting: theme().muted })[connection()]
  const hints = () => (wide() ? props.hints : (props.narrowHints ?? props.hints))
  const [now, setNow] = createSignal(Date.now())
  const clock = setInterval(() => setNow(Date.now()), 1000)
  onCleanup(() => clearInterval(clock))
  /** "reconnecting in 8s (attempt 3)" while the WebSocket is down. */
  const retry = () => {
    const at = session.state.retryAt
    if (!at || connection() === "live") return ""
    return `reconnecting in ${Math.max(0, Math.ceil((at - now()) / 1000))}s (attempt ${session.state.attempt})`
  }

  return (
    <box width="100%" height="100%" flexDirection="column" backgroundColor={theme().background}>
      <box flexDirection="row" height={1} backgroundColor={theme().panel} paddingLeft={1} paddingRight={1}>
        <box flexGrow={1} flexBasis={0}>
          <text fg={theme().text} attributes={TextAttributes.BOLD} wrapMode="none">
            {companyName()}
          </text>
        </box>
        <text fg={theme().muted}>{props.view}</text>
        <box flexGrow={1} flexBasis={0} alignItems="flex-end">
          <text fg={theme().muted}>
            inbox <span style={{ fg: theme().accent, attributes: TextAttributes.BOLD }}>{props.badge ?? "–"}</span>
          </text>
        </box>
      </box>
      <box flexDirection="row" flexGrow={1} paddingTop={1}>
        <box flexGrow={1} flexDirection="column">
          {props.children}
        </box>
        <Show when={sidebarShown()}>
          <box width={SIDEBAR_WIDTH} flexShrink={0} paddingLeft={2} paddingRight={2} flexDirection="column">
            {props.sidebar}
          </box>
        </Show>
      </box>
      <box flexDirection="row" height={1} paddingLeft={1} paddingRight={sidebarShown() ? SIDEBAR_WIDTH + 1 : 1}>
        <box flexGrow={1} backgroundColor={theme().panel} paddingLeft={2}>
          <text fg={theme().muted}>read-only - replies arrive in a later version</text>
        </box>
      </box>
      <box flexDirection="row" height={1} paddingLeft={1} paddingRight={1} gap={2}>
        <text fg={theme().text} flexShrink={0}>
          <span style={{ fg: dot() }}>●</span> {connection()}
        </text>
        <Show when={retry()}>
          <text fg={theme().muted} flexShrink={0}>
            {retry()}  <span style={{ fg: theme().text }}>ctrl+r</span> retry
          </text>
        </Show>
        <Show when={wide() && !retry()}>
          <text fg={theme().muted} flexShrink={0}>
            {session.host()}
          </text>
        </Show>
        <box flexDirection="row" gap={2} flexGrow={1} overflow="hidden">
          <For each={hints()}>
            {([key, label]) => (
              <text fg={theme().text} flexShrink={0} wrapMode="none">
                {key} <span style={{ fg: theme().muted }}>{label}</span>
              </text>
            )}
          </For>
        </box>
        <text fg={theme().muted} flexShrink={0}>
          clipode {props.version}
        </text>
      </box>
    </box>
  )
}
