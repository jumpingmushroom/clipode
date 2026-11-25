// The inbox shelves are a client rule (docs/ARCHITECTURE.md, "Agreed mockup"):
// Decide now: decideBy is today or past, expiresAt within 24 hours, or severity high.
// New today: created today. Earlier: everything else. Snoozed: an active dismissal.
import type { InboxItem } from "../api/model.ts"

export type Shelf = "decide" | "today" | "earlier" | "snoozed"
export const SHELVES: { id: Shelf; title: string }[] = [
  { id: "decide", title: "Decide now" },
  { id: "today", title: "New today" },
  { id: "earlier", title: "Earlier" },
  { id: "snoozed", title: "Snoozed" },
]

const DAY = 24 * 60 * 60 * 1000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

function decideByDue(decideBy: string | null, now: Date): boolean {
  if (!decideBy) return false
  if (decideBy === "today") return true
  // A date (YYYY-MM-DD or a timestamp) that is today or earlier. "this_week" is not due yet. A bare date is a local
  // day: Date.parse would read it as midnight UTC, the day before anywhere west of UTC.
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(decideBy)
  const at = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).getTime() : Date.parse(decideBy)
  return !Number.isNaN(at) && startOfDay(new Date(at)) <= startOfDay(now)
}

export function shelfOf(item: InboxItem, now = new Date()): Shelf {
  if (item.snoozed) return "snoozed"
  const expires = item.expiresAt ? Date.parse(item.expiresAt) : NaN
  if (decideByDue(item.decideBy, now) || (!Number.isNaN(expires) && expires - now.getTime() <= DAY) || item.severity === "high") {
    return "decide"
  }
  if (Date.parse(item.createdAt) >= startOfDay(now)) return "today"
  return "earlier"
}

/** Items grouped by shelf in display order; the list order inside a shelf is the server's sort. */
export function groupByShelf(items: InboxItem[], now = new Date()): Record<Shelf, InboxItem[]> {
  const out: Record<Shelf, InboxItem[]> = { decide: [], today: [], earlier: [], snoozed: [] }
  for (const item of items) out[shelfOf(item, now)].push(item)
  return out
}
