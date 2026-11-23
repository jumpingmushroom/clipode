import { expect, test } from "bun:test"
import { COMPANY_ID, RUN_ID, THREAD_ID } from "../fake-server.ts"
import agents from "../fixtures/company/agents.json"
import feed from "../fixtures/company/attention-feed.json"
import { startApp } from "../helpers.tsx"
import type { Route } from "../../src/route.tsx"

const starts: Route[] = [
  { name: "inbox" }, { name: "tasks" }, { name: "agents" }, { name: "routines" }, { name: "activity" },
  { name: "thread", id: THREAD_ID }, { name: "run", id: RUN_ID }, { name: "agent", id: agents[0]!.id }, { name: "item", id: feed.items[0]!.id },
]
// Every screen, alternating the two keys, so a screen binding that swallows g or the second key shows up.
for (const [i, start] of starts.entries()) {
  const [key, view] = i % 2 ? (["r", "Routines"] as const) : (["h", "Activity"] as const)
  test(`g ${key} goes to ${view} from ${start.name}`, async () => {
      const app = await startApp({ route: start, before: (s) => { s.set(`/api/companies/${COMPANY_ID}/routines`, []); s.set(`/api/companies/${COMPANY_ID}/activity`, []) } })
      await app.frame()
      app.mockInput.pressKey("g")
      app.mockInput.pressKey(key)
      const top = (await app.frame()).split("\n")[0]!
      app.renderer.destroy()
      expect(top).toContain(view)
    })
}
