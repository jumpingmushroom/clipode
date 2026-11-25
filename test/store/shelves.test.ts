import { expect, test } from "bun:test"
import type { InboxItem } from "../../src/api/model.ts"
import { groupByShelf, shelfOf } from "../../src/store/shelves.ts"

const now = new Date(2026, 10, 20, 15, 0)
const item = (over: Partial<InboxItem>): InboxItem => ({
  id: "i", kind: "question", title: "t", identifier: null, issueId: null, agentName: null, agentId: null, whyNow: "",
  severity: "medium", createdAt: new Date(2026, 10, 10).toISOString(), activityAt: "", decideBy: null, expiresAt: null,
  snoozed: false, snoozedUntil: null, summary: null, blocked: null, blockedTaskCount: null, subjectId: "s", sourceKind: "x", dismissalKey: "k", reviewStalled: false,
  ...over,
})

test("shelf rule", () => {
  expect(shelfOf(item({ decideBy: "today" }), now)).toBe("decide")
  expect(shelfOf(item({ decideBy: "2026-11-19" }), now)).toBe("decide")
  expect(shelfOf(item({ decideBy: "this_week" }), now)).toBe("earlier")
  expect(shelfOf(item({ decideBy: "2026-11-25" }), now)).toBe("earlier")
  expect(shelfOf(item({ expiresAt: new Date(2026, 10, 21, 10).toISOString() }), now)).toBe("decide")
  expect(shelfOf(item({ expiresAt: new Date(2026, 10, 23).toISOString() }), now)).toBe("earlier")
  expect(shelfOf(item({ severity: "high" }), now)).toBe("decide")
  expect(shelfOf(item({ createdAt: new Date(2026, 10, 20, 9).toISOString() }), now)).toBe("today")
  expect(shelfOf(item({ severity: "high", snoozed: true }), now)).toBe("snoozed")
})

test("grouping keeps the server order inside each shelf", () => {
  const items = [item({ id: "a" }), item({ id: "b", severity: "high" }), item({ id: "c" })]
  const g = groupByShelf(items, now)
  expect(g.decide.map((i) => i.id)).toEqual(["b"])
  expect(g.earlier.map((i) => i.id)).toEqual(["a", "c"])
})

test("a bare decide-by date is a local day, also west of UTC", () => {
  // In a process of its own, since the time zone is read once.
  const script = `import { shelfOf } from "./src/store/shelves.ts"
    const now = new Date(2026, 10, 20, 15, 0)
    const item = { snoozed: false, severity: "medium", expiresAt: null, createdAt: new Date(2026, 10, 10).toISOString() }
    console.log(shelfOf({ ...item, decideBy: "2026-11-21" }, now), shelfOf({ ...item, decideBy: "2026-11-20" }, now))`
  const out = Bun.spawnSync([process.execPath, "-e", script], { env: { ...process.env, TZ: "America/New_York" } })
  expect(out.stdout.toString().trim()).toBe("earlier decide")
})
