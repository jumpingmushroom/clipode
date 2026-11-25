import type { Agent } from "@paperclipai/shared"
import type { Client } from "../client.ts"
import type { AgentSummary } from "../model.ts"

export async function listAgents(client: Client, companyId: string): Promise<AgentSummary[]> {
  const agents = await client.get<Agent[]>(`/api/companies/${encodeURIComponent(companyId)}/agents`)
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    title: a.title,
    status: a.status,
    adapterType: a.adapterType,
    model: typeof a.adapterConfig?.model === "string" ? a.adapterConfig.model : null,
    reportsTo: a.reportsTo,
  }))
}

export type ModelOption = { id: string; label: string }

/** The models an adapter offers, for the model choice when creating a task. */
export async function listModels(client: Client, companyId: string, adapterType: string): Promise<ModelOption[]> {
  const rows = await client.get<{ id: string; label?: string }[]>(`/api/companies/${encodeURIComponent(companyId)}/adapters/${encodeURIComponent(adapterType)}/models`)
  return rows.map((m) => ({ id: m.id, label: m.label ?? m.id }))
}

// Agent controls (phase 3), as probed in the scratch company.
const agentPath = (agentId: string, verb: string) => `/api/agents/${encodeURIComponent(agentId)}/${verb}`

export const pauseAgent = (client: Client, agentId: string) => client.post(agentPath(agentId, "pause"), {})

/** Resume answers before the agent's status changes; read the agent again a moment later. */
export const resumeAgent = (client: Client, agentId: string) => client.post(agentPath(agentId, "resume"), {})

/** Starts a run now. The same idempotency key makes a retry start no second run. */
export function wakeAgent(client: Client, agentId: string, idempotencyKey: string, reason?: string) {
  return client.post(agentPath(agentId, "wakeup"), { source: "on_demand", triggerDetail: "manual", idempotencyKey, ...(reason ? { reason } : {}) })
}

/** Runs a failed run that had no task again, as the web UI's retry does. The server checks the run did fail. */
export function retryRun(client: Client, agentId: string, failedRunId: string, idempotencyKey: string) {
  return client.post(agentPath(agentId, "wakeup"), { source: "on_demand", triggerDetail: "manual", reason: "retry_failed_run", failedRunId, idempotencyKey })
}

/** Returns an agent in error status to idle. Any other status answers 409. */
export const clearAgentError = (client: Client, agentId: string) => client.post(agentPath(agentId, "clear-error"), {})
