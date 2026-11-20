// Self-update from GitHub releases: download this platform's gzipped binary, check it against SHA256SUMS,
// and replace the running executable. Only a compiled binary updates itself; a source checkout uses git.
import { createHash } from "node:crypto"
import { chmod, rename, writeFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"

// Where releases are published. Change it here and in install.sh if the repository moves.
export const REPO = "jumpingmushroom/clipode"

export type UpdateResult = { status: "current" | "updated"; version: string }

export const assetName = (platform = process.platform, arch = process.arch) => `clipode-${platform}-${arch}.gz`

/** True inside a binary built by script/build.ts, whose modules live in Bun's embedded file system. */
export const isCompiled = () => import.meta.path.startsWith("/$bunfs/") || import.meta.path.includes("~BUN")

const newer = (a: string, b: string) => {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}

export async function update(opts: { current: string; target: string; api?: string; fetchImpl?: typeof fetch }): Promise<UpdateResult> {
  const get = opts.fetchImpl ?? fetch
  const api = opts.api ?? `https://api.github.com/repos/${REPO}/releases/latest`
  const release = (await (await get(api, { headers: { Accept: "application/vnd.github+json" } })).json()) as {
    tag_name?: string
    assets?: { name: string; browser_download_url: string }[]
  }
  const version = (release.tag_name ?? "").replace(/^v/, "")
  if (!version) throw new Error("no release found")
  if (!newer(version, opts.current)) return { status: "current", version: opts.current }

  const asset = release.assets?.find((a) => a.name === assetName())
  const sums = release.assets?.find((a) => a.name === "SHA256SUMS")
  if (!asset || !sums) throw new Error(`release ${version} has no ${assetName()} or SHA256SUMS`)
  const [gz, list] = await Promise.all([
    get(asset.browser_download_url).then((r) => r.arrayBuffer()),
    get(sums.browser_download_url).then((r) => r.text()),
  ])
  const expected = list.split("\n").find((l) => l.trim().endsWith(` ${asset.name}`))?.split(/\s+/)[0]
  const actual = createHash("sha256").update(new Uint8Array(gz)).digest("hex")
  if (!expected || expected !== actual) throw new Error(`checksum mismatch for ${asset.name}`)

  // Write next to the target and rename, so a failed download never leaves a broken executable.
  const tmp = `${opts.target}.update`
  await writeFile(tmp, gunzipSync(new Uint8Array(gz)))
  await chmod(tmp, 0o755)
  await rename(tmp, opts.target)
  return { status: "updated", version }
}
