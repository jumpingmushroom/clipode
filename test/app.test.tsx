import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { App } from "../src/app.tsx"
import { clipodeDark } from "../src/theme/tokens.ts"

test("app shows the wordmark and quits on ctrl+c", async () => {
  const setup = await testRender(() => <App theme={clipodeDark} version="0.0.0" />, { width: 80, height: 24 })
  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  expect(frame).toContain("▄█▀▀▀▀  ██  ██  ██▀▀█▄  ▄█▀▀█▄  ▄█▀▀██  ▄█▀▀█▄")
  expect(frame).toContain("a terminal client for Paperclip")

  setup.mockInput.pressCtrlC()
  expect(setup.renderer.isDestroyed).toBe(true)
})
