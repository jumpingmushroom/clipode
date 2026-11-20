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
