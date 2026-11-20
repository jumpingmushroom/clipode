// The company's agents, loaded once per session and looked up by id.
import { listAgents } from "../api/endpoints/agents.ts"
import type { AgentSummary } from "../api/model.ts"
import { createResource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { AgentSummary } from "../api/model.ts"

export function createAgentsStore(session: Session, companyId: string) {
  const list = createResource<AgentSummary[]>(() => listAgents(session.client(), companyId), [], session.handleError)
  return {
    list,
    byId: (id: string | null | undefined) => (id ? list.data.find((a) => a.id === id) : undefined),
  }
}

export type AgentsStore = ReturnType<typeof createAgentsStore>
