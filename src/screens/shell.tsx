// Chooses what to show from the session: starting, sign-in, company picker, or the signed-in screens.
import { useKeymapSelector } from "@opentui/keymap/solid"
import { formatKeySequence } from "@opentui/keymap/extras"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createSignal, Match, onMount, Show, Switch } from "solid-js"
import type { Config } from "../config.ts"
import { useCommands, type AppCommand } from "../keymap/commands.tsx"
import { CommandPalette, HelpDialog } from "../keymap/palette.tsx"
import { useRoute } from "../route.tsx"
import { useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { useDialog } from "../ui/dialog.tsx"
import { openThemeDialog } from "../ui/dialog-theme.tsx"
import { Spinner } from "../ui/spinner.tsx"
import { useToast } from "../ui/toast.tsx"
import { Wordmark } from "../ui/wordmark.tsx"
import { CompanyPickerScreen, useCompanyDialog } from "./company-picker.tsx"
import { SIDEBAR_MIN_COLUMNS } from "./frame.tsx"
import { InboxScreen } from "./inbox.tsx"
import { ItemScreen } from "./item.tsx"
import { SignInScreen } from "./sign-in.tsx"
import { TasksScreen } from "./tasks.tsx"
import { ThreadScreen } from "./thread.tsx"

export function Shell(props: { version: string; config?: Config }) {
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
        <Main version={props.version} config={props.config} />
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

function Main(props: { version: string; config?: Config }) {
  const renderer = useRenderer()
  const theme = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const route = useRoute()
  const { session } = useStores()
  const dimensions = useTerminalDimensions()
  const openCompanies = useCompanyDialog()
  const pending = useKeymapSelector((k) => k.getPendingSequence())
  const [quitArmed, setQuitArmed] = createSignal(false)
  const [sidebar, setSidebar] = createSignal(props.config?.sidebar !== "hide")

  const commands: AppCommand[] = [
    { name: "app.palette", title: "Command palette", category: "App", keys: "ctrl+p", hidden: true, run: () => dialog.replace(() => <CommandPalette />) },
    { name: "app.help", title: "Help", category: "App", keys: "<leader>h,?", run: () => dialog.replace(() => <HelpDialog />, undefined, "large") },
    { name: "go.inbox", title: "Inbox", category: "Go to", keys: "<leader>i,g i", run: () => route.reset({ name: "inbox" }) },
    { name: "go.tasks", title: "Tasks", category: "Go to", keys: "<leader>t,g t", run: () => route.reset({ name: "tasks" }) },
    { name: "view.sidebar", title: "Toggle sidebar", category: "View", keys: "ctrl+b", run: () => setSidebar((v) => !v) },
    { name: "app.theme", title: "Switch theme", category: "View", keys: "<leader>shift+t,ctrl+t", run: () => openThemeDialog(dialog, theme) },
    { name: "session.company", title: "Switch company", category: "Session", keys: "<leader>c", run: openCompanies },
    { name: "session.signout", title: "Sign out", category: "Session", run: () => void session.signOut() },
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
  useCommands(() => commands, { overrides: props.config?.keybinds })

  const param = (name: "item" | "thread") => {
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
