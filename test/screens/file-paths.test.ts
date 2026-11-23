import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { checkFiles, parsePaths } from "../../src/screens/file-paths.ts"

test("pasted paths: quoted, escaped spaces, several per line or per paste, and ~", () => {
  expect(parsePaths("/tmp/a.png")).toEqual(["/tmp/a.png"])
  expect(parsePaths("'/tmp/my file.png' \"/tmp/other one.txt\"")).toEqual(["/tmp/my file.png", "/tmp/other one.txt"])
  expect(parsePaths("/tmp/my\\ file.png\n/tmp/b.md")).toEqual(["/tmp/my file.png", "/tmp/b.md"])
  expect(parsePaths("~/notes.md")).toEqual([join(homedir(), "notes.md")])
  expect(parsePaths("   ")).toEqual([])
})

test("only existing, non-empty files are kept", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clipode-files-"))
  try {
    await writeFile(join(dir, "a.txt"), "hello")
    await writeFile(join(dir, "empty.txt"), "")
    const { ok, bad } = await checkFiles([join(dir, "a.txt"), join(dir, "empty.txt"), join(dir, "missing.txt"), dir])
    expect(ok).toEqual([join(dir, "a.txt")])
    expect(bad.map((b) => b.reason)).toEqual(["empty", "not found", "not a file"])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
