// The keymap: OpenTUI's keymap engine with a timed leader, comma-separated alternatives, and a "mode" layer field
// so that an open dialog switches off the screen's bindings. Mode handling follows opencode packages/tui/src/context/keymap.tsx.
import {
  registerBackspacePopsPendingSequence,
  registerCommaBindings,
  registerEscapeClearsPendingSequence,
  registerTimedLeader,
} from "@opentui/keymap/addons/opentui"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { KeymapProvider } from "@opentui/keymap/solid"
import { useRenderer } from "@opentui/solid"
import { createContext, onCleanup, useContext, type ParentProps } from "solid-js"

export type Mode = "base" | "modal" | "input"
const MODE_KEY = "clipode.mode"

/** Bindings from cli.json `keybinds`, command name to binding; they replace a command's default keys. */
const Keybinds = createContext<Record<string, string>>({})
export const useKeybinds = () => useContext(Keybinds)

export function KeysProvider(props: ParentProps<{ leader?: string; keybinds?: Record<string, string> }>) {
  const keymap = createDefaultOpenTuiKeymap(useRenderer())
  const dispose = [
    registerCommaBindings(keymap),
    // "g t": a sequence of single characters separated by spaces. Written without the space, "gt" is the named key ">".
    keymap.prependBindingParser(({ input, index, parseObjectKey }) => {
      const strokes = input.trim().split(/\s+/)
      if (index !== 0 || strokes.length < 2 || strokes.some((s) => s.length !== 1)) return
      return { parts: strokes.map((s) => parseObjectKey({ name: s }, { display: s })), nextIndex: input.length }
    }),
    // "G": an uppercase letter is that letter with shift. The default parser reads it as the plain letter, which would
    // take "g" and break every "g …" sequence on the screen.
    keymap.prependBindingParser(({ input, index, parseObjectKey }) => {
      if (index !== 0 || !/^[A-Z]$/.test(input)) return
      return { parts: [parseObjectKey({ name: input.toLowerCase(), shift: true }, { display: input })], nextIndex: 1 }
    }),
    registerEscapeClearsPendingSequence(keymap),
    registerBackspacePopsPendingSequence(keymap),
    registerTimedLeader(keymap, { trigger: props.leader ?? "ctrl+x", name: "leader", timeoutMs: 2000 }),
    // A layer with `mode: "base"` is active only while no dialog is open; `mode: "modal"` only while one is;
    // `mode: "input"` only while a screen text field (such as a list filter) has the keys.
    keymap.registerLayerFields({
      mode(value, context) {
        context.require(MODE_KEY, value)
      },
    }),
  ]
  keymap.setData(MODE_KEY, "base")
  onCleanup(() => dispose.reverse().forEach((d) => d()))
  return (
    <KeymapProvider keymap={keymap}>
      <Keybinds.Provider value={props.keybinds ?? {}}>{props.children}</Keybinds.Provider>
    </KeymapProvider>
  )
}

export function setMode(keymap: { setData(name: string, value: unknown): void }, mode: Mode) {
  keymap.setData(MODE_KEY, mode)
}
