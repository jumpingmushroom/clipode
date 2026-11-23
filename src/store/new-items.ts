// Spots inbox items that arrive while clipode runs, for desktop notifications.
import { createEffect } from "solid-js"
import type { InboxItem } from "../api/model.ts"

/**
 * Calls onNew with the items that appear in the feed after its first load. Items already there at the first load, and
 * snoozed ones, are never reported; an item is reported once even if it leaves the feed and comes back.
 */
export function watchNewItems(items: () => InboxItem[], loaded: () => boolean, onNew: (items: InboxItem[]) => void) {
  let seen: Set<string> | null = null
  createEffect(() => {
    if (!loaded()) return
    const list = items()
    const fresh = seen ? list.filter((i) => !seen!.has(i.id) && !i.snoozed) : []
    seen ??= new Set()
    for (const i of list) seen.add(i.id)
    if (fresh.length) onNew(fresh)
  })
}
