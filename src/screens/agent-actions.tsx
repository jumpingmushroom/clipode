// Agent commands shared by the Agents screen (on the selected agent) and agent detail: wake, pause or resume, and clear an error.
import { useCommands, type AppCommand } from "../keymap/commands.tsx"
import { createDialogs } from "../plugin/dialogs.tsx"
import type { AgentSummary } from "../store/agents.ts"
import { useCompany, useStores } from "../store/context.tsx"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"

export function useAgentActions(agent: () => AgentSummary | undefined) {
  const { session } = useStores()
  const company = useCompany()
  const toast = useToast()
  const dialogs = createDialogs(useDialog())

  const run = (done: string, action: () => Promise<void>) => action().then(() => toast.show(done, "success"), (err) => toast.error(err))
  // Dialogs open after the key dispatch: the keymap forbids adding layers during one.
  const wake = () =>
    afterDispatch(async () => {
      const a = agent()
      if (!a) return
      const reason = await dialogs.prompt(`Wake ${a.name}`, "Optional: what should it look at? enter to wake")
      if (reason === null) return
      void run(`${a.name} woken`, () => company.agents.wake(a.id, reason.trim() || undefined))
    })
  // One key for both: a paused agent resumes at once; pausing a working one asks first, since it interrupts work.
  const pauseOrResume = () =>
    afterDispatch(async () => {
      const a = agent()
      if (!a) return
      if (a.status === "paused") return void run(`${a.name} resumed`, () => company.agents.resume(a.id))
      if (!(await dialogs.confirm(`Pause ${a.name}?`, "p resumes it later."))) return
      void run(`${a.name} paused`, () => company.agents.pause(a.id))
    })

  const clearError = () => {
    const a = agent()
    if (!a) return
    if (a.status !== "error") return toast.show(`${a.name} is not in error`, "info")
    void run(`${a.name} is idle again`, () => company.agents.clearError(a.id))
  }

  useCommands(() =>
    session.client().writes
      ? ([
          { name: "agent.wake", title: "Wake agent", category: "Agent", keys: "w", run: wake },
          { name: "agent.pause", title: "Pause or resume agent", category: "Agent", keys: "p", run: pauseOrResume },
          { name: "agent.clear-error", title: "Clear agent error", category: "Agent", keys: "x", run: clearError },
        ] satisfies AppCommand[])
      : [],
  )
}
