// Ranks options for a filter: substring matches first, then in-order subsequence matches.
export function fuzzyScore(text: string, query: string): number | null {
  if (!query) return 0
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  const at = t.indexOf(q)
  if (at >= 0) return at === 0 ? 1000 : 900 - at
  let i = 0
  let gaps = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    else if (i > 0) gaps++
    if (i === q.length) return 500 - gaps
  }
  return null
}
