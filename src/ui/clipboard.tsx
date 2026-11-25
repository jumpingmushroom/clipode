// Ported from opencode packages/tui/src/clipboard.ts: reading the system clipboard through OpenTUI, an image or text.
import { createClipboard, createHostClipboard, createRendererClipboardAdapter } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createContext, onCleanup, useContext, type ParentProps } from "solid-js"

/** What the clipboard holds: an image as PNG bytes, or text; null when empty. */
export type ClipboardContent = { image: Uint8Array } | { text: string } | null
/** Reads the clipboard, preferring an image; throws when it cannot be read. */
export type ReadClipboard = () => Promise<ClipboardContent>

const Ctx = createContext<ReadClipboard>()

export function ClipboardProvider(props: ParentProps<{ read?: ReadClipboard }>) {
  const renderer = useRenderer()
  let read = props.read
  if (!read) {
    const clipboard = createClipboard({ host: createHostClipboard(), terminal: createRendererClipboardAdapter(renderer) })
    onCleanup(() => void clipboard.dispose())
    read = async () => {
      const result = await clipboard.read({ preferredTypes: ["image/png", "text/plain"], selection: "clipboard" })
      if (result.status === "read") {
        const { mimeType, bytes } = result.representation
        if (mimeType === "image/png") return { image: bytes }
        return bytes.length ? { text: new TextDecoder().decode(bytes) } : null
      }
      if (result.status === "failed") throw result.error
      if (result.status === "timed-out") throw new Error("Reading the clipboard timed out")
      if (result.status === "unsupported") throw new Error("This system offers no way to read the clipboard")
      if (result.status === "limit-exceeded") throw new Error("The clipboard content is too large")
      return null
    }
  }
  return <Ctx.Provider value={read}>{props.children}</Ctx.Provider>
}

export function useReadClipboard(): ReadClipboard {
  const read = useContext(Ctx)
  if (!read) throw new Error("useReadClipboard needs a ClipboardProvider")
  return read
}
