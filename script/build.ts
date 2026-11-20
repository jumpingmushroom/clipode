// Compiles clipode into one executable per target, then writes gzipped copies and SHA256SUMS to dist/.
// Usage: bun run build            this machine's target only
//        bun run build --all      every Linux and macOS target (installs the other platforms' native packages first)
//        bun run build --target=linux-arm64,darwin-arm64
import solidPlugin from "@opentui/solid/bun-plugin"
import { $ } from "bun"
import { createHash } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { gzipSync } from "node:zlib"
import pkg from "../package.json" with { type: "json" }

const ALL = ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"] as const
type Target = (typeof ALL)[number]
const host = `${process.platform}-${process.arch}` as Target

const requested = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length)
const targets = (process.argv.includes("--all") ? [...ALL] : (requested?.split(",") ?? [host])) as Target[]
for (const t of targets) if (!ALL.includes(t)) throw new Error(`unknown target ${t}; use one of ${ALL.join(", ")}`)

// OpenTUI's native library comes in per-platform packages, and its loader names the musl variants too, so the
// bundler needs all of them present; bun installs only this machine's by default.
await $`bun install ${["--os=*", "--cpu=*", "--libc=*"]}`.quiet()

const dist = new URL("../dist/", import.meta.url).pathname
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })

const sums: string[] = []
for (const target of targets) {
  const outfile = `${dist}clipode-${target}/clipode`
  console.log(`building ${target}`)
  const result = await Bun.build({
    entrypoints: ["./bin/clipode.ts"],
    plugins: [solidPlugin],
    minify: true,
    compile: { target: `bun-${target}` as Bun.Build.CompileTarget, outfile, autoloadBunfig: false, autoloadDotenv: false },
  })
  if (!result.success) {
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }
  const gz = `clipode-${target}.gz`
  const data = gzipSync(await readFile(outfile), { level: 9 })
  await writeFile(dist + gz, data)
  sums.push(`${createHash("sha256").update(data).digest("hex")}  ${gz}`)
}
await writeFile(dist + "SHA256SUMS", sums.join("\n") + "\n")
console.log(`clipode ${pkg.version}: ${targets.length} target(s) in ${dist}`)
