// A dialog with one text field; enter submits, esc cancels.
import type { InputRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal } from "solid-js"
import { useTheme } from "../theme/context.tsx"
import { afterDispatch, DIALOG_INSET, DialogHeader } from "./dialog.tsx"

export function DialogPrompt(props: { title: string; placeholder?: string; onSubmit: (value: string) => void }) {
  const { theme } = useTheme()
  const [value, setValue] = createSignal("")
  let input: InputRenderable | undefined
  useBindings(() => ({ mode: "modal", bindings: [{ key: "return", cmd: () => afterDispatch(() => props.onSubmit(value())) }] }))
  return (
    <box flexDirection="column" gap={1}>
      <DialogHeader title={props.title} />
      <box paddingLeft={DIALOG_INSET} paddingRight={DIALOG_INSET}>
        <input
          ref={(r: InputRenderable) => {
            input = r
            setTimeout(() => !input?.isDestroyed && input?.focus(), 1)
          }}
          onInput={(v: string) => setValue(v)}
          placeholder={props.placeholder ?? ""}
          placeholderColor={theme().muted}
          textColor={theme().text}
          focusedTextColor={theme().text}
          backgroundColor={theme().background}
          focusedBackgroundColor={theme().background}
          cursorColor={theme().accent}
        />
      </box>
      <text fg={theme().muted} paddingLeft={DIALOG_INSET}>
        enter confirm   esc cancel
      </text>
    </box>
  )
}
