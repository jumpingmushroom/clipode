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
