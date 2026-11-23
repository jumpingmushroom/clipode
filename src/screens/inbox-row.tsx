// One inbox row: kind marker, title, task identifier, agent and age, in fixed columns.
import { RGBA } from "@opentui/core"
import type { InboxItem } from "../store/attention.ts"
import type { Theme } from "../theme/tokens.ts"
import { age, fit } from "../ui/format.ts"

export const MARKERS: Record<InboxItem["kind"], string> = {
  question: "?",
  confirmation: "!",
  approval: "◆",
  review: "◇",
  failed_run: "✗",
  blocked: "■",
  other: "•",
}

export const KIND_LABELS: Record<InboxItem["kind"], [singular: string, plural: string]> = {
  question: ["question", "Questions"],
  confirmation: ["confirmation", "Confirmations"],
  approval: ["approval", "Approvals"],
  review: ["review", "Reviews"],
  failed_run: ["failed run", "Failed runs"],
  blocked: ["blocked task", "Blocked tasks"],
  other: ["other", "Other"],
}

export function markerColor(kind: InboxItem["kind"], theme: Theme): RGBA {
  if (kind === "failed_run") return theme.error
  if (kind === "confirmation" || kind === "blocked") return theme.warning
  if (kind === "other") return theme.muted
  return theme.accent
}

export type Columns = { title: number; identifier: number; agent: number }

/** Column widths for a row of the given width: identifier and agent fixed, title takes the rest. */
export function columns(width: number, identifierWidth: number): Columns {
  const agent = 10
  return { identifier: identifierWidth + 2, agent, title: Math.max(10, width - 2 - (identifierWidth + 2) - agent - 3 - 2) }
}

export function InboxRow(props: { item: InboxItem; agentName: string; selected: boolean; cols: Columns; theme: Theme; now: number }) {
  const t = () => props.theme
  return (
    <box flexDirection="row" paddingLeft={2} backgroundColor={props.selected ? t().selection : RGBA.fromInts(0, 0, 0, 0)}>
      <text wrapMode="none" fg={t().text}>
        <span style={{ fg: markerColor(props.item.kind, t()) }}>{MARKERS[props.item.kind]}</span>
        {" " + fit(props.item.title, props.cols.title) + "  "}
        <span style={{ fg: t().muted }}>{fit(props.item.identifier ?? "—", props.cols.identifier)}</span>
        {fit(props.agentName, props.cols.agent)}
        <span style={{ fg: t().muted }}>{fit(age(props.item.createdAt, props.now), 3, "right")}</span>
      </text>
    </box>
  )
}
