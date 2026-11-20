// Ported from opencode packages/theme/src/tui/syntax.ts and the syntax memo in packages/tui/src/context/theme.tsx
import { SyntaxStyle, type NativeResourceOwner, type RGBA, type ThemeTokenStyle } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import { createMemo, onCleanup } from "solid-js"
import type { Palette } from "./format.ts"

export function generateSyntax(p: Palette, owner: NativeResourceOwner): SyntaxStyle {
  const rules = [
    rule(["default"], p.text),
    rule(["comment", "comment.documentation"], p.syntaxComment, { italic: true }),
    rule(["string", "symbol", "character.special", "character"], p.syntaxString),
    rule(["number", "boolean", "constant", "float"], p.syntaxNumber),
    rule(["keyword.return", "keyword.conditional", "keyword.repeat", "keyword.coroutine"], p.syntaxKeyword, { italic: true }),
    rule(["keyword.type"], p.syntaxType, { bold: true, italic: true }),
    rule(["keyword.function", "function.method"], p.syntaxFunction),
    rule(["keyword"], p.syntaxKeyword, { italic: true }),
    rule(["keyword.import", "string.escape", "string.regexp", "tag.attribute", "keyword.export"], p.syntaxKeyword),
    rule(["operator", "keyword.operator", "punctuation.delimiter", "keyword.conditional.ternary"], p.syntaxOperator),
    rule(["variable", "variable.parameter", "function.method.call", "function.call", "property", "parameter", "field"], p.syntaxVariable),
    rule(["variable.member", "function", "constructor"], p.syntaxFunction),
    rule(["type", "module", "class", "namespace"], p.syntaxType),
    rule(["type.definition"], p.syntaxType, { bold: true }),
    rule(["punctuation", "punctuation.bracket"], p.syntaxPunctuation),
    rule(["variable.builtin", "type.builtin", "function.builtin", "module.builtin", "constant.builtin", "variable.super"], p.error),
    rule(["keyword.directive", "keyword.modifier", "keyword.exception"], p.syntaxKeyword, { italic: true }),
    rule(["punctuation.special", "tag.delimiter"], p.syntaxOperator),
    rule(["markup.heading", "markup.heading.2", "markup.heading.3", "markup.heading.4", "markup.heading.5", "markup.heading.6"], p.markdownHeading, { bold: true }),
    rule(["markup.heading.1"], p.markdownHeading, { bold: true, underline: true }),
    rule(["markup.bold", "markup.strong"], p.markdownStrong, { bold: true }),
    rule(["markup.italic"], p.markdownEmph, { italic: true }),
    rule(["markup.list"], p.markdownListItem),
    rule(["markup.quote"], p.markdownBlockQuote, { italic: true }),
    rule(["markup.raw", "markup.raw.block"], p.markdownCode),
    rule(["markup.raw.inline"], p.markdownCode, { background: p.background }),
    rule(["markup.link", "markup.link.url", "string.special", "string.special.url"], p.markdownLink, { underline: true }),
    rule(["markup.link.label"], p.markdownLinkText, { underline: true }),
    rule(["label"], p.markdownLinkText),
    rule(["markup.strikethrough", "markup.list.unchecked", "debug"], p.textMuted),
    rule(["markup.list.checked"], p.success),
    rule(["diff.plus"], p.diffAdded, { background: p.diffAddedBg }),
    rule(["diff.minus"], p.diffRemoved, { background: p.diffRemovedBg }),
    rule(["diff.delta"], p.diffContext, { background: p.diffContextBg }),
    rule(["error"], p.error, { bold: true }),
    rule(["warning"], p.warning, { bold: true }),
    rule(["info"], p.info),
  ]
  return SyntaxStyle.fromTheme(rules, owner)
}

function rule(scope: string[], foreground: RGBA, style: Omit<ThemeTokenStyle["style"], "foreground"> = {}): ThemeTokenStyle {
  return { scope, style: { foreground, ...style } }
}

/** A memo of syntax styles that frees each replaced style once the renderer is idle. */
export function createSyntaxStyleMemo(factory: () => SyntaxStyle) {
  const renderer = useRenderer()
  const retained = new Set<SyntaxStyle>()
  let current: SyntaxStyle | undefined
  const release = (style: SyntaxStyle) => {
    retained.add(style)
    void renderer
      .idle()
      .catch(() => {})
      .finally(() => {
        if (!retained.delete(style)) return
        style.destroy()
      })
  }
  onCleanup(() => {
    if (current) release(current)
  })
  return createMemo(() => {
    const previous = current
    current = factory()
    if (previous) release(previous)
    return current
  })
}
