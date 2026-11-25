// Rows and sidebar for agent commentary, shown on the Activity screen after `c`. An opened entry shows its whole text.
import { RGBA } from "@opentui/core"
import { Show } from "solid-js"
import type { CommentaryEntry } from "../api/model.ts"
import { useCompany } from "../store/context.tsx"
import type { Resource } from "../store/resource.ts"
import { useTheme } from "../theme/context.tsx"
import { age, dateTime, fit } from "../ui/format.ts"
import { Markdown } from "../ui/markdown.tsx"
import { SidebarHeader, SidebarLine } from "./inbox-sidebar.tsx"

export function CommentaryRow(props: { entry: CommentaryEntry; index: number; selected: boolean; open: boolean; now: number; onSelect: () => void; onOpen: () => void }) {
  const { theme } = useTheme()
  const company = useCompany()
  const body = () => (props.open ? company.commentaryBody(props.entry.id) : undefined)
  return (
    <box id={`activity-row-${props.index}`} flexDirection="column">
      <box flexDirection="row" paddingLeft={2} backgroundColor={props.selected ? theme().selection : RGBA.fromInts(0, 0, 0, 0)} onMouseDown={props.onSelect} onMouseUp={props.onOpen}>
        <text fg={theme().text} wrapMode="none">
          <span style={{ fg: theme().muted }}>{fit(age(props.entry.at, props.now), 4)}</span>
          <span style={{ fg: theme().accent }}>{fit(props.entry.agentName, 14)}</span>
          <span style={{ fg: props.entry.kind === "complaint" ? theme().warning : theme().text }}>{fit(props.entry.kind, 11)}</span>
          <span style={{ fg: theme().muted }}>{fit(props.entry.task?.identifier ?? "", 10)}</span>
          {props.entry.preview.replace(/\s+/g, " ")}
        </text>
      </box>
      <Show when={body()}>
        {(b: () => Resource<string | null>) => (
          <box paddingLeft={6} paddingRight={2} marginBottom={1}>
            <Show when={b().data !== null} fallback={<text fg={b().status === "error" ? theme().error : theme().muted}>{b().error ?? "Loading…"}</text>}>
              <Markdown content={b().data!} />
            </Show>
          </box>
        )}
      </Show>
    </box>
  )
}

export function CommentarySidebar(props: { entry: CommentaryEntry; total: number }) {
  const { theme } = useTheme()
  return (
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <SidebarHeader title="Commentary" />
        <SidebarLine label="By" value={props.entry.agentName} />
        <SidebarLine label="Kind" value={props.entry.kind} />
        <SidebarLine label="When" value={dateTime(props.entry.at)} />
      </box>
      <Show when={props.entry.task}>
        <box flexDirection="column">
          <SidebarHeader title="Task" />
          <text fg={theme().muted}>{props.entry.task!.identifier ?? ""}</text>
          <text fg={theme().text}>{props.entry.task!.title}</text>
        </box>
      </Show>
      <box flexDirection="column">
        <SidebarHeader title="Shown" count={props.total} />
      </box>
    </box>
  )
}
