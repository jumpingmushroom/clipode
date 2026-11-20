// Checks test/fixtures for real instance data before a commit. Reads the real names from the instance into memory
// and searches every fixture for them, then lists string values that are not invented placeholders.
// Prints only counts and placeholder-free enum values, never the real strings. Exits 1 on any hit.
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { Agent, Company } from "@paperclipai/shared"
import { getSession, signOut } from "../src/api/auth.ts"
import { signedInClient } from "./env.ts"
import { FIELD_KEY } from "./scrub.ts"

const root = new URL("../test/fixtures/", import.meta.url).pathname
const client = await signedInClient()
const secrets = new Set<string>()
try {
  secrets.add(new URL(client.baseUrl).hostname)
  const session = await getSession(client)
  for (const v of [session?.user.email, session?.user.name, session?.user.email?.split("@")[0]]) if (v) secrets.add(v)
  for (const c of await client.get<Company[]>("/api/companies")) {
    secrets.add(c.name)
    if (c.issuePrefix) secrets.add(`${c.issuePrefix}-`)
    for (const a of await client.get<Agent[]>(`/api/companies/${c.id}/agents`)) secrets.add(a.name)
    for (const i of await client.get<{ title: string }[]>(`/api/companies/${c.id}/issues`)) secrets.add(i.title)
  }
} finally {
  await signOut(client)
}
const needles = [...secrets].filter((s) => s.length >= 3).map((s) => s.toLowerCase())

async function* files(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) yield* files(join(dir, e.name))
    else if (e.name.endsWith(".json")) yield join(dir, e.name)
  }
}

const UUID_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-/
const oddKeys = (value: unknown): number =>
  Array.isArray(value)
    ? value.reduce((n: number, v) => n + oddKeys(v), 0)
    : value && typeof value === "object"
      ? Object.entries(value).reduce((n, [k, v]) => n + (FIELD_KEY.test(k) || UUID_KEY.test(k) ? 0 : 1) + oddKeys(v), 0)
      : 0

let hits = 0
for await (const file of files(root)) {
  const raw = await readFile(file, "utf8")
  const text = raw.toLowerCase()
  const found = needles.filter((n) => text.includes(n)).length
  const keys = oddKeys(JSON.parse(raw))
  if (found || keys) {
    hits += found + keys
    console.log(`${file.slice(root.length)}: ${found} real value(s), ${keys} key(s) that are not field names`)
  }
}
console.log(`checked ${needles.length} real values against the fixtures: ${hits ? `${hits} HIT(S)` : "clean"}`)
process.exit(hits ? 1 : 0)
