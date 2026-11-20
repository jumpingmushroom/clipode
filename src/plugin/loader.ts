// Loads the plugins listed in cli.json. OpenTUI's runtime plugin support maps a plugin's solid-js and @opentui/*
// imports onto the host's copies and compiles its JSX, so a plugin needs no install or build step.
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"
import { homedir } from "node:os"
import { isAbsolute, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { Plugin } from "./types.ts"

export type PluginSpec = string | [string, Record<string, unknown>]
export type LoadedPlugin = { plugin: Plugin; options: Record<string, unknown>; source: string }
export type PluginError = { source: string; message: string }

export function isPlugin(value: unknown): value is Plugin {
  return !!value && typeof value === "object" && typeof (value as Plugin).id === "string" && typeof (value as Plugin).setup === "function"
}

export async function loadPlugins(specs: PluginSpec[], baseDir: string): Promise<{ plugins: LoadedPlugin[]; errors: PluginError[] }> {
  const plugins: LoadedPlugin[] = []
  const errors: PluginError[] = []
  if (specs.length) ensureRuntimePluginSupport()
  for (const spec of specs) {
    const [path, options] = typeof spec === "string" ? [spec, {}] : spec
    const expanded = path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path
    const file = isAbsolute(expanded) ? expanded : resolve(baseDir, expanded)
    try {
      const mod = (await import(pathToFileURL(file).href)) as { default?: unknown }
      const list = Array.isArray(mod.default) ? mod.default : [mod.default]
      for (const plugin of list) {
        if (!isPlugin(plugin)) throw new Error("the default export must be { id, setup } or an array of them")
        plugins.push({ plugin, options: options ?? {}, source: path })
      }
    } catch (err) {
      errors.push({ source: path, message: err instanceof Error ? err.message : String(err) })
    }
  }
  return { plugins, errors }
}
