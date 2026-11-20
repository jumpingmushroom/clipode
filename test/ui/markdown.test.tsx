import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { Providers } from "../../src/app.tsx"
import { createSession } from "../../src/store/session.ts"
import { Markdown } from "../../src/ui/markdown.tsx"

test("Markdown renders headings, tables and code with the theme", async () => {
  const content = "# Choose a queue\n\n| Option | Cost |\n| --- | --- |\n| Redis | low |\n\n```ts\nconst q = 1\n```\n"
  const setup = await testRender(
    () => (
      <Providers session={createSession()} mode="dark">
        <Markdown content={content} />
      </Providers>
    ),
    { width: 60, height: 20 },
  )
  await Bun.sleep(20)
  await setup.renderOnce()
  const text = setup.captureCharFrame()
  setup.renderer.destroy()
  expect(text).toContain("Choose a queue")
  expect(text).toContain("Redis")
  expect(text).toContain("const q = 1")
  expect(text).not.toContain("| ---")
})
