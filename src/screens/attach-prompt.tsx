// Adding files: a prompt for paths typed, pasted or dragged in, where ctrl+v adds the clipboard's image instead.
// The new-task dialog, the comment composer and "attach files" on a task share it.
import { useBindings } from "@opentui/keymap/solid"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import { useReadImage, type ReadImage } from "../ui/clipboard.tsx"
import { DialogPrompt } from "../ui/dialog-prompt.tsx"
import { checkFiles, parsePaths } from "./file-paths.ts"

/** Files added, and a message about the ones that were not, if any. */
export type Added = { files: string[]; problem: string | null }

/** Saves the clipboard's image as a PNG in the temp folder, to upload like any other file. */
export async function clipboardImage(readImage: ReadImage): Promise<Added> {
  try {
    const bytes = await readImage()
    if (!bytes) return { files: [], problem: "The clipboard holds no image" }
    const path = join(tmpdir(), `clipode-clipboard-${new Date().toISOString().replace(/[:.]/g, "-")}.png`)
    await Bun.write(path, bytes)
    return { files: [path], problem: null }
  } catch (err) {
    return { files: [], problem: err instanceof Error ? err.message : String(err) }
  }
}

export function AttachPrompt(props: { onDone: (added: Added) => void }) {
  const readImage = useReadImage()
  const addPaths = async (text: string) => {
    const { ok, bad } = await checkFiles(parsePaths(text))
    props.onDone({ files: ok, problem: bad.length ? `Not added: ${bad.map((b) => `${basename(b.path)} (${b.reason})`).join(", ")}` : null })
  }
  // Above the prompt's own keys, so ctrl+v reads the clipboard rather than reaching the text field.
  useBindings(() => ({ mode: "modal", priority: 10, bindings: [{ key: "ctrl+v", cmd: () => void clipboardImage(readImage).then(props.onDone) }] }))
  return <DialogPrompt title="Attach files" placeholder="Paste or drag file paths, then enter; ctrl+v pastes a clipboard image" onSubmit={(text) => void addPaths(text)} />
}
