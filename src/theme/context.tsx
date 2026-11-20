// The active theme as a Solid context: follows the terminal's dark or light mode, supports live preview.
import type { SyntaxStyle, TerminalColors } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createContext, createMemo, createSignal, onCleanup, onMount, useContext, type Accessor, type ParentProps } from "solid-js"
import type { ThemeJson } from "./format.ts"
import { BUILTIN_THEMES, defaultThemeName, resolveTheme, SYSTEM, type Mode } from "./registry.ts"
import { createSyntaxStyleMemo, generateSyntax } from "./syntax.ts"
import type { Theme } from "./tokens.ts"

export type ThemeContext = {
  theme: Accessor<Theme>
  /** Code and Markdown highlighting for the current theme. */
  syntax: Accessor<SyntaxStyle>
  /** The chosen theme name; undefined means the default for the current mode. */
  name: Accessor<string | undefined>
  mode: Accessor<Mode>
  /** Every selectable theme name, built-ins first. */
  names: Accessor<string[]>
  set(name: string | undefined): void
  /** Shows a theme without choosing it; pass undefined to end the preview. */
  preview(name: string | undefined): void
}

const Ctx = createContext<ThemeContext>()

export function ThemeProvider(
  props: ParentProps<{
    name?: string
    /** Forces dark or light; otherwise the terminal decides. */
    mode?: Mode
    themes?: Record<string, ThemeJson>
    onChange?: (name: string | undefined) => void
  }>,
) {
  const renderer = useRenderer()
  const themes = { ...BUILTIN_THEMES, ...props.themes }
  const [name, setName] = createSignal(props.name)
  const [previewName, setPreview] = createSignal<string>()
  const [mode, setMode] = createSignal<Mode>(props.mode ?? renderer.themeMode ?? "dark")
  const [terminal, setTerminal] = createSignal<TerminalColors>()

  onMount(() => {
    const onMode = (next: Mode) => {
      if (!props.mode) setMode(next)
    }
    const onPalette = (colors: TerminalColors) => setTerminal(colors)
    renderer.on("theme_mode", onMode)
    renderer.on("palette", onPalette)
    onCleanup(() => {
      renderer.off("theme_mode", onMode)
      renderer.off("palette", onPalette)
    })
  })

  const wanted = () => previewName() ?? name()
  const theme = createMemo(() => {
    const current = wanted()
    // The terminal palette is only queried once someone asks for the system theme.
    if (current === SYSTEM && !terminal()) renderer.getPalette({ size: 16 }).then(setTerminal, () => {})
    return resolveTheme(current, mode(), themes, terminal())
  })

  const syntax = createSyntaxStyleMemo(() => generateSyntax(theme().palette, renderer.nativeScene))

  const value: ThemeContext = {
    theme,
    syntax,
    name,
    mode,
    names: () => [defaultThemeName("dark"), defaultThemeName("light"), SYSTEM, ...Object.keys(themes).filter((n) => !n.startsWith("clipode-")).sort()],
    set(next) {
      setPreview(undefined)
      setName(next)
      props.onChange?.(next)
    },
    preview: setPreview,
  }
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>
}

export function useTheme(): ThemeContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useTheme needs a ThemeProvider")
  return ctx
}
