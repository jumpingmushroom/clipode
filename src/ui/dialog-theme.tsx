// Theme switcher: moving through the list previews each theme; enter keeps it, esc restores the previous one.
import { createSignal } from "solid-js"
import { defaultThemeName } from "../theme/registry.ts"
import { useTheme } from "../theme/context.tsx"
import { useDialog } from "./dialog.tsx"
import { DialogSelect } from "./dialog-select.tsx"

const label = (name: string) => name.replace(/^clipode-/, "clipode ")

export function DialogTheme() {
  const theme = useTheme()
  const dialog = useDialog()
  const current = theme.name() ?? defaultThemeName(theme.mode())
  const [previewing, setPreviewing] = createSignal(current)
  return (
    <DialogSelect
      title="Themes"
      current={current}
      options={theme.names().map((name) => ({
        title: label(name),
        value: name,
        footer: name === current ? "current" : name === previewing() ? "previewing" : undefined,
      }))}
      onMove={(option) => {
        setPreviewing(option.value)
        theme.preview(option.value)
      }}
      onSelect={(option) => {
        theme.set(option.value)
        dialog.clear()
      }}
      hint={`enter apply   esc keep ${label(current)}`}
    />
  )
}

/** Opens the switcher; closing it without choosing ends the preview. */
export function openThemeDialog(dialog: ReturnType<typeof useDialog>, theme: ReturnType<typeof useTheme>) {
  dialog.replace(() => <DialogTheme />, () => theme.preview(undefined))
}
