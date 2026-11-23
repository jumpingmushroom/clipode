// The new-task and edit-task dialog, modelled on the web UI's composer: description first, title optional, then
// project, assignee, model, mode and privacy. tab moves between fields, enter or space changes one, ctrl+s saves.
import { RGBA, TextAttributes, type InputRenderable, type TextareaRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { createEffect, createMemo, createSignal, For, Show, type JSX } from "solid-js"
import { useCompany } from "../store/context.tsx"
import { useTheme } from "../theme/context.tsx"
import { afterDispatch, DIALOG_INSET } from "../ui/dialog.tsx"
import { DialogSelect, type SelectOption } from "../ui/dialog-select.tsx"
import { DialogPrompt } from "../ui/dialog-prompt.tsx"
import { TextArea } from "../ui/text-area.tsx"
import { basename } from "node:path"
import { checkFiles, parsePaths } from "./file-paths.ts"
import { useReadImage } from "../ui/clipboard.tsx"
import { tmpdir } from "node:os"
import { join } from "node:path"

export type WorkMode = "standard" | "planning" | "ask"
export type TaskForm = {
  description: string
  title: string
  projectId: string | null
  assigneeAgentId: string | null
  model: string | null
  workMode: WorkMode
  private: boolean
  /** Local files to upload once the task exists. */
  files: string[]
}

const MODES: { value: WorkMode; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "planning", label: "Plan" },
  { value: "ask", label: "Ask" },
]
type Field = "description" | "title" | "project" | "assignee" | "model" | "mode" | "private" | "files"
type Picker = "project" | "assignee" | "model" | "files"

export function TaskDialog(props: {
  heading: string
  initial: TaskForm
  /** Editing changes text, project and assignee; model, mode and privacy are set when a task is created. */
  edit?: boolean
  onSubmit: (form: TaskForm) => Promise<void>
}) {
  const { theme } = useTheme()
  const company = useCompany()
  const [form, setForm] = createSignal<TaskForm>({ ...props.initial })
  const [focus, setFocus] = createSignal<Field>("description")
  const [picker, setPicker] = createSignal<Picker | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  let description: TextareaRenderable | undefined
  let title: InputRenderable | undefined
  // The text fields are rebuilt after each picker, so a held reference may be to a destroyed one.
  const live = <T extends { isDestroyed: boolean }>(r: T | undefined) => (r && !r.isDestroyed ? r : undefined)
  const texts = () => ({ description: live(description)?.plainText ?? form().description, title: live(title)?.value ?? form().title })

  const fields = (): Field[] => (props.edit ? ["description", "title", "project", "assignee"] : ["description", "title", "project", "assignee", "model", "mode", "private", "files"])
  const set = (patch: Partial<TaskForm>) => setForm((f) => ({ ...f, ...patch }))
  const agents = () => company.agents.list.data.filter((a) => a.status !== "terminated")
  const assignee = () => agents().find((a) => a.id === form().assigneeAgentId)
  const models = createMemo(() => (assignee() ? company.agents.models(assignee()!.adapterType) : undefined))
  createEffect(() => void models()?.load())

  // Text fields take the keyboard only while focused; on a choice field typing goes nowhere.
  createEffect(() => {
    const f = focus()
    if (picker()) return
    setTimeout(() => {
      if (f === "description") live(description)?.focus()
      else live(description)?.blur()
      if (f === "title") live(title)?.focus()
      else live(title)?.blur()
    }, 1)
  })

  const move = (delta: number) => {
    const list = fields()
    setFocus(list[(list.indexOf(focus()) + delta + list.length) % list.length]!)
  }
  // The text fields unmount while a picker is open, so their text is kept in the form first.
  const keepText = () => set(texts())
  const change = () => {
    const f = focus()
    if (f === "project" || f === "assignee" || f === "model" || f === "files") {
      keepText()
      return setPicker(f)
    }
    if (f === "mode") return set({ workMode: MODES[(MODES.findIndex((m) => m.value === form().workMode) + 1) % MODES.length]!.value })
    if (f === "private") return set({ private: !form().private })
  }
  const submit = async () => {
    const value = { ...form(), ...texts() }
    if (!value.description.trim() && !value.title.trim()) return setError("Write a description (or a title)")
    setBusy(true)
    setError(null)
    try {
      await props.onSubmit(value)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const readImage = useReadImage()
  /** Saves the clipboard's image as a PNG in the temp folder and adds it like any other file. */
  const pasteImage = async () => {
    // Messages show in the form, so an open attach prompt closes first.
    setPicker(null)
    try {
      const bytes = await readImage()
      if (!bytes) return setError("The clipboard holds no image")
      const path = join(tmpdir(), `clipode-clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}.png`)
      await Bun.write(path, bytes)
      set({ files: [...form().files, path] })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const addFiles = async (text: string) => {
    const { ok, bad } = await checkFiles(parsePaths(text))
    set({ files: [...new Set([...form().files, ...ok])] })
    setError(bad.length ? `Not added: ${bad.map((b) => `${basename(b.path)} (${b.reason})`).join(", ")}` : null)
    setPicker(null)
  }

  useBindings(() => ({
    mode: "modal",
    enabled: !picker(),
    bindings: [
      ...(focus() === "files"
        ? [
            { key: "backspace,delete", cmd: () => set({ files: form().files.slice(0, -1) }) },
            { key: "ctrl+v", cmd: () => void pasteImage() },
          ]
        : []),
      // Moving focus rebuilds this layer (its keys depend on the field), so it happens after the dispatch.
      { key: "tab", cmd: () => afterDispatch(() => move(1)) },
      { key: "shift+tab", cmd: () => afterDispatch(() => move(-1)) },
      { key: "ctrl+s", cmd: () => void submit() },
      // enter and space change a choice field; in the text fields they stay text.
      ...(focus() === "description" || focus() === "title" ? [] : [{ key: "return,space,left,right", cmd: () => afterDispatch(change) }]),
    ],
  }))
  // While a picker is open, esc closes it rather than the whole dialog.
  useBindings(() => ({ mode: "modal", priority: 10, enabled: !!picker(), bindings: [{ key: "escape", cmd: () => afterDispatch(() => setPicker(null)) }] }))
  // In the attach prompt, ctrl+v takes an image from the clipboard instead of a path.
  useBindings(() => ({ mode: "modal", priority: 10, enabled: picker() === "files", bindings: [{ key: "ctrl+v", cmd: () => void pasteImage() }] }))

  const pickerOptions = (): { title: string; options: SelectOption<string>[]; current: string } => {
    const p = picker()! as Exclude<Picker, "files">
    if (p === "project") {
      return {
        title: "Project",
        current: form().projectId ?? "",
        options: [{ title: "No project", value: "" }, ...company.issues.projects.data.map((x) => ({ title: x.name, value: x.id }))],
      }
    }
    if (p === "assignee") {
      return {
        title: "Assignee",
        current: form().assigneeAgentId ?? "",
        options: [{ title: "Unassigned", value: "" }, ...agents().map((a) => ({ title: a.name, value: a.id, footer: a.title ?? a.role }))],
      }
    }
    return {
      title: "Model",
      current: form().model ?? "",
      options: [{ title: "Agent default", value: "" }, ...(models()?.data ?? []).map((m) => ({ title: m.label, value: m.id, footer: m.id }))],
    }
  }
  const pick = (value: string) => {
    const p = picker()
    // A new assignee may run a different adapter, so its model choice starts over.
    if (p === "assignee") set({ assigneeAgentId: value || null, model: null })
    if (p === "project") set({ projectId: value || null })
    if (p === "model") set({ model: value || null })
    setPicker(null)
  }

  const label = (field: Field, text: string) => (
    <text fg={focus() === field ? theme().accent : theme().muted} flexShrink={0} width={13}>
      {text}
    </text>
  )
  const choice = (field: Field, text: string, value: string): JSX.Element => (
    <box flexDirection="row" backgroundColor={focus() === field ? theme().selection : RGBA.fromInts(0, 0, 0, 0)} onMouseUp={() => (setFocus(field), change())}>
      {label(field, text)}
      <text fg={theme().text}>{value} ▾</text>
    </box>
  )
  const projectName = () => company.issues.projects.data.find((p) => p.id === form().projectId)?.name ?? "No project"
  const modelName = () => (form().model ? (models()?.data.find((m) => m.id === form().model)?.label ?? form().model!) : "Agent default")

  return (
    <Show
      when={!picker()}
      fallback={
        picker() === "files" ? (
          <DialogPrompt title="Attach files" placeholder="Paste or drag file paths, then enter; ctrl+v pastes a clipboard image" onSubmit={(text) => void addFiles(text)} />
        ) : (
        <DialogSelect
          title={pickerOptions().title}
          options={pickerOptions().options}
          current={pickerOptions().current}
          onSelect={(o) => pick(o.value)}
          hint="enter choose   esc back to the task"
        />
        )
      }
    >
      <box flexDirection="column" gap={1}>
        <box flexDirection="row" justifyContent="space-between" paddingLeft={DIALOG_INSET} paddingRight={DIALOG_INSET}>
          <text fg={theme().text} attributes={TextAttributes.BOLD}>
            {props.heading}
          </text>
          <text fg={theme().muted}>esc</text>
        </box>
        <box flexDirection="column" paddingLeft={DIALOG_INSET} paddingRight={DIALOG_INSET} gap={1}>
          <box flexDirection="row" onMouseUp={() => setFocus("description")}>
            {label("description", "Description")}
            <TextArea mode="modal" background="background" initial={form().description} maxLines={8} placeholder="What should be done? Markdown" ref={(r) => (description = r)} />
          </box>
          <box flexDirection="row" onMouseUp={() => setFocus("title")}>
            {label("title", "Title")}
            <input
              ref={(r: InputRenderable) => (title = r)}
              flexGrow={1}
              value={form().title}
              placeholder="Optional: generated from the description"
              placeholderColor={theme().muted}
              textColor={theme().text}
              focusedTextColor={theme().text}
              backgroundColor={theme().background}
              focusedBackgroundColor={theme().background}
              cursorColor={theme().accent}
            />
          </box>
          <box flexDirection="column">
            {choice("project", "Project", projectName())}
            {choice("assignee", "Assignee", assignee()?.name ?? "Unassigned")}
            <Show when={!props.edit}>
              <Show when={assignee()} fallback={<text fg={theme().muted}>{"Model".padEnd(13)}assign an agent to choose its model</text>}>
                {choice("model", "Model", modelName())}
              </Show>
              <box flexDirection="row" backgroundColor={focus() === "mode" ? theme().selection : RGBA.fromInts(0, 0, 0, 0)} onMouseUp={() => (setFocus("mode"), change())}>
                {label("mode", "Mode")}
                <For each={MODES}>
                  {(m) => (
                    <text fg={form().workMode === m.value ? theme().text : theme().muted} attributes={form().workMode === m.value ? TextAttributes.BOLD : undefined}>
                      {`${form().workMode === m.value ? "●" : "○"} ${m.label}   `}
                    </text>
                  )}
                </For>
              </box>
              <box flexDirection="row" backgroundColor={focus() === "private" ? theme().selection : RGBA.fromInts(0, 0, 0, 0)} onMouseUp={() => (setFocus("private"), change())}>
                {label("private", "Private")}
                <text fg={theme().text}>{form().private ? "[x] private task" : "[ ] visible to the company"}</text>
              </box>
              {choice("files", "Files", form().files.length ? `${form().files.map((f) => basename(f)).join(", ")}  (backspace removes the last)` : "none, enter to attach, ctrl+v pastes an image")}
            </Show>
          </box>
          <Show when={error()}>
            <text fg={theme().error}>✗ {error()}</text>
          </Show>
          <text fg={theme().muted}>{busy() ? "saving…" : "tab next field   enter change   ctrl+j new line   ctrl+s save   esc cancel"}</text>
        </box>
      </box>
    </Show>
  )
}
