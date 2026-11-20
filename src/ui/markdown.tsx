// Markdown rendered with the theme's syntax colours.
// shortcut: no tree-sitter client, so fenced code shows as plain text; add one (see opencode parsers-config.ts) with the run transcript.
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
