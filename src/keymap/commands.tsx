// App commands: a name, a title and category for the palette and help, default bindings, and a handler.
import { formatCommandBindings } from "@opentui/keymap/extras"
import { useBindings, useKeymapSelector } from "@opentui/keymap/solid"
import type { Accessor } from "solid-js"
import { useKeybinds, useLeader } from "./provider.tsx"

export type AppCommand = {
  /** Unique id without spaces, for example "app.inbox". */
  name: string
  title: string
  category: string
  /** Default bindings, comma-separated: "<leader>i,gi". Config keybinds replace them by name. */
  keys?: string
  /** Shown in help but not in the palette. */
  hidden?: boolean
  run: () => void
}

export type CommandEntry = { name: string; title: string; category: string; keys?: string; hidden: boolean }

/** Registers commands for as long as the calling component lives. `mode` decides when they are active. */
export function useCommands(
  list: Accessor<AppCommand[]>,
  options: { mode?: "base" | "modal" | "input" } = {},
) {
  const overrides = useKeybinds()
  useBindings(() => {
    const commands = list()
    return {
      mode: options.mode ?? "base",
      commands: commands.map((c) => ({ name: c.name, title: c.title, category: c.category, hidden: c.hidden, run: () => c.run() })),
      bindings: commands.flatMap((c) => {
        const keys = overrides[c.name] ?? c.keys
        return keys ? [{ key: keys, cmd: c.name }] : []
      }),
    }
  })
}

/** Every registered command with its bindings formatted for display, for the palette and help. */
export function useCommandEntries(): Accessor<CommandEntry[]> {
  const display = { tokenDisplay: { leader: useLeader() } }
  return useKeymapSelector((keymap) =>
    keymap
      .getCommandEntries({ visibility: "registered" })
      .filter(({ command }) => typeof command.title === "string")
      .map(({ command, bindings }) => ({
        name: command.name,
        title: command.title as string,
        category: (command.category as string | undefined) ?? "Other",
        keys: formatCommandBindings(bindings, { ...display, bindingSeparator: "  " }),
        hidden: command.hidden === true,
      })),
  )
}
