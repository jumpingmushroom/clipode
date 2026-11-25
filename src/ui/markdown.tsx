// Markdown rendered with the theme's syntax colours. Fenced code is highlighted by OpenTUI's default tree-sitter
// client, with bundled grammars for JavaScript, TypeScript, TSX, Markdown and Zig; other languages stay plain.
import type { MarkdownInlineHook, MarkdownRenderable } from "@opentui/core"
import { createEffect, on } from "solid-js"
import { useTheme } from "../theme/context.tsx"

export type MarkdownLinks = {
  inlineHook: MarkdownInlineHook
  /** Read reactively; a change runs the hook again on every block. */
  hookVersion: () => unknown
  /** Called with the `target` of the span clicked. */
  onTarget: (target: string) => void
}

export function Markdown(props: { content: string; streaming?: boolean; links?: MarkdownLinks }) {
  const theme = useTheme()
  let md: MarkdownRenderable | undefined
  createEffect(on(() => props.links?.hookVersion(), () => md?.rerunInlineHook(() => true), { defer: true }))
  return (
    <markdown
      ref={(r: MarkdownRenderable) => (md = r)}
      content={props.content}
      syntaxStyle={theme.syntax()}
      fg={theme.theme().text}
      conceal
      streaming={props.streaming ?? false}
      inlineHook={props.links?.inlineHook}
      onMouseUp={(e) => {
        const target = props.links && md?.targetAt(e.x, e.y)
        if (target) props.links!.onTarget(target)
      }}
      width="100%"
    />
  )
}
