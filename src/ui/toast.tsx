// Ported from opencode packages/tui/src/ui/toast.tsx, without titles and actions.
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createContext, onCleanup, Show, useContext, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../theme/context.tsx"

export type ToastVariant = "info" | "success" | "warning" | "error"
export type ToastOptions = { message: string; variant: ToastVariant; duration: number }

const SplitBorderChars = {
  topLeft: "", bottomLeft: "", vertical: "┃", topRight: "", bottomRight: "", horizontal: " ",
  bottomT: "", topT: "", cross: "", leftT: "", rightT: "",
}

export function Toast() {
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const color = (variant: ToastVariant) => (variant === "info" ? theme().accent : theme()[variant])
  return (
    <Show when={toast.current} keyed>
      {(current: ToastOptions) => (
        <box
          position="absolute"
          zIndex={4000}
          top={1}
          right={2}
          maxWidth={Math.min(60, dimensions().width - 6)}
          border={["left", "right"]}
          borderColor={color(current.variant)}
          customBorderChars={SplitBorderChars}
          onMouseUp={() => toast.dismiss()}
        >
          <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} backgroundColor={theme().panel} flexDirection="row">
            <text fg={theme().text} wrapMode="word" flexGrow={1}>
              {current.message}
            </text>
            <Show when={toast.pending}>
              <text fg={theme().muted} marginLeft={2} attributes={TextAttributes.DIM}>
                +{toast.pending}
              </text>
            </Show>
          </box>
        </box>
      )}
    </Show>
  )
}

function init() {
  const [store, setStore] = createStore({ current: null as ToastOptions | null, queue: [] as ToastOptions[] })
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const start = (duration: number) => {
    clear()
    timer = setTimeout(() => dismiss(), duration)
    timer.unref?.()
  }
  const dismiss = () => {
    clear()
    const next = store.queue[0]
    setStore("queue", (queue) => queue.slice(1))
    setStore("current", next ?? null)
    if (next) start(next.duration)
  }
  onCleanup(clear)
  return {
    show(message: string, variant: ToastVariant = "info", duration = 5000) {
      const options = { message, variant, duration }
      // A newer message replaces a passing one at once; only errors wait their turn, so none goes unseen.
      if (store.current?.variant === "error") {
        setStore("queue", (queue) => [...queue, options])
        return
      }
      setStore("current", options)
      start(duration)
    },
    error(err: unknown) {
      this.show(err instanceof Error ? err.message : String(err), "error")
    },
    dismiss,
    get current() {
      return store.current
    },
    get pending() {
      return store.queue.length
    },
  }
}

export type ToastContext = ReturnType<typeof init>
const Ctx = createContext<ToastContext>()

export function ToastProvider(props: ParentProps) {
  return <Ctx.Provider value={init()}>{props.children}</Ctx.Provider>
}

export function useToast(): ToastContext {
  const value = useContext(Ctx)
  if (!value) throw new Error("useToast needs a ToastProvider")
  return value
}
