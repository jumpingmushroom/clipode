#!/usr/bin/env bun
import pkg from "../package.json" with { type: "json" }

const args = process.argv.slice(2)

if (args.includes("--version") || args.includes("-v")) {
  console.log(pkg.version)
  process.exit(0)
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(`clipode ${pkg.version}: a terminal client for Paperclip

Usage: clipode [--version] [--help]`)
  process.exit(0)
}

const { run } = await import("../src/app.tsx")
await run(pkg.version)
process.exit(0)
