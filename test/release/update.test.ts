import { afterAll, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { assetName, update } from "../../src/update.ts"

const binary = gzipSync(Buffer.from("#!/bin/sh\necho new\n"))
let sums = `${createHash("sha256").update(binary).digest("hex")}  ${assetName()}\n`
const tag = "v0.2.0"
const server = Bun.serve({
  port: 0,
  fetch(req) {
    const path = new URL(req.url).pathname
    const base = new URL(req.url).origin
    if (path === "/latest") return Response.json({ tag_name: tag, assets: [{ name: assetName(), browser_download_url: `${base}/bin` }, { name: "SHA256SUMS", browser_download_url: `${base}/sums` }] })
    if (path === "/bin") return new Response(binary)
    if (path === "/sums") return new Response(sums)
    return new Response("not found", { status: 404 })
  },
})
afterAll(() => server.stop(true))
const api = () => `http://127.0.0.1:${server.port}/latest`

test("replaces the executable with a newer release after checking its checksum", async () => {
  const dir = await mkdtemp(join(tmpdir(), "clipode-update-"))
  const target = join(dir, "clipode")
  await writeFile(target, "old")
  try {
    expect(await update({ current: "0.2.0", target, api: api() })).toEqual({ status: "current", version: "0.2.0" })
    expect(await readFile(target, "utf8")).toBe("old")

    sums = sums.replace(/^\w+/, "0".repeat(64))
    await expect(update({ current: "0.1.0", target, api: api() })).rejects.toThrow("checksum mismatch")
    expect(await readFile(target, "utf8")).toBe("old")

    sums = `${createHash("sha256").update(binary).digest("hex")}  ${assetName()}\n`
    expect(await update({ current: "0.1.0", target, api: api() })).toEqual({ status: "updated", version: "0.2.0" })
    expect(await readFile(target, "utf8")).toContain("echo new")
    expect((await stat(target)).mode & 0o111).toBeTruthy()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
