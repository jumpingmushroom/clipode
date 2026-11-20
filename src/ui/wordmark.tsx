import { For } from "solid-js"
import type { Theme } from "../theme/tokens.ts"

// Rows from the sign-in frame of the agreed mockup. "clip" is the first 24 columns, "ode" the rest.
const ROWS = [
  "        ██  ▀▀                      ██",
  "▄█▀▀▀▀  ██  ██  ██▀▀█▄  ▄█▀▀█▄  ▄█▀▀██  ▄█▀▀█▄",
  "██      ██  ██  ██  ██  ██  ██  ██  ██  ██▀▀▀▀",
  "▀█▄▄▄▄  ██  ██  ██▄▄█▀  ▀█▄▄█▀  ▀█▄▄██  ▀█▄▄▄▄",
  "                ██",
]
const SPLIT = 24

export function Wordmark(props: { theme: Theme }) {
  return (
    <box flexDirection="column">
      <For each={ROWS}>
        {(row) => (
          <text>
            <span style={{ fg: props.theme.text }}>{row.slice(0, SPLIT).padEnd(SPLIT)}</span>
            <span style={{ fg: props.theme.accent }}>{row.slice(SPLIT)}</span>
          </text>
        )}
      </For>
    </box>
  )
}
