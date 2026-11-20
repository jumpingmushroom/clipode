// Gives screens the session and the stores of the selected company. Company stores are rebuilt on a switch.
import { createContext, createMemo, useContext, type Accessor, type ParentProps } from "solid-js"
import { createAgentsStore } from "./agents.ts"
import { createAttentionStore } from "./attention.ts"
import { createIssuesStore } from "./issues.ts"
import { createRunsStore } from "./runs.ts"
import type { Session } from "./session.ts"

export function createCompanyStores(session: Session, companyId: string) {
  return {
    companyId,
    attention: createAttentionStore(session, companyId),
    agents: createAgentsStore(session, companyId),
    runs: createRunsStore(session, companyId),
    issues: createIssuesStore(session, companyId),
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
