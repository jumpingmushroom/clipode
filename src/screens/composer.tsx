// The composer row above the footer: a comment field for the task on screen. c focuses it, enter sends, esc cancels.
// ctrl+v pastes text, or adds the clipboard's image as a file; ctrl+o adds files by path. Files go up with the comment.
// On a task assigned to you, the comment hands it back to the agent that gave it to you, as in the web UI; ctrl+t
// picks another agent or none.
import type { TextareaRenderable } from "@opentui/core"
import { useBindings, useKeymap } from "@opentui/keymap/solid"
import { basename } from "node:path"
import { createSignal, onCleanup, Show } from "solid-js"
import { setMode } from "../keymap/provider.tsx"
import { createDialogs } from "../plugin/dialogs.tsx"
import { useStores } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { truncate } from "../ui/format.ts"
import { TextArea } from "../ui/text-area.tsx"
import { useToast } from "../ui/toast.tsx"
import { AttachPrompt, saveImage, type Added } from "./attach-prompt.tsx"

/**
 * Where a comment goes. send uploads the files first, hands the task to assignTo when given, and returns the files the
 * server did not take. handBack suggests whom a comment should hand the task to.
 */
export type ComposerTarget = {
  label: string
  send: (text: string, files: string[], assignTo: string | null) => Promise<{ path: string; reason: string }[]>
  handBack?: () => Promise<string | null>
}

export function Composer(props: { target?: ComposerTarget }) {
  const { theme } = useTheme()
  const { session, company } = useStores()
  const keymap = useKeymap()
  const toast = useToast()
  const dialog = useDialog()
  const [open, setOpen] = createSignal(false)
  const [files, setFiles] = createSignal<string[]>([])
  const [assignTo, setAssignTo] = createSignal<string | null>(null)
  const agentName = (id: string | null) => (id ? (company()?.agents.byId(id)?.name ?? "an agent") : null)
  const [sending, setSending] = createSignal(false)
  let input: TextareaRenderable | undefined
  const writable = () => !!props.target && session.client().writes

  const close = () => {
    setOpen(false)
    setFiles([])
    setAssignTo(null)
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
      const failed = await props.target.send(text, files(), assignTo())
      const posted = `Comment posted${assignTo() ? `, ${props.target.label} handed to ${agentName(assignTo())}` : ""}`
      if (failed.length) toast.show(`${posted}; not attached: ${failed.map((f) => `${basename(f.path)} (${f.reason})`).join(", ")}`, "warning", 8000)
      else toast.show(files().length ? `${posted} with ${files().length} file${files().length === 1 ? "" : "s"}` : posted, "success")
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
          // The suggestion arrives while you type; a choice made with ctrl+t in the meantime wins.
          let chosen = false
          pick = () => (chosen = true)
          void props.target?.handBack?.().then((id) => open() && !chosen && setAssignTo(id))
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
  let pick = () => {}
  const chooseAssignee = async () => {
    const agents = company()?.agents.active() ?? []
    const next = await createDialogs(dialog).select("Hand the task to", [
      { title: "No one: comment only", value: "", footer: assignTo() ? undefined : "current" },
      ...agents.map((a) => ({ title: a.name, value: a.id, footer: a.id === assignTo() ? "current" : (a.title ?? a.role) })),
    ])
    if (next === null) return
    pick()
    setAssignTo(next || null)
  }
  useBindings(() => ({
    mode: "input",
    enabled: open(),
    bindings: [
      { key: "return", cmd: () => void submit() },
      { key: "escape", cmd: close },
      { key: "ctrl+o", cmd: () => afterDispatch(attachPaths) },
      { key: "ctrl+t", cmd: () => afterDispatch(() => void chooseAssignee()) },
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
        <Show when={assignTo()}>
          <text fg={theme().muted} flexShrink={0} wrapMode="none">
            {`to ${truncate(agentName(assignTo())!, 20)} `}
          </text>
        </Show>
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
          placeholder={`Comment on ${props.target?.label ?? ""}: enter sends, ctrl+j new line, ctrl+v image, ctrl+o files, ctrl+t hand to, esc cancels`}
        />
      </box>
    </Show>
  )
}
