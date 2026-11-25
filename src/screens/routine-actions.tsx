// Routine commands shared by Routines (on the selected routine) and routine detail: run now, and pause or resume.
import { useCommands, type AppCommand } from "../keymap/commands.tsx"
import { createDialogs } from "../plugin/dialogs.tsx"
import type { RoutineSummary } from "../api/model.ts"
import { useCompany, useStores } from "../store/context.tsx"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"

/** What a run-now answer means, in words. */
export function runOutcome(status: string): string {
  if (status === "issue_created") return "Routine run started"
  if (status === "coalesced") return "A run is still going; this one joined it"
  if (status === "skipped") return "Skipped: a run is still going"
  return `Routine run ${status.replace(/_/g, " ")}`
}

export function useRoutineActions(routine: () => RoutineSummary | undefined) {
  const { session } = useStores()
  const company = useCompany()
  const toast = useToast()
  const dialogs = createDialogs(useDialog())

  // Running creates a task and wakes the agent, so it is confirmed; dialogs open after the key dispatch.
  const runNow = () =>
    afterDispatch(async () => {
      const r = routine()
      if (!r) return
      const agent = company.agents.byId(r.assigneeAgentId)?.name ?? "its agent"
      const note = r.activeTask ? ` A run is still going (${r.activeTask.identifier ?? "a task"}).` : ""
      if (!(await dialogs.confirm(`Run ${r.title} now?`, `${agent} gets a new task.${note}`))) return
      company.routine.runNow(r.id).then(
        (status) => toast.show(runOutcome(status), "success"),
        (err) => toast.error(err),
      )
    })
  // Pausing stops the triggers; nothing running is interrupted, so neither way is confirmed.
  const pauseOrResume = () => {
    const r = routine()
    if (!r) return
    const next = r.status === "paused" ? "active" : "paused"
    company.routine.setStatus(r.id, next).then(
      () => toast.show(`${r.title} ${next === "paused" ? "paused" : "resumed"}`, "success"),
      (err) => toast.error(err),
    )
  }

  useCommands(() =>
    session.client().writes
      ? ([
          { name: "routine.run", title: "Run routine now", category: "Routine", keys: "w", run: runNow },
          { name: "routine.pause", title: "Pause or resume routine", category: "Routine", keys: "p", run: pauseOrResume },
        ] satisfies AppCommand[])
      : [],
  )
}
