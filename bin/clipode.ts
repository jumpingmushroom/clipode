#!/usr/bin/env bun
import pkg from "../package.json" with { type: "json" }

const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(pkg.version)
  process.exit(0)
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(`clipode ${pkg.version}: a terminal client for Paperclip

Usage:
  clipode            start
  clipode update     replace this binary with the latest release
  clipode --version
  clipode --help`)
  process.exit(0)
}
if (args[0] === "update") {
  const { isCompiled, update } = await import("../src/update.ts")
  if (!isCompiled()) {
    console.error("clipode update replaces an installed binary. In a source checkout, use git pull.")
    process.exit(1)
  }
  try {
    const result = await update({ current: pkg.version, target: process.execPath })
    console.log(result.status === "updated" ? `Updated clipode to ${result.version}.` : `clipode ${result.version} is the latest release.`)
    process.exit(0)
  } catch (err) {
    console.error(`Update failed: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

const { run } = await import("../src/app.tsx")
const restart = await run(pkg.version)
// After an in-app update the new binary takes over the terminal with the same arguments.
if (restart) process.exit(await Bun.spawn([process.execPath, ...args], { stdio: ["inherit", "inherit", "inherit"] }).exited)
process.exit(0)
