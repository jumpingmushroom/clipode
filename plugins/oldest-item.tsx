// Example plugin: shows the oldest open inbox item under the inbox, adds a command to open it,
// and toasts when a run fails. Add it to ~/.config/clipode/cli.json:
//   { "plugins": ["/path/to/clipode/plugins/oldest-item.tsx"] }
// or, with options: { "plugins": [["/path/to/oldest-item.tsx", { "toastFailures": false }]] }
import type { Plugin } from "../src/plugin/types.ts"

const plugin: Plugin = {
  id: "oldest-item",
  setup(ctx) {
    const attention = ctx.paperclip.attention
    const oldest = () =>
      attention
        .items()
        .filter((i) => !i.snoozed)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0]
    const days = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)

    const removeSlot = ctx.ui.slot("home_bottom", () => {
      const item = oldest()
      if (!item) return null
      return (
        <text fg={ctx.theme().muted}>
          Oldest open item: {days(item.createdAt)}d · {item.identifier ?? item.title}
        </text>
      )
    })
    const removeCommands = ctx.commands.register([
      {
        name: "oldest-item.open",
        title: "Open the oldest inbox item",
        keys: "<leader>o",
        run: () => {
          const item = oldest()
          if (item) ctx.route.navigate({ name: "item", id: item.id })
          else ctx.ui.toast("Nothing needs you", "success")
        },
      },
    ])
    const off = ctx.paperclip.on("heartbeat.run.status", (event) => {
      if (ctx.options.toastFailures === false) return
      if (event.payload.status === "failed") ctx.ui.toast("A run failed", "warning")
    })
    return () => {
      removeSlot()
      removeCommands()
      off()
    }
  },
}

export default plugin
