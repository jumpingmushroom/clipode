import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createResource } from "../../src/store/resource.ts"

test("a refresh during a fetch asks again, and a slower older answer does not overwrite the newer one", async () => {
  let sort = "activity"
  const pending: (() => void)[] = []
  const r = createRoot(() => createResource<string>(() => {
    const asked = sort
    return new Promise<string>((done) => pending.push(() => done(asked)))
  }, ""))
  const first = r.load()
  sort = "decide"
  const second = r.refresh()
  expect(pending).toHaveLength(2)
  pending[1]!()
  await second
  pending[0]!()
  await first
  expect(r.data).toBe("decide")
  expect(r.status).toBe("ready")
})
