// Starts the whole app against the fake server, signed in or not, and reads frames.
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { testRender } from "@opentui/solid"
import { saveCookie } from "../src/api/auth.ts"
import { App } from "../src/app.tsx"
import type { Route } from "../src/route.tsx"
import type { LoadedPlugin } from "../src/plugin/loader.ts"
import type { Config } from "../src/config.ts"
import { createSession } from "../src/store/session.ts"
import { COMPANY_ID, startFakeServer, type FakeServer } from "./fake-server.ts"

export type Running = Awaited<ReturnType<typeof testRender>> & { server: FakeServer; frame(): Promise<string>; settle(): Promise<void> }

export async function startApp(opts: { signedIn?: boolean; width?: number; height?: number; onThemeChange?: (n: string | undefined) => void; before?: (s: FakeServer) => void; route?: Route; tabs?: string[]; plugins?: LoadedPlugin[]; config?: Config } = {}): Promise<Running> {
  const server = startFakeServer()
  opts.before?.(server)
  const authPath = join(await mkdtemp(join(tmpdir(), "clipode-test-")), "auth.json")
  if (opts.signedIn !== false) await saveCookie(new URL(server.url).href.replace(/\/+$/, ""), "paperclip-default.session_token=tok", authPath)
  const session = createSession({
    url: opts.signedIn === false ? undefined : server.url,
    authPath,
    lastCompany: opts.signedIn === false ? undefined : { [server.url]: COMPANY_ID },
  })
  const setup = await testRender(
    () => <App version="0.0.0" session={session} mode="dark" onThemeChange={opts.onThemeChange} route={opts.route} tabs={opts.tabs ? { [COMPANY_ID]: opts.tabs } : undefined} plugins={opts.plugins} config={opts.config} />,
    { width: opts.width ?? 120, height: opts.height ?? 36 },
  )
  const settle = async () => {
    for (let i = 0; i < 5; i++) {
      await Bun.sleep(15)
      await setup.renderOnce()
    }
  }
  const running = Object.assign(setup, {
    server,
    settle,
    async frame() {
      await settle()
      return setup.captureCharFrame()
    },
  })
  const destroy = setup.renderer.destroy.bind(setup.renderer)
  setup.renderer.destroy = () => {
    server.stop()
    destroy()
  }
  return running
}
