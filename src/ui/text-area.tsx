// A multi-line text field that grows with its content. enter is left to the caller (usually "send");
// shift+enter (where the terminal reports it) and ctrl+j insert a line break.
import type { TextareaRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal } from "solid-js"
import { useTheme } from "../theme/context.tsx"

export function TextArea(props: {
  /** The keymap mode the field is used in: "input" for a screen field, "modal" inside a dialog. */
  mode: "input" | "modal"
  placeholder: string
  ref: (area: TextareaRenderable) => void
  maxLines?: number
  /** Text the field starts with, for editing. */
  initial?: string
  /** The background behind the field, so it blends with its row or dialog. */
  background: "panel" | "background"
}) {
  const { theme } = useTheme()
  const [lines, setLines] = createSignal(1)
  let area: TextareaRenderable | undefined
  useBindings(() => ({ mode: props.mode, bindings: [{ key: "shift+return,ctrl+j,linefeed", cmd: () => area?.insertText("\n") }] }))
  return (
    <textarea
      ref={(r: TextareaRenderable) => {
        area = r
        props.ref(r)
        // Editing starts after the existing text, so typing extends it.
        if (props.initial) queueMicrotask(() => !r.isDestroyed && r.gotoBufferEnd())
      }}
      flexGrow={1}
      height={lines()}
      wrapMode="word"
      initialValue={props.initial ?? ""}
      onContentChange={() => {
        // Line breaks count at once; wrapped lines are known only after layout, so measure again then.
        const measure = () => {
          if (!area || area.isDestroyed) return
          setLines(Math.min(props.maxLines ?? 6, Math.max(1, area.lineCount, area.virtualLineCount)))
        }
        measure()
        setTimeout(measure, 0)
      }}
      placeholder={props.placeholder}
      placeholderColor={theme().muted}
      textColor={theme().text}
      focusedTextColor={theme().text}
      backgroundColor={theme()[props.background]}
      focusedBackgroundColor={theme()[props.background]}
      cursorColor={theme().accent}
    />
  )
}
