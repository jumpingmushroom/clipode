import { afterEach, expect, test } from "bun:test"
import { THREAD_ID } from "../fake-server.ts"
import comments from "../fixtures/company/thread-comments.json"
import { startApp, type Running } from "../helpers.tsx"
import { linkedId } from "../../src/screens/task-refs.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const withBodies = (bodies: string[]) => bodies.map((body, i) => ({ ...comments[0]!, id: `c${i}`, body, createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() }))

test("linkedId reads task links and leaves other links alone", () => {
  expect(linkedId("/DEMO/issues/demo-13")).toBe("DEMO-13")
  expect(linkedId("https://host/DEMO/issues/DEMO-13#comment-1")).toBe("DEMO-13")
  expect(linkedId("issue://DEMO-13")).toBe("DEMO-13")
  expect(linkedId("https://example.com/DEMO-13")).toBeUndefined()
})

test("task references show their status and open the task on click", async () => {
  app = await startApp({
    route: { name: "thread", id: THREAD_ID },
    before: (s) => s.set(`/api/issues/${THREAD_ID}/comments`, withBodies(["See [DEMO-13](/DEMO/issues/DEMO-13) and DEMO-1, not UTF-8."])),
  })
  const text = await app.frame()
  expect(text).toContain("○ DEMO-13")
  expect(text).toContain("◉ DEMO-1,")
  expect(text).toContain("not UTF-8")
  const lines = text.split("\n")
  const y = lines.findIndex((l) => l.includes("◉ DEMO-1,"))
  await app.mockMouse.click(lines[y]!.indexOf("DEMO-1,"), y)
  expect(await app.frame()).toContain("Task · DEMO-1")
})

test("a long thread opens at its latest comment", async () => {
  app = await startApp({
    route: { name: "thread", id: THREAD_ID },
    before: (s) => s.set(`/api/issues/${THREAD_ID}/comments`, withBodies(Array.from({ length: 30 }, (_, i) => `comment number ${i}`))),
  })
  const text = await app.frame()
  expect(text).toContain("comment number 29")
  expect(text).not.toMatch(/comment number 0(?!\d)/)
})
