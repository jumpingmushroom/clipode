// Built-in sidebar footer (instance, version, connection), registered through the plugin API like any plugin.
import type { Plugin } from "../plugin/types.ts"

export const sidebarFooter = (version: string): Plugin => ({
  id: "clipode.sidebar-footer",
  setup(ctx) {
    ctx.ui.slot("sidebar_footer", () => (
      <box flexDirection="column" marginTop={1}>
        <text fg={ctx.theme().muted}>{ctx.paperclip.session.host()}</text>
        <text fg={ctx.theme().muted}>
          clipode {version} · {ctx.paperclip.session.state.connection}
        </text>
      </box>
    ))
  },
})
