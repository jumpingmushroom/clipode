import { createCliRenderer } from "@opentui/core"
import { render, useKeyboard, useRenderer } from "@opentui/solid"
import { clipodeDark, type Theme } from "./theme/tokens.ts"
import { Wordmark } from "./ui/wordmark.tsx"

export function App(props: { theme: Theme; version: string }) {
  const renderer = useRenderer()
  // shortcut: a single ctrl+c quits; the keymap in step 3 adds "ctrl+c twice" and leader q.
  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") renderer.destroy()
  })
  return (
    <box
      width="100%"
      height="100%"
      backgroundColor={props.theme.background}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Wordmark theme={props.theme} />
      <text fg={props.theme.muted} marginTop={1}>
        a terminal client for Paperclip
      </text>
      <text fg={props.theme.muted} marginTop={2}>
        clipode {props.version} · ctrl+c to quit
      </text>
    </box>
  )
}

export async function run(version: string) {
  const renderer = await createCliRenderer({ exitOnCtrlC: false, useMouse: true })
  const destroyed = new Promise<void>((resolve) => renderer.once("destroy", () => resolve()))
  await render(() => <App theme={clipodeDark} version={version} />, renderer)
  await destroyed
  await renderer.closed.catch(() => {})
}
