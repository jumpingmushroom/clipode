import { afterEach, expect, test } from "bun:test"
import { COMPANY_ID, THREAD_ID } from "../fake-server.ts"
import issues from "../fixtures/company/issues.json"
import doc from "../fixtures/documents/document.json"
import withDocument from "../fixtures/documents/issue-with-document.json"
import withWorkProduct from "../fixtures/documents/issue-with-work-product.json"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

const summary = { ...withDocument.documentSummaries[0]!, key: "plan", title: "Launch plan" }
const task = { ...withDocument, id: THREAD_ID, documentSummaries: [summary], workProducts: [] }

test("a task lists its documents, and d opens the only one", async () => {
  app = await startApp({
    route: { name: "thread", id: THREAD_ID },
    before: (s) => {
      s.set(`/api/issues/${THREAD_ID}`, task)
      s.set(`/api/issues/${THREAD_ID}/documents/plan`, { ...doc, key: "plan", title: "Launch plan", body: "# Launch\n\nShip on **Friday**." })
    },
  })
  let text = await app.frame()
  expect(text).toContain("Documents  d opens")
  expect(text).toMatch(/▤ Launch plan {2}rev 2/)
  expect(text).toContain("d documents")
  app.mockInput.pressKey("d")
  await Bun.sleep(100)
  text = await app.frame()
  expect(text).toContain("Document ·")
  expect(text).toContain("revision 2")
  expect(text).toContain("Ship on Friday.")
  app.mockInput.pressEscape()
  await Bun.sleep(40)
  expect(await app.frame()).toContain("Task ·")
})

test("with several documents, d asks which one", async () => {
  app = await startApp({
    route: { name: "thread", id: THREAD_ID },
    before: (s) => {
      s.set(`/api/issues/${THREAD_ID}`, { ...task, documentSummaries: [summary, { ...summary, key: "spec", title: "Spec" }] })
      s.set(`/api/issues/${THREAD_ID}/documents/spec`, { ...doc, key: "spec", title: "Spec", body: "The spec text." })
    },
  })
  await app.frame()
  app.mockInput.pressKey("d")
  expect(await app.frame()).toContain("Documents")
  app.mockInput.pressArrow("down")
  app.mockInput.pressEnter()
  await Bun.sleep(100)
  expect(await app.frame()).toContain("The spec text.")
})

test("work products show as links with their type", async () => {
  const product = { ...withWorkProduct.workProducts[0]!, title: "Fix the importer", type: "pull_request", status: "open", url: "https://example.com/pr/7" }
  app = await startApp({ route: { name: "thread", id: THREAD_ID }, before: (s) => s.set(`/api/issues/${THREAD_ID}`, { ...task, documentSummaries: [], workProducts: [product] }) })
  const text = await app.frame()
  expect(text).toContain("Work products")
  expect(text).toContain("Fix the importer (https://example.com/pr/7) · pull request · open")
  expect(text).not.toContain("d opens")
})

test("t moves to the parent or a sub-task", async () => {
  const [parent, kid] = issues
  app = await startApp({
    route: { name: "thread", id: THREAD_ID },
    before: (s) => {
      s.set(`/api/issues/${THREAD_ID}`, { ...task, parentId: parent!.id })
      s.set(`/api/companies/${COMPANY_ID}/issues`, issues.map((i) => (i.id === kid!.id ? { ...i, parentId: THREAD_ID } : i)))
    },
  })
  expect(await app.frame()).toContain("t sub-tasks")
  app.mockInput.pressKey("t")
  const text = await app.frame()
  expect(text).toContain("Parent and sub-tasks")
  expect(text).toContain(`${parent!.identifier}  `)
  expect(text).toContain(`${kid!.identifier}  `)
  app.mockInput.pressArrow("down")
  app.mockInput.pressEnter()
  await Bun.sleep(100)
  expect(await app.frame()).toContain(`Task · ${kid!.identifier}`)
})
