// A one-cell braille spinner, as in the mockup's tab bar and live-run rows.
import { createSignal, onCleanup } from "solid-js"
import type { RGBA } from "@opentui/core"

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { color: RGBA }) {
  const [frame, setFrame] = createSignal(0)
  const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80)
  onCleanup(() => clearInterval(timer))
  return <text fg={props.color}>{FRAMES[frame()]}</text>
}
