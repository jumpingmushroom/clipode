// Task commands shared by the task list (on the selected row) and the thread: status, priority, assignee, edit, new.
import { useCommands, type AppCommand } from "../keymap/commands.tsx"
import { createDialogs } from "../plugin/dialogs.tsx"
import { useRoute } from "../route.tsx"
import { useCompany, useStores } from "../store/context.tsx"
import type { TaskPatch, TaskSummary } from "../store/issues.ts"
import { afterDispatch, useDialog } from "../ui/dialog.tsx"
import { useToast } from "../ui/toast.tsx"
import { PRIORITY, STATUS_GROUPS } from "./tasks.tsx"

export function useTaskActions(task: () => TaskSummary | undefined, opts: { description?: () => string | null } = {}) {
  const { session } = useStores()
  const company = useCompany()
  const route = useRoute()
  const toast = useToast()
  const dialogs = createDialogs(useDialog())

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
      const title = await dialogs.prompt(`Edit ${t.identifier ?? "task"}: title`, "Title", t.title)
      if (title === null) return
      // List rows carry no description, so from the list only the title is edited.
      const description = opts.description ? await dialogs.prompt(`Edit ${t.identifier ?? "task"}: description`, "Description (Markdown)", opts.description() ?? undefined) : ""
      if (description === null) return
      if (!title.trim()) return toast.show("A task needs a title", "warning")
      change("saved", { title: title.trim(), ...(opts.description ? { description: description.trim() || null } : {}) })
    })
  const create = () =>
    later(async () => {
      const title = await dialogs.prompt("New task: title", "Title")
      if (!title?.trim()) return
      const description = await dialogs.prompt("New task: description", "Optional description (Markdown), enter to create")
      if (description === null) return
      try {
        const created = await company.issues.create({ title: title.trim(), ...(description.trim() ? { description: description.trim() } : {}) })
        toast.show(`${created.identifier ?? "Task"} created`, "success")
        route.navigate({ name: "thread", id: created.id })
      } catch (err) {
        toast.error(err)
      }
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
