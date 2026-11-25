// Gives screens the session and the stores of the selected company. Company stores are rebuilt on a switch.
import { createContext, createMemo, useContext, type Accessor, type ParentProps } from "solid-js"
import { createAgentsStore } from "./agents.ts"
import { createAttentionStore } from "./attention.ts"
import { createIssuesStore } from "./issues.ts"
import { listActivity } from "../api/endpoints/activity.ts"
import { listArtifacts } from "../api/endpoints/artifacts.ts"
import { approvalTask, listDecided } from "../api/endpoints/decided.ts"
import { listRoutines } from "../api/endpoints/routines.ts"
import { searchCompany } from "../api/endpoints/search.ts"
import type { ActivityEntry, Artifact, DecidedEntry, RoutineSummary } from "../api/model.ts"
import { createResource } from "./resource.ts"
import { createCostsStore } from "./costs.ts"
import { createRoutineStore } from "./routine.ts"
import { createRunsStore } from "./runs.ts"
import type { Session } from "./session.ts"

export function createCompanyStores(session: Session, companyId: string) {
  const routines = createResource<RoutineSummary[]>(() => listRoutines(session.client(), companyId), [], session.handleError)
  return {
    companyId,
    attention: createAttentionStore(session, companyId),
    agents: createAgentsStore(session, companyId),
    runs: createRunsStore(session, companyId),
    issues: createIssuesStore(session, companyId),
    costs: createCostsStore(session, companyId),
    routines,
    routine: createRoutineStore(session, routines),
    activity: createResource<ActivityEntry[]>(() => listActivity(session.client(), companyId), [], session.handleError),
    artifacts: createResource<Artifact[]>(() => listArtifacts(session.client(), companyId), [], session.handleError),
    decided: createResource<DecidedEntry[]>(() => listDecided(session.client(), companyId), [], session.handleError),
    approvalTask: (approvalId: string) => approvalTask(session.client(), approvalId),
    /** Searches the company on the server; an expired session is handled like any other read. */
    search: (q: string) =>
      searchCompany(session.client(), companyId, q).catch((err) => {
        session.handleError(err)
        throw err
      }),
  }
}
export type CompanyStores = ReturnType<typeof createCompanyStores>

type StoresValue = { session: Session; company: Accessor<CompanyStores | undefined> }
const Ctx = createContext<StoresValue>()

export function StoresProvider(props: ParentProps<{ session: Session }>) {
  const company = createMemo(() => {
    const id = props.session.state.companyId
    return id && props.session.state.status === "ready" ? createCompanyStores(props.session, id) : undefined
  })
  return <Ctx.Provider value={{ session: props.session, company }}>{props.children}</Ctx.Provider>
}

export function useStores(): StoresValue {
  const value = useContext(Ctx)
  if (!value) throw new Error("useStores needs a StoresProvider")
  return value
}

/** The selected company's stores; only call inside screens shown while a company is selected. */
export function useCompany(): CompanyStores {
  const company = useStores().company()
  if (!company) throw new Error("no company selected")
  return company
}
