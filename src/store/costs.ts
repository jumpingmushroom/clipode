// The cost report for the Costs screen, for this month or all time. Loaded when the screen opens.
import { createSignal } from "solid-js"
import { getCostReport, type CostPeriod } from "../api/endpoints/costs.ts"
import type { CostReport } from "../api/model.ts"
import { createResource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { CostPeriod } from "../api/endpoints/costs.ts"
export type { CostReport, Usage } from "../api/model.ts"

export function createCostsStore(session: Session, companyId: string) {
  const [period, setPeriod] = createSignal<CostPeriod>("month")
  const report = createResource<CostReport | null>(() => getCostReport(session.client(), companyId, period()), null, session.handleError)
  return {
    report,
    period,
    setPeriod(next: CostPeriod) {
      setPeriod(next)
      void report.refresh()
    },
  }
}
