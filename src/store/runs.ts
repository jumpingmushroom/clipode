// Runs that are queued or running right now.
import { listLiveRuns } from "../api/endpoints/runs.ts"
import type { LiveRunSummary } from "../api/model.ts"
import { createResource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { LiveRunSummary } from "../api/model.ts"

export function createRunsStore(session: Session, companyId: string) {
  return { live: createResource<LiveRunSummary[]>(() => listLiveRuns(session.client(), companyId), [], session.handleError) }
}

export type RunsStore = ReturnType<typeof createRunsStore>
