// The company's agents, loaded once per session and looked up by id.
import { listAgents } from "../api/endpoints/agents.ts"
import { listRuns } from "../api/endpoints/runs.ts"
import type { AgentSummary, RunDetail } from "../api/model.ts"
import { createResource, type Resource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { AgentSummary } from "../api/model.ts"

export function createAgentsStore(session: Session, companyId: string) {
  const list = createResource<AgentSummary[]>(() => listAgents(session.client(), companyId), [], session.handleError)
  const runs = new Map<string, Resource<RunDetail[]>>()
  return {
    list,
    /** Recent runs of one agent, newest first. */
    runs(agentId: string): Resource<RunDetail[]> {
      if (!runs.has(agentId)) runs.set(agentId, createResource<RunDetail[]>(() => listRuns(session.client(), companyId, agentId), [], session.handleError))
      return runs.get(agentId)!
    },
    byId: (id: string | null | undefined) => (id ? list.data.find((a) => a.id === id) : undefined),
  }
}

export type AgentsStore = ReturnType<typeof createAgentsStore>
