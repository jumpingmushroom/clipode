import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import doc from "../fixtures/documents/document.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const issue = { id: THREAD_ID, identifier: "DEMO-1", title: "Launch" }
const artifacts = [
  { id: "d1", source: "document", mediaKind: "document", title: "Launch plan", previewText: "Ship on Friday", contentType: "text/markdown", contentPath: null, openPath: null, downloadPath: null, issue, project: null, createdByAgent: null, updatedAt: "2026-11-25T10:00:00.000Z", href: "/DEMO/issues/DEMO-1#document-plan" },
  { id: "w1", source: "work_product", mediaKind: "image", title: "screenshot.png", previewText: null, contentType: "image/png", contentPath: "/api/attachments/x/content", openPath: "/x", downloadPath: "/x", issue, project: null, createdByAgent: null, updatedAt: "2026-11-24T10:00:00.000Z", href: "/DEMO/issues/DEMO-1" },
]

test("g f lists artifacts; enter opens a document on the document screen, a file's task otherwise", async () => {
  app = await startApp({
    before: (s) => {
      s.set(`/api/companies/${COMPANY_ID}/artifacts`, { artifacts, nextCursor: null })
      s.set(`/api/issues/${THREAD_ID}/documents/plan`, { ...doc, key: "plan", title: "Launch plan", body: "Ship on **Friday**." })
    },
  })
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("f")
  let text = await app.frame()
  expect(text.split("\n")[0]).toContain("Artifacts")
  expect(text).toMatch(/▤ Launch plan\s+DEMO-1/)
  expect(text).toMatch(/▣ screenshot\.png\s+DEMO-1/)
  expect(text).toContain("Ship on Friday")
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text).toContain("Document ·")
  expect(text).toContain("Ship on Friday.")
  app.mockInput.pressEscape()
  await Bun.sleep(40)
  app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text).toContain("Task ·")
})
