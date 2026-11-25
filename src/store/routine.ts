// One routine opened from Routines: its details and runs, loaded on first use, and running, pausing or resuming it.
import { getRoutine, listRoutineRuns, runRoutine, setRoutineStatus } from "../api/endpoints/routines.ts"
import type { RoutineDetail, RoutineRun, RoutineSummary } from "../api/model.ts"
import { createResource, type Resource } from "./resource.ts"
import type { Session } from "./session.ts"

export function createRoutineStore(session: Session, list: Resource<RoutineSummary[]>) {
  const details = new Map<string, Resource<RoutineDetail | null>>()
  const runs = new Map<string, Resource<RoutineRun[]>>()
  const notSent = (err: unknown) => Promise.reject(session.notSent(err))
  const refresh = (routineId: string) => {
    void list.refresh()
    void details.get(routineId)?.refresh()
    void runs.get(routineId)?.refresh()
  }
  return {
    detail(routineId: string) {
      if (!details.has(routineId)) details.set(routineId, createResource<RoutineDetail | null>(() => getRoutine(session.client(), routineId), null, session.handleError))
      return details.get(routineId)!
    },
    runs(routineId: string) {
      if (!runs.has(routineId)) runs.set(routineId, createResource<RoutineRun[]>(() => listRoutineRuns(session.client(), routineId), [], session.handleError))
      return runs.get(routineId)!
    },
    /** Runs the routine now; answers the run's status. */
    async runNow(routineId: string): Promise<string> {
      const run = await runRoutine(session.client(), routineId, crypto.randomUUID()).catch(notSent)
      refresh(routineId)
      return run.status
    },
    async setStatus(routineId: string, status: "active" | "paused") {
      await setRoutineStatus(session.client(), routineId, status).catch(notSent)
      refresh(routineId)
    },
  }
}
