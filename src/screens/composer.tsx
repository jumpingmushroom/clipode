// The composer row above the footer: a comment field for the task on screen. c focuses it, enter sends, esc cancels.
// ctrl+v pastes text, or adds the clipboard's image as a file; ctrl+o adds files by path. Files go up with the comment.
import type { TextareaRenderable } from "@opentui/core"
import { useBindings, useKeymap } from "@opentui/keymap/solid"
import { basename } from "node:path"
import { createSignal, onCleanup, Show } from "solid-js"
import { setMode } from "../keymap/provider.tsx"
import { useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { truncate } from "../ui/format.ts"
import { TextArea } from "../ui/text-area.tsx"
import { useToast } from "../ui/toast.tsx"
import { AttachPrompt, saveImage, type Added } from "./attach-prompt.tsx"

/** Where a comment goes. send uploads the files first and returns those the server did not take. */
export type ComposerTarget = { label: string; send: (text: string, files: string[]) => Promise<{ path: string; reason: string }[]> }

export function Composer(props: { target?: ComposerTarget }) {
  const { theme } = useTheme()
  const { session } = useStores()
  const keymap = useKeymap()
  const toast = useToast()
  const dialog = useDialog()
  const [open, setOpen] = createSignal(false)
  const [files, setFiles] = createSignal<string[]>([])
  const [sending, setSending] = createSignal(false)
  let input: TextareaRenderable | undefined
  const writable = () => !!props.target && session.client().writes

  const close = () => {
    setOpen(false)
    setFiles([])
    input?.setText("")
    input?.blur()
    setMode(keymap, "base")
  }
  onCleanup(() => open() && setMode(keymap, "base"))

  const submit = async () => {
    const text = input?.plainText.trim() ?? ""
    if ((!text && !files().length) || sending() || !props.target) return
    setSending(true)
    try {
      const failed = await props.target.send(text, files())
      if (failed.length) toast.show(`Comment posted; not attached: ${failed.map((f) => `${basename(f.path)} (${f.reason})`).join(", ")}`, "warning", 8000)
      else toast.show(files().length ? `Comment posted with ${files().length} file${files().length === 1 ? "" : "s"}` : "Comment posted", "success")
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
  const addFiles = (added: Added) => {
    setFiles((f) => [...new Set([...f, ...added.files])])
    if (added.problem) toast.show(added.problem, "warning")
  }
  // The dialog gives the keys and focus back to the comment when it closes.
  const attachPaths = () => dialog.replace(() => <AttachPrompt onDone={(added) => (addFiles(added), dialog.clear())} />)
  useBindings(() => ({
    mode: "input",
    enabled: open(),
    bindings: [
      { key: "return", cmd: () => void submit() },
      { key: "escape", cmd: close },
      { key: "ctrl+o", cmd: () => afterDispatch(attachPaths) },
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
        <Show when={files().length}>
          <text fg={theme().muted} flexShrink={0} wrapMode="none">
            {`[${files().length === 1 ? truncate(basename(files()[0]!), 30) : `${files().length} files`}] `}
          </text>
        </Show>
        <TextArea
          mode="input"
          ref={(r) => (input = r)}
          background="panel"
          onImage={(png) => void saveImage(png).then((path) => addFiles({ files: [path], problem: null }))}
          placeholder={`Comment on ${props.target?.label ?? ""}: enter sends, ctrl+j new line, ctrl+v image, ctrl+o files, esc cancels`}
        />
      </box>
    </Show>
  )
}
