// Adding files: a prompt for paths typed, pasted or dragged in, where ctrl+v adds the clipboard's image instead.
// The new-task dialog, the comment composer and "attach files" on a task share it.
import { useBindings } from "@opentui/keymap/solid"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { useReadClipboard, type ReadClipboard } from "../ui/clipboard.tsx"
import { DialogPrompt } from "../ui/dialog-prompt.tsx"
import { checkFiles, parsePaths } from "./file-paths.ts"

/** Files added, and a message about the ones that were not, if any. */
export type Added = { files: string[]; problem: string | null }

/** Saves a pasted image as a PNG in the temp folder, to upload like any other file. */
export async function saveImage(png: Uint8Array): Promise<string> {
  const path = join(tmpdir(), `clipode-clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}.png`)
  await Bun.write(path, png)
  return path
}

/** Checks typed or pasted paths: the files that exist, and a message about the others. */
export async function addPaths(text: string): Promise<Added> {
  const { ok, bad } = await checkFiles(parsePaths(text))
  return { files: ok, problem: bad.length ? `Not added: ${bad.map((b) => `${basename(b.path)} (${b.reason})`).join(", ")}` : null }
}

/** Files from the clipboard: its image, or the file paths in its text (as when files are copied in a file manager). */
export async function clipboardFiles(read: ReadClipboard): Promise<Added> {
  try {
    const content = await read()
    if (!content) return { files: [], problem: "The clipboard is empty" }
    return "image" in content ? { files: [await saveImage(content.image)], problem: null } : await addPaths(content.text)
  } catch (err) {
    return { files: [], problem: err instanceof Error ? err.message : String(err) }
  }
}

export function AttachPrompt(props: { onDone: (added: Added) => void }) {
  const read = useReadClipboard()
  // Above the prompt field's own ctrl+v: here the clipboard's text is paths, and its image a file.
  useBindings(() => ({ mode: "modal", priority: 10, bindings: [{ key: "ctrl+v", cmd: () => void clipboardFiles(read).then(props.onDone) }] }))
  return <DialogPrompt title="Attach files" placeholder="Paste or drag file paths, then enter; ctrl+v adds the clipboard's image or paths" onSubmit={(text) => void addPaths(text).then(props.onDone)} />
}
