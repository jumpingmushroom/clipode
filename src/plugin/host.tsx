// Runs plugin setup for the selected company and keeps what plugins register: slot renders, commands, event handlers.
// A plugin that throws is reported in a toast and in Settings, and does not stop the app.
import { useKeymap } from "@opentui/keymap/solid"
import { useRenderer } from "@opentui/solid"
import { createContext, createSignal, For, onCleanup, onMount, Show, useContext, type JSX, type ParentProps } from "solid-js"
import type { LiveEvent } from "../api/live.ts"
import { useCommands, type AppCommand } from "../keymap/commands.tsx"
import { useRoute } from "../route.tsx"
import { useCompany, useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"
import * as components from "./components.ts"
import { createDialogs } from "./dialogs.tsx"
import type { LoadedPlugin, PluginError } from "./loader.ts"
import type { Context, PluginCommand, SlotName, SlotProps } from "./types.ts"

type SlotEntry = { key: number; name: SlotName; order: number; render: (props: SlotProps) => JSX.Element }

function init(plugins: LoadedPlugin[], loadErrors: PluginError[]) {
  const { session } = useStores()
  const company = useCompany()
  const route = useRoute()
  const toast = useToast()
  const dialog = useDialog()
  const theme = useTheme()
  const renderer = useRenderer()
  const keymap = useKeymap()
  const [slots, setSlots] = createSignal<SlotEntry[]>([])
  const [commands, setCommands] = createSignal<(PluginCommand & { plugin: string })[]>([])
  const [errors, setErrors] = createSignal<PluginError[]>(loadErrors)
  const listeners = new Set<{ type: string; handler: (e: LiveEvent) => void; plugin: string }>()
  const cleanups: (() => void)[] = []
  let nextKey = 0

  const report = (source: string, err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    setErrors((e) => [...e, { source, message }])
    toast.show(`Plugin ${source} failed: ${message}`, "error")
  }

  const contextFor = (id: string, options: Record<string, unknown>): Context => ({
    id,
    options,
    paperclip: {
      session,
      attention: company.attention,
      issues: company.issues,
      runs: company.runs,
      agents: company.agents,
      on(type, handler) {
        const entry = { type, handler, plugin: id }
        listeners.add(entry)
        return () => listeners.delete(entry)
      },
      get: (path) => session.client().get(path),
    },
    route: { current: route.current, navigate: route.navigate },
    ui: {
      slot(name, render, order = 0) {
        const key = nextKey++
        setSlots((s) => [...s, { key, name, order, render: (props) => guard(id, () => render(props)) }])
        return () => setSlots((s) => s.filter((e) => e.key !== key))
      },
      toast: (message, variant) => toast.show(message, variant),
      dialog: createDialogs(dialog),
      components,
    },
    commands: {
      register(list) {
        const tagged = list.map((c) => ({ ...c, plugin: id }))
        setCommands((c) => [...c, ...tagged])
        return () => setCommands((c) => c.filter((x) => !tagged.includes(x)))
      },
      run: (name) => void keymap.runCommand(name),
    },
    theme: theme.theme,
    renderer,
  })

  /** Renders a plugin's slot content; an exception becomes an error line instead of breaking the screen. */
  function guard(plugin: string, render: () => JSX.Element): JSX.Element {
    try {
      return render()
    } catch (err) {
      report(plugin, err)
      return <text fg={theme.theme().error}>plugin {plugin} failed</text>
    }
  }

  onMount(() => {
    for (const { plugin, options, source } of plugins) {
      Promise.resolve()
        .then(() => plugin.setup(contextFor(plugin.id, options)))
        .then((cleanup) => typeof cleanup === "function" && cleanups.push(cleanup))
        .catch((err: unknown) => report(source || plugin.id, err))
    }
  })
  onCleanup(() => {
    for (const c of cleanups.splice(0)) {
      try {
        c()
      } catch {
        // a failing cleanup must not stop the others
      }
    }
  })

  return {
    slots: (name: SlotName) => slots().filter((s) => s.name === name).sort((a, b) => a.order - b.order),
    commands,
    errors,
    plugins: () => plugins.map((p) => p.plugin.id),
    emit(event: LiveEvent) {
      for (const l of listeners) {
        if (l.type !== event.type && l.type !== "*") continue
        try {
          l.handler(event)
        } catch (err) {
          report(l.plugin, err)
        }
      }
    },
  }
}

export type PluginHost = ReturnType<typeof init>
const Ctx = createContext<PluginHost>()

export function PluginHostProvider(props: ParentProps<{ plugins: LoadedPlugin[]; errors?: PluginError[] }>) {
  const host = init(props.plugins, props.errors ?? [])
  return (
    <Ctx.Provider value={host}>
      <PluginCommands host={host} />
      {props.children}
    </Ctx.Provider>
  )
}

function PluginCommands(props: { host: PluginHost }) {
  useCommands(() =>
    props.host.commands().map((c): AppCommand => ({ name: c.name, title: c.title, category: c.category ?? "Plugins", keys: c.keys, run: c.run })),
  )
  return null
}

export const usePluginHost = () => useContext(Ctx)

/** Renders what plugins put in a slot. `sidebar_footer` shows only the last registration. */
export function Slot(props: { name: SlotName }) {
  const host = usePluginHost()
  const route = useRoute()
  const entries = () => {
    const all = host?.slots(props.name) ?? []
    return props.name === "sidebar_footer" ? all.slice(-1) : all
  }
  return (
    <Show when={entries().length}>
      <box flexDirection="column">
        {/* Inside JSX the call is reactive: it runs again when the signals a plugin reads change. */}
        <For each={entries()}>{(e) => <>{e.render({ route: route.current() })}</>}</For>
      </box>
    </Show>
  )
}
