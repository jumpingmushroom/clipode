// Chooses what to show from the session: starting, sign-in, company picker, or the signed-in screens.
import { useKeymapSelector } from "@opentui/keymap/solid"
import { formatKeySequence } from "@opentui/keymap/extras"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import type { Config } from "../config.ts"
import { useCommands, type AppCommand } from "../keymap/commands.tsx"
import { CommandPalette, HelpDialog } from "../keymap/palette.tsx"
import { useRoute } from "../route.tsx"
import { useCompany, useStores } from "../store/context.tsx"
import { startLiveSync } from "../store/live.ts"
import { watchNewItems } from "../store/new-items.ts"
import { useTheme } from "../theme/context.tsx"
import { useDialog } from "../ui/dialog.tsx"
import { openThemeDialog } from "../ui/dialog-theme.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { useToast } from "../ui/toast.tsx"
import { Wordmark } from "../ui/wordmark.tsx"
import { isCompiled, update } from "../update.ts"
import { CompanyPickerScreen, useCompanyDialog } from "./company-picker.tsx"
import { SIDEBAR_MIN_COLUMNS } from "./frame.tsx"
import { InboxScreen } from "./inbox.tsx"
import { ItemScreen } from "./item.tsx"
import { SignInScreen } from "./sign-in.tsx"
import { TasksScreen } from "./tasks.tsx"
import { ThreadScreen } from "./thread.tsx"
import { RunScreen } from "./run.tsx"
import { AgentsScreen } from "./agents.tsx"
import { AgentScreen } from "./agent.tsx"
import { KIND_LABELS } from "./inbox-row.tsx"
import { SettingsDialog } from "./settings.tsx"
import { TabsProvider, useTabs } from "./tabs.tsx"
import { PluginHostProvider, usePluginHost } from "../plugin/host.tsx"
import type { LoadedPlugin, PluginError } from "../plugin/loader.ts"
import { sidebarFooter } from "../sidebar/footer.tsx"

export type ShellProps = {
  version: string
  config?: Config
  /** Open tabs per company, from kv.json. */
  tabs?: Record<string, string[]>
  onTabs?: (companyId: string, ids: string[]) => void
  plugins?: LoadedPlugin[]
  pluginErrors?: PluginError[]
  onRestart?: () => void
}

export function Shell(props: ShellProps) {
  const { session } = useStores()
  onMount(() => {
    if (session.state.status === "starting") void session.start()
  })
  return (
    <Switch>
      <Match when={session.state.status === "starting"}>
        <Starting />
      </Match>
      <Match when={session.state.status === "signed-out" || session.state.status === "signing-in"}>
        <SignInScreen version={props.version} />
      </Match>
      <Match when={!session.state.companyId}>
        <CompanyPickerScreen />
      </Match>
      <Match when={session.state.companyId} keyed>
        {/* Keyed on the company, so a switch rebuilds the screens with the new company's stores. */}
        <TabsProvider initial={props.tabs?.[session.state.companyId!]} onChange={(ids) => props.onTabs?.(session.state.companyId!, ids)}>
          <PluginHostProvider
            plugins={[{ plugin: sidebarFooter(props.version), options: {}, source: "built-in" }, ...(props.plugins ?? [])]}
            errors={props.pluginErrors}
          >
            <Main version={props.version} config={props.config} onRestart={props.onRestart} />
          </PluginHostProvider>
        </TabsProvider>
      </Match>
    </Switch>
  )
}

function Starting() {
  const { theme } = useTheme()
  return (
    <box width="100%" height="100%" backgroundColor={theme().background} alignItems="center" justifyContent="center" flexDirection="column">
      <Wordmark theme={theme()} />
      <box flexDirection="row" marginTop={2}>
        <Spinner color={theme().accent} />
        <text fg={theme().muted}> connecting</text>
      </box>
    </box>
  )
}

function Main(props: { version: string; config?: Config; onRestart?: () => void }) {
  const renderer = useRenderer()
  const theme = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const route = useRoute()
  const { session } = useStores()
  const dimensions = useTerminalDimensions()
  const openCompanies = useCompanyDialog()
  const tabs = useTabs()!
  const pending = useKeymapSelector((k) => k.getPendingSequence())
  const [quitArmed, setQuitArmed] = createSignal(false)
  const [sidebar, setSidebar] = createSignal(props.config?.sidebar !== "hide")
  const [focused, setFocused] = createSignal(true)
  const company = useCompany()
  const host = usePluginHost()
  const live = startLiveSync(session, company, { poll: props.config?.polling, focused, onEvent: (e) => host?.emit(e) })
  const onFocus = () => setFocused(true)
  const onBlur = () => setFocused(false)
  renderer.on("focus", onFocus)
  renderer.on("blur", onBlur)
  if (props.config?.notifications !== false) {
    // Only while you look elsewhere; a terminal that cannot report focus always gets them.
    watchNewItems(() => company.attention.feed.data.items, () => !!company.attention.feed.loadedAt, (items) => {
      if (focused() && renderer.capabilities?.focus_tracking) return
      const one = items[0]!
      renderer.triggerNotification(
        items.length === 1 ? `${KIND_LABELS[one.kind][0]}${one.identifier ? ` on ${one.identifier}` : ""}: ${one.title}` : `${items.length} new items in the inbox`,
        "clipode",
      )
    })
  }
  onCleanup(() => {
    live.stop()
    renderer.off("focus", onFocus)
    renderer.off("blur", onBlur)
  })

  const commands: AppCommand[] = [
    { name: "app.palette", title: "Command palette", category: "App", keys: "ctrl+p", hidden: true, run: () => dialog.replace(() => <CommandPalette />) },
    { name: "app.help", title: "Help", category: "App", keys: "<leader>h,?", run: () => dialog.replace(() => <HelpDialog />, undefined, "large") },
    { name: "go.inbox", title: "Inbox", category: "Go to", keys: "<leader>i,g i", run: () => route.reset({ name: "inbox" }) },
    { name: "go.tasks", title: "Tasks", category: "Go to", keys: "<leader>t,g t", run: () => route.reset({ name: "tasks" }) },
    { name: "go.agents", title: "Agents", category: "Go to", keys: "<leader>a,g a", run: () => route.reset({ name: "agents" }) },
    ...Array.from({ length: 9 }, (_, i): AppCommand => ({ name: `tabs.${i + 1}`, title: `Tab ${i + 1}`, category: "Tabs", keys: `<leader>${i + 1}`, hidden: true, run: () => tabs.jump(i) })),
    { name: "tabs.next", title: "Next tab", category: "Tabs", keys: "<leader>.", run: () => tabs.cycle(1) },
    { name: "tabs.previous", title: "Previous tab", category: "Tabs", keys: "<leader>comma", run: () => tabs.cycle(-1) },
    { name: "tabs.close", title: "Close tab", category: "Tabs", keys: "<leader>w", run: () => tabs.close() },
    {
      name: "app.settings",
      title: "Settings",
      category: "App",
      keys: "<leader>s",
      run: () => dialog.replace(() => <SettingsDialog sidebar={sidebar()} toggleSidebar={() => setSidebar((v) => !v)} openCompanies={openCompanies} version={props.version} />),
    },
    { name: "view.sidebar", title: "Toggle sidebar", category: "View", keys: "ctrl+b", run: () => setSidebar((v) => !v) },
    { name: "app.theme", title: "Switch theme", category: "View", keys: "<leader>shift+t,ctrl+t", run: () => openThemeDialog(dialog, theme) },
    { name: "session.reconnect", title: "Reconnect", category: "Session", keys: "ctrl+r", run: () => live.reconnect() },
    { name: "session.company", title: "Switch company", category: "Session", keys: "<leader>c", run: openCompanies },
    { name: "session.signout", title: "Sign out", category: "Session", run: () => void session.signOut() },
    {
      name: "app.update",
      title: "Update clipode",
      category: "App",
      run: async () => {
        if (!isCompiled()) return toast.show("Updates apply to an installed binary; use git pull in a source checkout.", "info")
        toast.show("Checking for updates…", "info", 2000)
        try {
          const result = await update({ current: props.version, target: process.execPath })
          if (result.status === "current") return toast.show(`clipode ${result.version} is the latest release.`, "success")
          toast.show(`Updated to ${result.version}. Restarting…`, "success")
          setTimeout(() => props.onRestart?.(), 1200)
        } catch (err) {
          toast.error(err)
        }
      },
    },
    { name: "app.quit", title: "Quit", category: "Session", keys: "<leader>q", run: () => renderer.destroy() },
    {
      name: "app.interrupt",
      title: "Quit (press twice)",
      category: "Session",
      keys: "ctrl+c",
      hidden: true,
      run: () => {
        if (quitArmed()) return renderer.destroy()
        setQuitArmed(true)
        toast.show("Press ctrl+c again to quit", "info", 2000)
        setTimeout(() => setQuitArmed(false), 2000).unref?.()
      },
    },
  ]
  useCommands(() => commands)

  const param = (name: "item" | "thread" | "run" | "agent") => {
    const r = route.current()
    return r.name === name ? r.id : undefined
  }
  // With the sidebar set to "auto", it follows the terminal width; ctrl+b overrides either way.
  const showSidebar = () => sidebar() && (props.config?.sidebar === "show" || dimensions().width >= SIDEBAR_MIN_COLUMNS)

  return (
    <box width="100%" height="100%">
      <Switch>
        <Match when={param("item")} keyed>
          {(id: string) => <ItemScreen id={id} version={props.version} sidebar={showSidebar()} />}
        </Match>
        <Match when={param("thread")} keyed>
          {(id: string) => <ThreadScreen id={id} version={props.version} sidebar={showSidebar()} />}
        </Match>
        <Match when={param("run")} keyed>
          {(id: string) => <RunScreen id={id} version={props.version} sidebar={showSidebar()} />}
        </Match>
        <Match when={param("agent")} keyed>
          {(id: string) => <AgentScreen id={id} version={props.version} sidebar={showSidebar()} />}
        </Match>
        <Match when={route.current().name === "agents"}>
          <AgentsScreen version={props.version} sidebar={showSidebar()} />
        </Match>
        <Match when={route.current().name === "tasks"}>
          <TasksScreen version={props.version} sidebar={showSidebar()} />
        </Match>
        <Match when={true}>
          <InboxScreen version={props.version} sidebar={showSidebar()} />
        </Match>
      </Switch>
      <Show when={pending().length > 0}>
        <box position="absolute" bottom={0} left={1} zIndex={100}>
          <text fg={theme.theme().text} bg={theme.theme().selection}>
            {` ${formatKeySequence(pending(), { tokenDisplay: { leader: "ctrl+x" } })} … `}
          </text>
        </box>
      </Show>
    </box>
  )
}
