// A multi-line text field that grows with its content. enter is left to the caller (usually "send");
// shift+enter (where the terminal reports it) and ctrl+j insert a line break. ctrl+v pastes the clipboard's text, or
// hands its image to onImage where the field takes files.
import type { TextareaRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createSignal } from "solid-js"
import { useTheme } from "../theme/context.tsx"
import { useReadClipboard } from "./clipboard.tsx"
import { useToast } from "./toast.tsx"

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
  /** Takes a pasted image; without it, ctrl+v with an image on the clipboard says images cannot go here. */
  onImage?: (png: Uint8Array) => void
}) {
  const { theme } = useTheme()
  const [lines, setLines] = createSignal(1)
  let area: TextareaRenderable | undefined
  const readClipboard = useReadClipboard()
  const toast = useToast()
  // Terminals send ctrl+v as a key rather than a paste, so the field reads the clipboard itself.
  const paste = async () => {
    try {
      const content = await readClipboard()
      // Another field (a dialog's title, say) may have the keys while this one is on screen.
      if (!area || area.isDestroyed || !area.focused || !content) return
      if ("text" in content) area.insertText(content.text)
      else if (props.onImage) props.onImage(content.image)
      else toast.show("Images cannot go in this field", "warning")
    } catch (err) {
      toast.error(err)
    }
  }
  useBindings(() => ({
    mode: props.mode,
    bindings: [
      { key: "shift+return,ctrl+j,linefeed", cmd: () => area?.insertText("\n") },
      { key: "ctrl+v", cmd: () => void paste() },
    ],
  }))
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
