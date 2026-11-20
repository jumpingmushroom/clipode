import { createCliRenderer } from "@opentui/core"
import { useKeymapSelector } from "@opentui/keymap/solid"
import { formatKeySequence } from "@opentui/keymap/extras"
import { render, useRenderer } from "@opentui/solid"
import { homedir } from "node:os"
import { join } from "node:path"
import { createSignal, Show, type ParentProps } from "solid-js"
import { configDir, loadConfig, type Config } from "./config.ts"
import { useCommands, type AppCommand } from "./keymap/commands.tsx"
import { CommandPalette, HelpDialog } from "./keymap/palette.tsx"
import { KeysProvider } from "./keymap/provider.tsx"
import { createStateWriter, loadState } from "./state.ts"
import { ThemeProvider, useTheme } from "./theme/context.tsx"
import type { ThemeJson } from "./theme/format.ts"
import { discoverThemes, type Mode } from "./theme/registry.ts"
import { DialogProvider, useDialog } from "./ui/dialog.tsx"
import { openThemeDialog } from "./ui/dialog-theme.tsx"
import { Toast, ToastProvider, useToast } from "./ui/toast.tsx"
import { Wordmark } from "./ui/wordmark.tsx"

export type AppProps = {
  version: string
  config?: Config
  themes?: Record<string, ThemeJson>
  mode?: Mode
  themeName?: string
  onThemeChange?: (name: string | undefined) => void
}

/** Every provider the screens need, in dependency order. */
export function Providers(props: ParentProps<AppProps>) {
  return (
    <ThemeProvider name={props.themeName ?? props.config?.theme} mode={props.config?.mode ?? props.mode} themes={props.themes} onChange={props.onThemeChange}>
      <KeysProvider leader={props.config?.leader}>
        <ToastProvider>
          <DialogProvider>
            {props.children}
            <Toast />
          </DialogProvider>
        </ToastProvider>
      </KeysProvider>
    </ThemeProvider>
  )
}

export function App(props: AppProps) {
  return (
    <Providers {...props}>
      <Home version={props.version} overrides={props.config?.keybinds} />
    </Providers>
  )
}

function Home(props: { version: string; overrides?: Record<string, string> }) {
  const renderer = useRenderer()
  const theme = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const pending = useKeymapSelector((k) => k.getPendingSequence())
  const [quitArmed, setQuitArmed] = createSignal(false)

  const commands: AppCommand[] = [
    { name: "app.palette", title: "Command palette", category: "App", keys: "ctrl+p", hidden: true, run: () => dialog.replace(() => <CommandPalette />) },
    { name: "app.help", title: "Help", category: "App", keys: "<leader>h,?", run: () => dialog.replace(() => <HelpDialog />, undefined, "large") },
    { name: "app.theme", title: "Switch theme", category: "View", keys: "<leader>shift+t,ctrl+t", run: () => openThemeDialog(dialog, theme) },
    { name: "app.quit", title: "Quit", category: "App", keys: "<leader>q", run: () => renderer.destroy() },
    {
      name: "app.interrupt",
      title: "Quit (press twice)",
      category: "App",
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
  useCommands(() => commands, { overrides: props.overrides })

  return (
    <box width="100%" height="100%" backgroundColor={theme.theme().background} flexDirection="column">
      <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <Wordmark theme={theme.theme()} />
        <text fg={theme.theme().muted} marginTop={1}>
          a terminal client for Paperclip
        </text>
      </box>
      <box flexDirection="row" paddingLeft={1} paddingRight={1} height={1}>
        <text fg={theme.theme().muted} flexGrow={1}>
          <Show when={pending().length > 0} fallback="ctrl+p commands  ? help  ctrl+t theme  ctrl+x q quit">
            {formatKeySequence(pending(), { tokenDisplay: { leader: "ctrl+x" } })} …
          </Show>
        </text>
        <text fg={theme.theme().muted}>clipode {props.version}</text>
      </box>
    </box>
  )
}

export async function run(version: string) {
  const { config, error } = await loadConfig()
  const state = createStateWriter(await loadState())
  const themes = await discoverThemes([join(configDir(), "themes"), join(homedir(), ".config", "opencode", "themes")])
  const renderer = await createCliRenderer({ exitOnCtrlC: false, useMouse: config.mouse ?? true, targetFps: 60 })
  const mode = config.mode ?? (await renderer.waitForThemeMode(1000)) ?? "dark"
  const destroyed = new Promise<void>((resolve) => renderer.once("destroy", () => resolve()))
  await render(
    () => (
      <App
        version={version}
        config={config}
        themes={themes}
        mode={mode}
        themeName={state.get().theme ?? config.theme}
        onThemeChange={(theme) => void state.update({ theme })}
      />
    ),
    renderer,
  )
  await destroyed
  await renderer.closed.catch(() => {})
  if (error) console.error(`clipode: ${error}`)
}
