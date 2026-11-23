import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { InboxItem } from "../../src/api/model.ts"
import { watchNewItems } from "../../src/store/new-items.ts"

const item = (id: string, snoozed = false) => ({ id, snoozed }) as InboxItem

test("reports only items that arrive after the first load, once each", () => {
  const [items, setItems] = createSignal<InboxItem[]>([])
  const [loaded, setLoaded] = createSignal(false)
  const reported: string[][] = []
  createRoot(() => watchNewItems(items, loaded, (fresh) => reported.push(fresh.map((i) => i.id))))

  setItems([item("a")])
  setLoaded(true)
  expect(reported).toEqual([])

  setItems([item("a"), item("b"), item("c", true)])
  expect(reported).toEqual([["b"]])

  setItems([item("c")])
  setItems([item("b"), item("c")])
  expect(reported).toEqual([["b"]])
})
