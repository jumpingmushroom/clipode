import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID } from "../fake-server.ts"
import feed from "../fixtures/company/attention-feed.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})
const PATH = `/api/companies/${COMPANY_ID}/inbox-dismissals`
// The first row on screen: the high-severity items lead Decide now, in feed order.
const first = feed.items.find((i) => i.severity === "high")!

test("d dismisses the selected item; u restores it", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("d")
  await Bun.sleep(60)
  expect(app.server.writes[0]).toEqual({ method: "POST", path: PATH, body: { itemKey: first.dismissalKey, kind: "dismiss" } })
  expect(await app.frame()).toContain("Dismissed · u to undo")

  // The server now reports the item as dismissed, so it sits in Snoozed.
  app.server.set(`/api/companies/${COMPANY_ID}/attention`, {
    ...feed,
    items: feed.items.map((i) => (i.id === first.id ? { ...i, dismissal: { kind: "dismiss", dismissedAt: "2026-11-23T10:00:00.000Z", snoozedUntil: null, isActive: true } } : i)),
  })
  app.mockInput.pressKey("r")
  expect(await app.frame()).toMatch(/▸ Snoozed {2}1/)
  app.mockInput.pressKey("u")
  await Bun.sleep(60)
  expect(app.server.writes[1]).toEqual({ method: "DELETE", path: `${PATH}/${encodeURIComponent(first.dismissalKey)}`, body: null })
  expect(await app.frame()).toContain("Restored")
})

test("s asks how long to snooze and sends the time", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("s")
  const text = await app.frame()
  expect(text).toContain("Snooze until")
  expect(text).toContain("Monday at 9:00")
  const before = Date.now()
  app.mockInput.pressEnter()
  await Bun.sleep(60)
  const body = app.server.writes[0]?.body as { itemKey: string; kind: string; snoozedUntil: string }
  expect(body).toMatchObject({ itemKey: first.dismissalKey, kind: "snooze" })
  expect(Date.parse(body.snoozedUntil) - before).toBeGreaterThan(3_590_000)
  expect(Date.parse(body.snoozedUntil) - before).toBeLessThan(3_610_000)
})

test("with readOnly d, s and u send nothing", async () => {
  app = await startApp({ config: { readOnly: true } })
  await app.frame()
  app.mockInput.pressKey("d")
  app.mockInput.pressKey("s")
  app.mockInput.pressKey("u")
  await Bun.sleep(50)
  expect(app.server.writes).toHaveLength(0)
  expect(await app.frame()).not.toContain("d dismiss")
})

test("snoozed items are not counted in the inbox badge", async () => {
  app = await startApp({
    before: (s) =>
      s.set(`/api/companies/${COMPANY_ID}/attention`, {
        ...feed,
        items: feed.items.map((i, n) => (n === 0 ? { ...i, dismissal: { kind: "snooze", dismissedAt: "2026-11-23T10:00:00.000Z", snoozedUntil: "2026-11-24T09:00:00.000Z", isActive: true } } : i)),
      }),
  })
  expect(await app.frame()).toContain(`inbox ${feed.items.length - 1}`)
})
