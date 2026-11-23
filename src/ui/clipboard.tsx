// Ported from opencode packages/tui/src/clipboard.ts: reading the system clipboard through OpenTUI, images only.
import { createClipboard, createHostClipboard, createRendererClipboardAdapter } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createContext, onCleanup, useContext, type ParentProps } from "solid-js"

/** Returns the clipboard's image as PNG bytes, null when it holds no image; throws when it cannot be read. */
export type ReadImage = () => Promise<Uint8Array | null>

const Ctx = createContext<ReadImage>()

export function ClipboardProvider(props: ParentProps<{ readImage?: ReadImage }>) {
  const renderer = useRenderer()
  let read = props.readImage
  if (!read) {
    const clipboard = createClipboard({ host: createHostClipboard(), terminal: createRendererClipboardAdapter(renderer) })
    onCleanup(() => void clipboard.dispose())
    read = async () => {
      const result = await clipboard.read({ preferredTypes: ["image/png"], selection: "clipboard" })
      if (result.status === "read") return result.representation.mimeType === "image/png" ? result.representation.bytes : null
      if (result.status === "failed") throw result.error
      if (result.status === "timed-out") throw new Error("Reading the clipboard timed out")
      if (result.status === "unsupported") throw new Error("This system offers no way to read clipboard images")
      if (result.status === "limit-exceeded") throw new Error("The clipboard image is too large")
      return null
    }
  }
  return <Ctx.Provider value={read}>{props.children}</Ctx.Provider>
}

export function useReadImage(): ReadImage {
  const read = useContext(Ctx)
  if (!read) throw new Error("useReadImage needs a ClipboardProvider")
  return read
}
