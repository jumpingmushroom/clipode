// The command palette and the help dialog, both listing registered commands with their key bindings.
import { useKeymap } from "@opentui/keymap/solid"
import { useDialog } from "../ui/dialog.tsx"
import { DialogSelect } from "../ui/dialog-select.tsx"
import { useCommandEntries } from "./commands.tsx"

export function CommandPalette() {
  const keymap = useKeymap()
  const dialog = useDialog()
  const entries = useCommandEntries()
  return (
    <DialogSelect
      title="Commands"
      options={entries()
        .filter((e) => !e.hidden)
        .map((e) => ({ title: e.title, value: e.name, category: e.category, footer: e.keys }))}
      onSelect={(option) => {
        dialog.clear()
        // runCommand, not dispatchCommand: screen commands are switched off until the dialog has closed.
        keymap.runCommand(option.value)
      }}
    />
  )
}

export function HelpDialog() {
  const entries = useCommandEntries()
  return (
    <DialogSelect
      title="Help"
      placeholder="Type to filter key bindings"
      options={entries().map((e) => ({ title: e.title, value: e.name, category: e.category, footer: e.keys ?? "" }))}
    />
  )
}
