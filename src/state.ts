// ~/.local/state/clipode/kv.json: runtime choices such as the last company, open tabs and the picked theme.
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export type State = {
  lastCompany?: Record<string, string>
  theme?: string
  lastView?: string
  tabs?: Record<string, string[]>
}

export function statePath(): string {
  return join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "clipode", "kv.json")
}

export async function loadState(path = statePath()): Promise<State> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as State
  } catch {
    return {}
  }
}

/** Merges a change into the state file. Writes are serialised so concurrent updates do not lose each other. */
export function createStateWriter(initial: State, path = statePath()) {
  let state = initial
  let chain = Promise.resolve()
  return {
    get: () => state,
    update(patch: Partial<State>) {
      state = { ...state, ...patch }
      const snapshot = state
      chain = chain
        .then(() => mkdir(dirname(path), { recursive: true }))
        .then(() => writeFile(path, JSON.stringify(snapshot, null, 2) + "\n"))
        .catch(() => {})
      return chain
    },
  }
}
