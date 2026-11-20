import type { Company } from "@paperclipai/shared"
import type { Client } from "../client.ts"
import type { CompanySummary } from "../model.ts"

export async function listCompanies(client: Client): Promise<CompanySummary[]> {
  const companies = await client.get<Company[]>("/api/companies")
  return companies.map((c) => ({ id: c.id, name: c.name, prefix: c.issuePrefix ?? null }))
}
