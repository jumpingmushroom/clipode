// Ported from opencode packages/tui/src/ui/dialog-select.tsx: a filterable list with categories and key hints.
import { RGBA, TextAttributes, type InputRenderable, type ScrollBoxRenderable } from "@opentui/core"
import { useBindings } from "@opentui/keymap/solid"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, For, on, Show } from "solid-js"
import { useTheme } from "../theme/context.tsx"
import { afterDispatch, DIALOG_INSET, DialogHeader } from "./dialog.tsx"
import { fuzzyScore } from "./fuzzy.ts"

export type SelectOption<T> = {
  title: string
  value: T
  category?: string
  /** Muted text on the right, such as a key binding or "current". */
  footer?: string
  disabled?: boolean
}

export type SelectProps<T> = {
  title: string
  options: SelectOption<T>[]
  placeholder?: string
  /** The value to start on. */
  current?: T
  onSelect?: (option: SelectOption<T>) => void
  /** Called as the highlight moves, for live previews. */
  onMove?: (option: SelectOption<T>) => void
  /** A muted line under the list, such as "enter apply  esc cancel". */
  hint?: string
}

export function DialogSelect<T>(props: SelectProps<T>) {
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const [filter, setFilter] = createSignal("")
  const [selected, setSelected] = createSignal(0)
  let scroll: ScrollBoxRenderable | undefined
  let input: InputRenderable | undefined

  // With a filter, categories are flattened and rows ranked by match; without, they keep their order and grouping.
  const shown = createMemo(() => {
    const options = props.options.filter((o) => !o.disabled)
    const query = filter().trim()
    if (!query) return options
    return options
      .map((o) => ({ o, score: fuzzyScore(`${o.title} ${o.category ?? ""}`, query) }))
      .filter((x): x is { o: SelectOption<T>; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.o)
  })
  const grouped = createMemo(() => {
    if (filter().trim()) return [["", shown()] as const]
    const groups = new Map<string, SelectOption<T>[]>()
    for (const o of shown()) groups.set(o.category ?? "", [...(groups.get(o.category ?? "") ?? []), o])
    return [...groups.entries()]
  })
  // Rows in display order, so arrow keys follow what is on screen.
  const flat = createMemo(() => grouped().flatMap(([, options]) => options))
  const current = () => flat()[selected()]

  // Keep the highlighted value when options are rebuilt; a new filter starts at the top.
  let lastValue: T | undefined = props.current
  createEffect(
    on([flat, filter], ([list, query], prev) => {
      const queryChanged = prev !== undefined && prev[1] !== query
      const kept = queryChanged ? -1 : list.findIndex((o) => o.value === lastValue)
      setSelected(Math.max(0, kept))
    }),
  )
  createEffect(() => {
    lastValue = current()?.value
  })
  createEffect(on(current, (option) => option && props.onMove?.(option), { defer: true }))

  const move = (delta: number) => {
    const count = flat().length
    if (count === 0) return
    const next = (selected() + delta + count) % count
    setSelected(next)
    scroll?.scrollChildIntoView?.(`row-${next}`)
  }
  const choose = () => {
    const option = current()
    if (option) afterDispatch(() => props.onSelect?.(option))
  }

  // Up and down only: a text field is focused, so j and k must reach it.
  useBindings(() => ({
    mode: "modal",
    bindings: [
      { key: "up,ctrl+p", cmd: () => move(-1) },
      { key: "down,ctrl+n", cmd: () => move(1) },
      { key: "pageup", cmd: () => move(-10) },
      { key: "pagedown", cmd: () => move(10) },
      { key: "return", cmd: choose },
    ],
  }))

  const height = () => Math.max(5, Math.floor(dimensions().height / 2) - 4)
  const indexOf = (option: SelectOption<T>) => flat().indexOf(option)

  return (
    <box flexDirection="column" gap={1}>
      <DialogHeader title={props.title} />
      <box paddingLeft={DIALOG_INSET} paddingRight={DIALOG_INSET}>
        <input
          ref={(r: InputRenderable) => {
            input = r
            setTimeout(() => !input?.isDestroyed && input?.focus(), 1)
          }}
          onInput={(value: string) => setFilter(value)}
          placeholder={props.placeholder ?? "Type to filter"}
          placeholderColor={theme().muted}
          textColor={theme().text}
          focusedTextColor={theme().text}
          backgroundColor={theme().panel}
          focusedBackgroundColor={theme().panel}
          cursorColor={theme().accent}
        />
      </box>
      <Show when={flat().length > 0} fallback={<text fg={theme().muted} paddingLeft={DIALOG_INSET}>No results</text>}>
        <scrollbox ref={(r: ScrollBoxRenderable) => (scroll = r)} maxHeight={height()} scrollbarOptions={{ visible: false }}>
          <For each={grouped()}>
            {([category, options], g) => (
              <>
                <Show when={category}>
                  <box paddingLeft={DIALOG_INSET} paddingTop={g() === 0 ? 0 : 1}>
                    <text fg={theme().accent} attributes={TextAttributes.BOLD}>
                      {category}
                    </text>
                  </box>
                </Show>
                <For each={options}>
                  {(option) => {
                    const active = () => current() === option
                    return (
                      <box
                        id={`row-${indexOf(option)}`}
                        flexDirection="row"
                        paddingLeft={DIALOG_INSET}
                        paddingRight={DIALOG_INSET}
                        backgroundColor={active() ? theme().selection : RGBA.fromInts(0, 0, 0, 0)}
                        onMouseDown={() => setSelected(indexOf(option))}
                        onMouseUp={() => afterDispatch(() => props.onSelect?.(option))}
                      >
                        <text flexGrow={1} fg={theme().text} wrapMode="none" overflow="hidden">
                          {option.title}
                        </text>
                        <Show when={option.footer}>
                          <text flexShrink={0} fg={theme().muted} marginLeft={2}>
                            {option.footer}
                          </text>
                        </Show>
                      </box>
                    )
                  }}
                </For>
              </>
            )}
          </For>
        </scrollbox>
      </Show>
      <Show when={props.hint}>
        <text fg={theme().muted} paddingLeft={DIALOG_INSET}>
          {props.hint}
        </text>
      </Show>
    </box>
  )
}
