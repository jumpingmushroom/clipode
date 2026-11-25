// alert, confirm, prompt and select as promises, for plugins.
import { DIALOG_INSET, type DialogContext } from "../ui/dialog.tsx"
import { DialogPrompt } from "../ui/dialog-prompt.tsx"
import { useTheme } from "../theme/context.tsx"
import { DialogSelect, type SelectOption } from "../ui/dialog-select.tsx"
import type { Dialogs } from "./types.ts"

/** A dialog's message line, in the theme's text colour (OpenTUI's default is white, unreadable on light themes). */
function Message(props: { text: string }) {
  const { theme } = useTheme()
  return (
    <text fg={theme().text} paddingLeft={DIALOG_INSET}>
      {props.text}
    </text>
  )
}

export function createDialogs(dialog: DialogContext): Dialogs {
  // Each promise settles once: on a choice, or with the cancel value when the dialog closes.
  function open<T>(cancel: T, render: (done: (value: T) => void) => () => import("solid-js").JSX.Element): Promise<T> {
    return new Promise((resolve) => {
      let settled = false
      const done = (value: T) => {
        if (settled) return
        settled = true
        resolve(value)
        dialog.clear()
      }
      dialog.replace(render(done), () => {
        if (!settled) {
          settled = true
          resolve(cancel)
        }
      })
    })
  }
  return {
    alert: (title, message) =>
      open<void>(undefined, (done) => () => (
        <box flexDirection="column">
          <DialogSelect title={title} options={[{ title: "OK", value: true }]} onSelect={() => done()} />
          <Message text={message} />
        </box>
      )),
    confirm: (title, message) =>
      open(false, (done) => () => (
        <box flexDirection="column">
          <Message text={message} />
          <DialogSelect title={title} options={[{ title: "Yes", value: true }, { title: "No", value: false }]} onSelect={(o) => done(o.value)} />
        </box>
      )),
    prompt: (title, placeholder, initial) =>
      open<string | null>(null, (done) => () => <DialogPrompt title={title} placeholder={placeholder} initial={initial} onSubmit={done} />),
    select: <T,>(title: string, options: SelectOption<T>[]) =>
      open<T | null>(null, (done) => () => <DialogSelect title={title} options={options} onSelect={(o) => done(o.value)} />),
  }
}
