// A dialog with one text field; enter submits, esc cancels.
import type { TextareaRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { useTheme } from "../theme/context.tsx"
import { afterDispatch, DIALOG_INSET, DialogHeader } from "./dialog.tsx"
import { TextArea } from "./text-area.tsx"

export function DialogPrompt(props: { title: string; placeholder?: string; initial?: string; onSubmit: (value: string) => void }) {
  const { theme } = useTheme()
  let input: TextareaRenderable | undefined
  useBindings(() => ({ mode: "modal", bindings: [{ key: "return", cmd: () => afterDispatch(() => props.onSubmit(input?.plainText ?? "")) }] }))
  return (
    <box flexDirection="column" gap={1}>
      <DialogHeader title={props.title} />
      <box paddingLeft={DIALOG_INSET} paddingRight={DIALOG_INSET}>
        <TextArea
          mode="modal"
          background="background"
          placeholder={props.placeholder ?? ""}
          initial={props.initial}
          ref={(r) => {
            input = r
            setTimeout(() => !input?.isDestroyed && input?.focus(), 1)
          }}
        />
      </box>
      <text fg={theme().muted} paddingLeft={DIALOG_INSET}>
        enter confirm   ctrl+j new line   esc cancel
      </text>
    </box>
  )
}
