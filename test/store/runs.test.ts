import { afterAll, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { Client } from "../../src/api/client.ts"
import { createTranscript } from "../../src/store/runs.ts"
import type { Session } from "../../src/store/session.ts"

const record = (text: string) => JSON.stringify({ ts: "2026-11-20T10:00:00.000Z", stream: "stdout", chunk: text + "\n" }) + "\n"
const log = [record("first line"), record("last line")]
let written = 1
let gate: Promise<void> = Promise.resolve()
let logReads = 0
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname.endsWith("/log")) {
      logReads++
      const content = log.slice(0, written).join("").slice(Number(url.searchParams.get("offset")))
      await gate
      return Response.json({ content })
    }
    return Response.json({ id: "r1", status: "running", agentId: "a", createdAt: "2026-11-20T10:00:00.000Z" })
  },
})
afterAll(() => server.stop(true))

test("a read asked for while another is on its way runs once more, so the last lines are not missed", async () => {
  const session = { client: () => new Client(`http://127.0.0.1:${server.port}`), handleError() {} } as unknown as Session
  const t = createRoot(() => createTranscript(session, "r1"))
  let release = () => {}
  gate = new Promise((done) => (release = done))
  const first = t.poll()
  while (logReads === 0) await Bun.sleep(5)
  // The run writes its last line while the first read is on its way, and a live event asks for another read.
  written = 2
  const second = t.poll()
  await Bun.sleep(30)
  release()
  await Promise.all([first, second])
  expect(t.items().map((i) => ("text" in i ? i.text : "")).join("|")).toContain("last line")
})
