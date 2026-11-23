// Markdown rendered with the theme's syntax colours. Fenced code is highlighted by OpenTUI's default tree-sitter
// client, with bundled grammars for JavaScript, TypeScript, TSX, Markdown and Zig; other languages stay plain.
import { useTheme } from "../theme/context.tsx"

export function Markdown(props: { content: string; streaming?: boolean }) {
  const theme = useTheme()
  return (
    <markdown
      content={props.content}
      syntaxStyle={theme.syntax()}
      fg={theme.theme().text}
      conceal
      streaming={props.streaming ?? false}
      width="100%"
    />
  )
}
