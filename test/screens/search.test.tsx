import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const hit = { score: 1, href: "", matchedFields: ["comment"], snippet: null, updatedAt: null, previewImageUrl: null }
const response = {
  results: [
    { ...hit, id: THREAD_ID, type: "issue", title: "Importer", sourceLabel: "Comment", issue: { id: THREAD_ID, identifier: "DEMO-7", title: "Importer" }, snippets: [{ field: "comment", label: "Comment", text: "the csv importer drops rows", highlights: [{ start: 4, end: 7 }] }] },
    { ...hit, id: "p1", type: "project", title: "Website", sourceLabel: "Project", snippets: [] },
  ],
  hasMore: true,
}

test("g / searches the company after typing; enter opens the task", async () => {
  app = await startApp({ before: (s) => s.set(`/api/companies/${COMPANY_ID}/search`, (url: URL) => (url.searchParams.get("q") === "csv" ? response : { results: [], hasMore: false })) })
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("/")
  let text = await app.frame()
  expect(text).toContain("Search tasks, comments, documents, agents and projects")
  await app.mockInput.typeText("csv")
  await Bun.sleep(350)
  text = await app.frame()
  expect(text).toMatch(/DEMO-7 {2}Importer {2}the csv importer drops rows\s+Comment/)
  expect(text).toMatch(/Website\s+Project/)
  expect(text).toContain("More matches than shown")
  // Only the settled text is sent, once.
  expect(app.server.requests.filter((r) => r.endsWith("/search"))).toHaveLength(1)
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text.split("\n")[0]).toContain("Task · ")
})

test("a project opens Tasks filtered by it; a refused search says why", async () => {
  app = await startApp({ before: (s) => s.set(`/api/companies/${COMPANY_ID}/search`, response) })
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("/")
  await app.frame()
  await app.mockInput.typeText("web")
  await Bun.sleep(350)
  await app.frame()
  app.mockInput.pressArrow("down")
  app.mockInput.pressEnter()
  let text = await app.frame()
  expect(text).toContain("project:website")

  app.server.set(`/api/companies/${COMPANY_ID}/search`, { error: "Search rate limit exceeded" }, 429)
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("/")
  await app.frame()
  await app.mockInput.typeText("x")
  await Bun.sleep(350)
  text = await app.frame()
  expect(text).toContain("Too many searches")
})
