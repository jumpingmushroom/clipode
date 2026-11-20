// Tasks. For now: the tasks in flight (in progress, in review, blocked), for the inbox sidebar.
import { listTasks } from "../api/endpoints/issues.ts"
import type { TaskSummary } from "../api/model.ts"
import { createResource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { TaskSummary } from "../api/model.ts"

export function createIssuesStore(session: Session, companyId: string) {
  const inFlight = createResource<TaskSummary[]>(
    () => listTasks(session.client(), companyId, "in_progress,in_review,blocked"),
    [],
    session.handleError,
  )
  return {
    inFlight,
    byId: (id: string | null | undefined) => (id ? inFlight.data.find((t) => t.id === id) : undefined),
  }
}

export type IssuesStore = ReturnType<typeof createIssuesStore>
