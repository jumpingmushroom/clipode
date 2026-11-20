import { createCliRenderer } from "@opentui/core"
import { render } from "@opentui/solid"
import { homedir } from "node:os"
import { join } from "node:path"
import type { ParentProps } from "solid-js"
import { configDir, loadConfig, type Config } from "./config.ts"
import { KeysProvider } from "./keymap/provider.tsx"
import { RouteProvider, type Route } from "./route.tsx"
import { Shell } from "./screens/shell.tsx"
import { createStateWriter, loadState } from "./state.ts"
import { StoresProvider } from "./store/context.tsx"
import { createSession, type Session } from "./store/session.ts"
import { ThemeProvider } from "./theme/context.tsx"
import type { ThemeJson } from "./theme/format.ts"
import { discoverThemes, type Mode } from "./theme/registry.ts"
import { loadPlugins, type LoadedPlugin, type PluginError } from "./plugin/loader.ts"
import { DialogProvider } from "./ui/dialog.tsx"
import { Toast, ToastProvider } from "./ui/toast.tsx"

export type AppProps = {
  version: string
  session: Session
  config?: Config
  themes?: Record<string, ThemeJson>
  mode?: Mode
  themeName?: string
  onThemeChange?: (name: string | undefined) => void
  route?: Route
  tabs?: Record<string, string[]>
  onTabs?: (companyId: string, ids: string[]) => void
  plugins?: LoadedPlugin[]
  pluginErrors?: PluginError[]
}

/** Every provider the screens need, in dependency order. */
export function Providers(props: ParentProps<Omit<AppProps, "version">>) {
  return (
    <ThemeProvider name={props.themeName ?? props.config?.theme} mode={props.config?.mode ?? props.mode} themes={props.themes} onChange={props.onThemeChange}>
      <KeysProvider leader={props.config?.leader}>
        <StoresProvider session={props.session}>
          <RouteProvider initial={props.route}>
            <ToastProvider>
              <DialogProvider>
                {props.children}
                <Toast />
              </DialogProvider>
            </ToastProvider>
          </RouteProvider>
        </StoresProvider>
      </KeysProvider>
    </ThemeProvider>
  )
}

export function App(props: AppProps) {
  return (
    <Providers {...props}>
      <Shell
        version={props.version}
        config={props.config}
        tabs={props.tabs}
        onTabs={props.onTabs}
        plugins={props.plugins}
        pluginErrors={props.pluginErrors}
      />
    </Providers>
  )
}

export async function run(version: string) {
  const { config, error } = await loadConfig()
  const state = createStateWriter(await loadState())
  const { plugins, errors: pluginErrors } = await loadPlugins(config.plugins ?? [], configDir())
  const themes = await discoverThemes([join(configDir(), "themes"), join(homedir(), ".config", "opencode", "themes")])
  const session = createSession({
    url: config.url,
    lastCompany: state.get().lastCompany,
    onCompany: (url, id) => void state.update({ lastCompany: { ...state.get().lastCompany, [url]: id } }),
  })
  const renderer = await createCliRenderer({ exitOnCtrlC: false, useMouse: config.mouse ?? true, targetFps: 60 })
  const mode = config.mode ?? (await renderer.waitForThemeMode(1000)) ?? "dark"
  const destroyed = new Promise<void>((resolve) => renderer.once("destroy", () => resolve()))
  await render(
    () => (
      <App
        version={version}
        session={session}
        config={config}
        themes={themes}
        mode={mode}
        themeName={state.get().theme ?? config.theme}
        onThemeChange={(theme) => void state.update({ theme })}
        tabs={state.get().tabs}
        onTabs={(companyId, ids) => void state.update({ tabs: { ...state.get().tabs, [companyId]: ids } })}
        plugins={plugins}
        pluginErrors={pluginErrors}
      />
    ),
    renderer,
  )
  await destroyed
  await renderer.closed.catch(() => {})
  if (error) console.error(`clipode: ${error}`)
}
