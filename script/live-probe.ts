// Opens the live-events WebSocket from Bun with the session cookie and reports what the server answers.
// Sends only the read-only protocol messages live.hello and live.interests. LIVE_HOLD_SECONDS sets the hold (default 65).
import { signedInClient } from "./env.ts"

const holdMs = Number(process.env.LIVE_HOLD_SECONDS ?? 65) * 1000
const client = await signedInClient()
const t0 = () => `${String(Math.round(performance.now() - started)).padStart(6)} ms`
let started = performance.now()

function connect(label: string, url: string, headers: Record<string, string>, runId: string | null, hold: number) {
  return new Promise<void>((resolve) => {
    started = performance.now()
    console.log(`\n[${label}]`)
    const ws = new WebSocket(url, { headers })
    const timer = setTimeout(() => ws.close(1000, "probe done"), hold)
    ws.onopen = () => {
      console.log(`${t0()}  open`)
      ws.send(JSON.stringify({ type: "live.hello", version: 1, capabilities: ["run-interests"] }))
      console.log(`${t0()}  sent live.hello`)
    }
    ws.onmessage = (event) => {
      let msg: { type?: string; payload?: Record<string, unknown> } & Record<string, unknown>
      try {
        msg = JSON.parse(String(event.data))
      } catch {
        console.log(`${t0()}  non-JSON message (${String(event.data).length} bytes)`)
        return
      }
      if (msg.type?.startsWith("live.")) console.log(`${t0()}  received ${JSON.stringify(msg)}`)
      else console.log(`${t0()}  event ${msg.type}, payload keys: ${Object.keys(msg.payload ?? {}).join(", ")}`)
      if (msg.type === "live.capabilities" && runId) {
        ws.send(JSON.stringify({ type: "live.interests", version: 1, revision: 1, runIds: [runId] }))
        console.log(`${t0()}  sent live.interests (revision 1, 1 run id)`)
      }
    }
    ws.onerror = (event) => console.log(`${t0()}  error: ${(event as ErrorEvent).message ?? event.type}`)
    ws.onclose = (event) => {
      clearTimeout(timer)
      console.log(`${t0()}  close code ${event.code}, reason ${JSON.stringify(event.reason)}, wasClean ${event.wasClean}`)
      resolve()
    }
  })
}

const companies = await client.get<{ id: string }[]>("/api/companies")
const company = companies[0]
if (!company) throw new Error("no companies visible to this user")
const runs = await client.get<{ id: string }[]>(`/api/companies/${company.id}/heartbeat-runs`, { limit: 1 })
const url = `${client.origin.replace(/^http/, "ws")}/api/companies/${company.id}/events/ws`
console.log(`WebSocket ${url.replace(company.id, "<company id>")}, hold ${holdMs / 1000} s`)

await connect("cookie only, no Origin", url, { Cookie: client.cookieHeader() }, runs[0]?.id ?? null, holdMs)
await connect("cookie and Origin", url, { Cookie: client.cookieHeader(), Origin: client.origin }, null, 3000)
await connect("no cookie (control)", url, {}, null, 3000)
