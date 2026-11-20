// Text helpers for fixed-width columns.

/** Compact age: "now", "12m", "3h", "2d", "5w". */
export function age(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(at)) return ""
  const s = Math.max(0, (now - at) / 1000)
  if (s < 60) return "now"
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 86400 * 14) return `${Math.floor(s / 86400)}d`
  return `${Math.floor(s / (86400 * 7))}w`
}

/** Duration since a time: "3m 12s", "1h 04m". */
export function elapsed(iso: string | null | undefined, now = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(at)) return ""
  const s = Math.max(0, Math.floor((now - at) / 1000))
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`
}

/** Cuts text to a width, ending with "…" when it does not fit. */
export function truncate(text: string, width: number): string {
  if (width <= 0) return ""
  const chars = [...text]
  return chars.length <= width ? text : chars.slice(0, Math.max(0, width - 1)).join("") + "…"
}

export function fit(text: string, width: number, align: "left" | "right" = "left"): string {
  const cut = truncate(text, width)
  return align === "left" ? cut.padEnd(width) : cut.padStart(width)
}

/** "Fri 20 Nov, 13:54" */
export function dateTime(iso: string | null | undefined): string {
  const at = iso ? new Date(iso) : null
  if (!at || Number.isNaN(at.getTime())) return ""
  const day = at.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "")
  return `${day}, ${at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
}
