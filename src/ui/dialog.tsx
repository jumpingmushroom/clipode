// Ported from opencode packages/tui/src/ui/dialog.tsx: a stack of centred dialogs over a dimmed screen.
import { RGBA, TextAttributes, type Renderable } from "@opentui/core"
import { useBindings, useKeymap } from "@opentui/keymap/solid"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { batch, createContext, createEffect, Show, useContext, type JSX, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { setMode } from "../keymap/provider.tsx"
import { useTheme } from "../theme/context.tsx"

/** Runs after the current key dispatch: the keymap forbids adding or removing layers during one. */
export const afterDispatch = (fn: () => void) => queueMicrotask(fn)

export type DialogSize = "medium" | "large"
export const DIALOG_INSET = 3

export function dialogWidth(size: DialogSize) {
  return size === "large" ? 88 : 60
}

function DialogFrame(props: ParentProps<{ size: DialogSize; onClose: () => void }>) {
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  return (
    <box
      onMouseUp={() => props.onClose()}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      position="absolute"
      zIndex={3000}
      paddingTop={Math.floor(dimensions().height / 4)}
      left={0}
      top={0}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    >
      <box
        onMouseUp={(e: { stopPropagation(): void }) => e.stopPropagation()}
        width={dialogWidth(props.size)}
        maxWidth={dimensions().width - 2}
        backgroundColor={theme().panel}
        paddingTop={1}
        paddingBottom={1}
      >
        {props.children}
      </box>
    </box>
  )
}

/** Title on the left, "esc" on the right, as in the mockup's dialogs. */
export function DialogHeader(props: { title: string }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="row" justifyContent="space-between" paddingLeft={DIALOG_INSET} paddingRight={DIALOG_INSET}>
      <text fg={theme().text} attributes={TextAttributes.BOLD}>
        {props.title}
      </text>
      <text fg={theme().muted}>esc</text>
    </box>
  )
}

type Entry = { element: () => JSX.Element; onClose?: () => void }

function init() {
  const renderer = useRenderer()
  const [store, setStore] = createStore({ stack: [] as Entry[], size: "medium" as DialogSize })
  const keymap = useKeymap()
  let focus: Renderable | null = null

  const refocus = () =>
    setTimeout(() => {
      if (store.stack.length === 0 && focus && !focus.isDestroyed) focus.focus()
    }, 1)

  createEffect(() => setMode(keymap, store.stack.length > 0 ? "modal" : "base"))

  const api = {
    /** Replaces whatever is open with this dialog. */
    replace(element: () => JSX.Element, onClose?: () => void, size: DialogSize = "medium") {
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable
        focus?.blur()
      }
      for (const item of store.stack) item.onClose?.()
      batch(() => {
        setStore("size", size)
        setStore("stack", [{ element, onClose }])
      })
    },
    /** Closes the top dialog. */
    pop() {
      const top = store.stack.at(-1)
      top?.onClose?.()
      setStore("stack", store.stack.slice(0, -1))
      refocus()
    },
    clear() {
      for (const item of store.stack) item.onClose?.()
      setStore("stack", [])
      refocus()
    },
    get open() {
      return store.stack.length > 0
    },
    get size() {
      return store.size
    },
    get top() {
      return store.stack.at(-1)
    },
  }

  useBindings(() => ({
    mode: "modal",
    bindings: [{ key: "escape", cmd: () => afterDispatch(() => api.pop()) }],
  }))
  return api
}

export type DialogContext = ReturnType<typeof init>
const Ctx = createContext<DialogContext>()

export function DialogProvider(props: ParentProps) {
  const value = init()
  return (
    <Ctx.Provider value={value}>
      {props.children}
      <Show when={value.open}>
        <DialogFrame size={value.size} onClose={() => value.clear()}>
          {/* Keyed so each entry renders once and keeps its state while signals it reads change. */}
          <Show when={value.top} keyed>
            {(item: Entry) => item.element()}
          </Show>
        </DialogFrame>
      </Show>
    </Ctx.Provider>
  )
}

export function useDialog(): DialogContext {
  const value = useContext(Ctx)
  if (!value) throw new Error("useDialog needs a DialogProvider")
  return value
}
