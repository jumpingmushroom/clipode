// The plugin contract (docs/PLUGINS.md). A plugin module's default export is a Plugin or an array of them.
import type { CliRenderer } from "@opentui/core"
import type { JSX } from "solid-js"
import type { LiveEvent } from "../api/live.ts"
import type { Route } from "../route.tsx"
import type { CompanyStores } from "../store/context.tsx"
import type { Session } from "../store/session.ts"
import type { Theme } from "../theme/tokens.ts"
import type { SelectOption } from "../ui/dialog-select.tsx"

export type SlotName = "home_bottom" | "sidebar_title" | "sidebar_content" | "sidebar_footer" | "thread_header"
export type SlotProps = { route: Route }

export type PluginCommand = {
  /** Unique id without spaces; prefix it with the plugin id. */
  name: string
  title: string
  category?: string
  /** Default bindings, as in cli.json keybinds: "<leader>o", "g o". */
  keys?: string
  run: () => void
}

export type Dialogs = {
  alert(title: string, message: string): Promise<void>
  confirm(title: string, message: string): Promise<boolean>
  prompt(title: string, placeholder?: string, initial?: string): Promise<string | null>
  select<T>(title: string, options: SelectOption<T>[]): Promise<T | null>
}

export type Context = {
  id: string
  options: Record<string, unknown>
  paperclip: {
    session: Session
    attention: CompanyStores["attention"]
    issues: CompanyStores["issues"]
    runs: CompanyStores["runs"]
    agents: CompanyStores["agents"]
    /** Subscribes to live events of the selected company; returns an unsubscribe function. */
    on(type: string, handler: (event: LiveEvent) => void): () => void
    /** Read-only escape hatch: GET any API path, for example "/api/companies". */
    get<T>(path: string): Promise<T>
  }
  route: { current(): Route; navigate(to: Route): void }
  ui: {
    /** Adds a render function to a slot; lower order renders first. Returns a remove function. */
    slot(name: SlotName, render: (props: SlotProps) => JSX.Element, order?: number): () => void
    toast(message: string, variant?: "info" | "success" | "warning" | "error"): void
    dialog: Dialogs
    components: typeof import("./components.ts")
  }
  commands: { register(list: PluginCommand[]): () => void; run(name: string): void }
  theme: () => Theme
  renderer: CliRenderer
}

export type Plugin = {
  id: string
  /** Called once per company; may return a cleanup function. */
  setup(ctx: Context): void | (() => void) | Promise<void | (() => void)>
}
