// The company's agents, loaded once per session and looked up by id.
import { listAgents, listModels, pauseAgent, resumeAgent, wakeAgent, type ModelOption } from "../api/endpoints/agents.ts"
import { ApiError } from "../api/client.ts"
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
  const notSent = (err: unknown) => session.notSent(err)
  return {
    list,
    async pause(agentId: string) {
      await pauseAgent(session.client(), agentId).catch((err) => Promise.reject(notSent(err)))
      void list.refresh()
    },
    async resume(agentId: string) {
      await resumeAgent(session.client(), agentId).catch((err) => Promise.reject(notSent(err)))
      void list.refresh()
      // The server applies a resume a moment after answering.
      setTimeout(() => void list.refresh(), 2000)
    },
    /** Wakes an agent, retrying once after a network error with the same idempotency key. */
    async wake(agentId: string, reason?: string) {
      const key = crypto.randomUUID()
      const send = () => wakeAgent(session.client(), agentId, key, reason)
      await send()
        .catch((err) => (err instanceof ApiError && err.kind === "network" ? send() : Promise.reject(err)))
        .catch((err) => Promise.reject(notSent(err)))
      void list.refresh()
    },
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
    /** The team as screens count it: every agent except terminated ones. */
    active: () => list.data.filter((a) => a.status !== "terminated"),
  }
}

export type AgentsStore = ReturnType<typeof createAgentsStore>
