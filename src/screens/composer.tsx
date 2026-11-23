// The composer row above the footer: a comment field for the task on screen. c focuses it, enter sends, esc cancels.
import type { TextareaRenderable } from "@opentui/core"
import { useBindings, useKeymap } from "@opentui/keymap/solid"
import { createSignal, onCleanup, Show } from "solid-js"
import { setMode } from "../keymap/provider.tsx"
import { useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { TextArea } from "../ui/text-area.tsx"
import { useToast } from "../ui/toast.tsx"

export type ComposerTarget = { label: string; send: (text: string) => Promise<void> }

export function Composer(props: { target?: ComposerTarget }) {
  const { theme } = useTheme()
  const { session } = useStores()
  const keymap = useKeymap()
  const toast = useToast()
  const [open, setOpen] = createSignal(false)
  const [sending, setSending] = createSignal(false)
  let input: TextareaRenderable | undefined
  const writable = () => !!props.target && session.client().writes

  const close = () => {
    setOpen(false)
    input?.setText("")
    input?.blur()
    setMode(keymap, "base")
  }
  onCleanup(() => open() && setMode(keymap, "base"))

  const submit = async () => {
    const text = input?.plainText.trim() ?? ""
    if (!text || sending() || !props.target) return
    setSending(true)
    try {
      await props.target.send(text)
      toast.show("Comment posted", "success")
      close()
    } catch (err) {
      toast.error(err)
    } finally {
      setSending(false)
    }
  }

  useBindings(() => ({
    mode: "base",
    enabled: writable(),
    bindings: [
      {
        key: "c",
        cmd: () => {
          setOpen(true)
          setMode(keymap, "input")
          setTimeout(() => input?.focus(), 1)
        },
      },
    ],
  }))
  useBindings(() => ({
    mode: "input",
    enabled: open(),
    bindings: [
      { key: "return", cmd: () => void submit() },
      { key: "escape", cmd: close },
    ],
  }))

  const hint = () =>
    !session.client().writes ? "read-only (readOnly in cli.json)" : props.target ? `c  comment on ${props.target.label}` : "open a task to comment"
  return (
    <Show when={open()} fallback={<text fg={theme().muted}>{hint()}</text>}>
      <box flexDirection="row" flexGrow={1}>
        <text fg={theme().accent} flexShrink={0}>
          {sending() ? "… " : "› "}
        </text>
        <TextArea
          mode="input"
          ref={(r) => (input = r)}
          background="panel"
          placeholder={`Comment on ${props.target?.label ?? ""}: enter sends, ctrl+j adds a line, esc cancels`}
        />
      </box>
    </Show>
  )
}
