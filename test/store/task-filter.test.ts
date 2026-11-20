import { expect, test } from "bun:test"
import type { TaskSummary } from "../../src/api/model.ts"
import { matchesFilter, parseFilter } from "../../src/store/task-filter.ts"

const task = (over: Partial<TaskSummary>): TaskSummary => ({
  id: "1", identifier: "FJO-142", title: "Import service: queue and worker", status: "in_progress", priority: "high",
  assigneeAgentId: "a", assigneeUserId: null, parentId: null, projectId: "p", updatedAt: "", ...over,
})
const names = { assignee: () => "Maren", project: () => "Importer" }

test("filter tokens and free text", () => {
  expect(parseFilter("queue assignee:Mar priority:high")).toEqual({ text: "queue", assignee: "mar", priority: "high" })
  expect(matchesFilter(task({}), parseFilter("queue assignee:mar"), names)).toBe(true)
  expect(matchesFilter(task({}), parseFilter("fjo-142"), names)).toBe(true)
  expect(matchesFilter(task({}), parseFilter("priority:low"), names)).toBe(false)
  expect(matchesFilter(task({}), parseFilter("status:progress"), names)).toBe(true)
  expect(matchesFilter(task({}), parseFilter("project:imp"), names)).toBe(true)
  expect(matchesFilter(task({}), parseFilter("project:sales"), names)).toBe(false)
  expect(matchesFilter(task({}), parseFilter(""), names)).toBe(true)
})
