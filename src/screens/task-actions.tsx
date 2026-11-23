// Task commands shared by the task list (on the selected row) and the thread: status, priority, assignee, edit, new.
import { useCommands, type AppCommand } from "../keymap/commands.tsx"
import { createDialogs } from "../plugin/dialogs.tsx"
import { useRoute } from "../route.tsx"
import { useCompany, useStores } from "../store/context.tsx"
import type { TaskPatch, TaskSummary } from "../store/issues.ts"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"
import { PRIORITY, STATUS_GROUPS } from "./tasks.tsx"
import { TaskDialog } from "./task-dialog.tsx"

export function useTaskActions(task: () => TaskSummary | undefined, opts: { description?: () => string | null } = {}) {
  const { session } = useStores()
  const company = useCompany()
  const route = useRoute()
  const toast = useToast()
  const dialog = useDialog()
  const dialogs = createDialogs(dialog)

  const change = (done: string, patch: TaskPatch) => {
    const t = task()
    if (!t) return
    company.issues.update(t.id, patch).then(
      () => toast.show(`${t.identifier ?? "Task"}: ${done}`, "success"),
      (err) => toast.error(err),
    )
  }
  // Dialogs open after the key dispatch: the keymap forbids adding layers during one.
  const later = (fn: () => Promise<void>) => afterDispatch(() => void fn())

  const status = () =>
    later(async () => {
      const t = task()
      if (!t) return
      const next = await dialogs.select("Status", STATUS_GROUPS.map((g) => ({ title: g.title, value: g.status, footer: g.status === t.status ? "current" : undefined })))
      if (next && next !== t.status) change(STATUS_GROUPS.find((g) => g.status === next)!.title.toLowerCase(), { status: next })
    })
  const priority = () =>
    later(async () => {
      const t = task()
      if (!t) return
      const next = await dialogs.select("Priority", Object.entries(PRIORITY).map(([value, p]) => ({ title: `${p.mark} ${p.label}`, value, footer: value === t.priority ? "current" : undefined })))
      if (next && next !== t.priority) change(`priority ${PRIORITY[next]!.label}`, { priority: next })
    })
  const assign = () =>
    later(async () => {
      const t = task()
      if (!t) return
      const agents = company.agents.list.data.filter((a) => a.status !== "terminated")
      const next = await dialogs.select("Assign to", [
        { title: "Unassigned", value: "", footer: t.assigneeAgentId ? undefined : "current" },
        ...agents.map((a) => ({ title: a.name, value: a.id, footer: a.id === t.assigneeAgentId ? "current" : (a.title ?? a.role) })),
      ])
      if (next === null || next === (t.assigneeAgentId ?? "")) return
      change(next ? `assigned to ${agents.find((a) => a.id === next)?.name}` : "unassigned", { assigneeAgentId: next || null })
    })
  const edit = () =>
    later(async () => {
      const t = task()
      if (!t) return
      dialog.replace(
        () => (
          <TaskDialog
            heading={`Edit ${t.identifier ?? "task"}`}
            edit
            initial={{ description: opts.description?.() ?? "", title: t.title, projectId: t.projectId, assigneeAgentId: t.assigneeAgentId, model: null, workMode: "standard", private: false }}
            onSubmit={async (form) => {
              await company.issues.update(t.id, {
                title: form.title.trim() || t.title,
                // List rows carry no description, so it is sent only when it was loaded (in the thread).
                ...(opts.description ? { description: form.description.trim() || null } : {}),
                ...(form.projectId !== t.projectId ? { projectId: form.projectId } : {}),
                ...(form.assigneeAgentId !== t.assigneeAgentId ? { assigneeAgentId: form.assigneeAgentId } : {}),
              })
              dialog.clear()
              toast.show(`${t.identifier ?? "Task"}: saved`, "success")
            }}
          />
        ),
        undefined,
        "large",
      )
    })
  const create = () =>
    later(async () => {
      const t = task()
      dialog.replace(
        () => (
          <TaskDialog
            heading="New task"
            // Like the web UI, a new task starts in the project of the task on screen.
            initial={{ description: "", title: "", projectId: t?.projectId ?? null, assigneeAgentId: null, model: null, workMode: "standard", private: false }}
            onSubmit={async (form) => {
              const created = await company.issues.create({
                description: form.description.trim() || undefined,
                title: form.title.trim() || undefined,
                projectId: form.projectId,
                assigneeAgentId: form.assigneeAgentId,
                model: form.model,
                workMode: form.workMode,
                private: form.private,
              })
              dialog.clear()
              toast.show(`${created.identifier ?? "Task"} created`, "success")
              route.navigate({ name: "thread", id: created.id })
            }}
          />
        ),
        undefined,
        "large",
      )
    })

  useCommands(() =>
    session.client().writes
      ? ([
          { name: "task.status", title: "Change status", category: "Task", keys: "s", run: status },
          { name: "task.priority", title: "Change priority", category: "Task", keys: "p", run: priority },
          { name: "task.assign", title: "Assign", category: "Task", keys: "a", run: assign },
          { name: "task.edit", title: "Edit title and description", category: "Task", keys: "e", run: edit },
          { name: "task.new", title: "New task", category: "Task", keys: "n", run: create },
        ] satisfies AppCommand[])
      : [],
  )
}
