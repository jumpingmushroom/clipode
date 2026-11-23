// The company's agents, loaded once per session and looked up by id.
import { listAgents, listModels, type ModelOption } from "../api/endpoints/agents.ts"
import { listRuns } from "../api/endpoints/runs.ts"
import type { AgentSummary, RunDetail } from "../api/model.ts"
import { createResource, type Resource } from "./resource.ts"
import type { Session } from "./session.ts"
export type { AgentSummary } from "../api/model.ts"
export type { ModelOption } from "../api/endpoints/agents.ts"

export function createAgentsStore(session: Session, companyId: string) {
  const list = createResource<AgentSummary[]>(() => listAgents(session.client(), companyId), [], session.handleError)
  const runs = new Map<string, Resource<RunDetail[]>>()
  const models = new Map<string, Resource<ModelOption[]>>()
  return {
    list,
    /** Models an adapter type offers, loaded once per type. */
    models(adapterType: string): Resource<ModelOption[]> {
      if (!models.has(adapterType)) models.set(adapterType, createResource<ModelOption[]>(() => listModels(session.client(), companyId, adapterType), [], session.handleError))
      return models.get(adapterType)!
    },
    /** Recent runs of one agent, newest first. */
    runs(agentId: string): Resource<RunDetail[]> {
      if (!runs.has(agentId)) runs.set(agentId, createResource<RunDetail[]>(() => listRuns(session.client(), companyId, agentId), [], session.handleError))
      return runs.get(agentId)!
    },
    byId: (id: string | null | undefined) => (id ? list.data.find((a) => a.id === id) : undefined),
  }
}

export type AgentsStore = ReturnType<typeof createAgentsStore>
