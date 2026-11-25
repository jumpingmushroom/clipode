import { afterEach, expect, test } from "bun:test"
import { startApp, type Running } from "../helpers.tsx"

let app: Running | undefined
afterEach(() => {
  if (app && !app.renderer.isDestroyed) app.renderer.destroy()
})

test("g p lists projects with status and task counts; enter shows only that project's tasks", async () => {
  app = await startApp()
  await app.frame()
  app.mockInput.pressKey("g")
  app.mockInput.pressKey("p")
  let text = await app.frame()
  expect(text).toMatch(/Projects {2}4/)
  expect(text).toMatch(/example name\s+in progress\s+0\s+0\s+5/)
  expect(text).toMatch(/example name\s+planned\s+6\s+5\s+47/)
  for (let i = 0; i < 3; i++) app.mockInput.pressKey("j")
  app.mockInput.pressEnter()
  text = await app.frame()
  expect(text.split("\n")[0]).toContain("Tasks · example name")
  expect(text).toContain("54 tasks")
})
