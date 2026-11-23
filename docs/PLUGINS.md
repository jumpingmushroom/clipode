# Plugins

A plugin adds sections to clipode's screens, adds commands, and reacts to live events. A plugin can read from the Paperclip instance through `ctx.paperclip.get`, which sends `GET` requests only. It can act through the stores, for example `ctx.paperclip.attention.answer` or `ctx.paperclip.issues.comment`, which use the same write routes as the screens and honour `readOnly`.

## Write a plugin

A plugin is a TypeScript or TSX file whose default export is a plugin object, or an array of them. A plugin object has an `id` and a `setup` function:

```tsx
import type { Plugin } from "../clipode/src/plugin/types.ts" // the path to your clipode checkout

const plugin: Plugin = {
  id: "hello",
  setup(ctx) {
    const remove = ctx.ui.slot("sidebar_content", () => <text fg={ctx.theme().muted}>Hello from a plugin</text>)
    return remove
  },
}

export default plugin
```

The type import is erased at run time, so the file only needs clipode's source for type checking. Imports of `solid-js`, `solid-js/store`, `@opentui/core` and `@opentui/solid` resolve to clipode's own copies, and JSX is compiled when the file loads. A plugin needs no install or build step.

`setup` runs once for each company that you open. It can be `async`. If it returns a function, clipode calls that function when you switch company or quit, so remove what the plugin registered there.

For a complete example, see `plugins/oldest-item.tsx`. It adds a line under the inbox, adds a command with a key binding, and listens to a live event.

## Load a plugin

To load a plugin, list it under `plugins` in `~/.config/clipode/cli.json`, as a path or as a `[path, options]` pair:

```jsonc
{
  "plugins": [
    "~/clipode-plugins/hello.tsx",
    ["plugins/oldest-item.tsx", { "toastFailures": false }]
  ]
}
```

A relative path is resolved against the config directory. The plugin reads its options from `ctx.options`.

If a plugin fails to load, throws in `setup`, or throws while rendering, clipode shows a toast and keeps running. **Settings** (`ctrl+x s`) lists every loaded plugin and every failure under **Plugins**.

## The context

`setup` receives one context object. The following table describes its members:

| Member | What it gives |
| --- | --- |
| `id`, `options` | The plugin's id and the options from `cli.json`. |
| `paperclip.session` | Instance URL, user, companies, selected company and connection state. |
| `paperclip.attention`, `issues`, `runs`, `agents` | The selected company's stores, the same ones the screens read. Each value is a Solid store, so reading it inside a slot render keeps the render current. |
| `paperclip.on(type, handler)` | Subscribes to live events such as `activity.logged` or `heartbeat.run.status`; `"*"` receives all of them. Returns an unsubscribe function. |
| `paperclip.get(path)` | Sends a `GET` request to any API path, for example `/api/companies`. Other methods are refused. |
| `route.current()`, `route.navigate(to)` | The current screen, and a way to open another: `{ name: "inbox" }`, `{ name: "item", id }`, `{ name: "tasks" }`, `{ name: "thread", id }`, `{ name: "run", id }`, `{ name: "agents" }`, `{ name: "agent", id }`. |
| `ui.slot(name, render, order)` | Adds a render function to a slot. Lower `order` values render first. Returns a remove function. |
| `ui.toast(message, variant)` | Shows a toast; `variant` is `info`, `success`, `warning` or `error`. |
| `ui.dialog` | `alert`, `confirm`, `prompt` and `select`, each returning a promise. |
| `ui.components` | `Select`, `Spinner` and `Markdown`, drawn with the current theme. |
| `commands.register(list)`, `commands.run(name)` | Adds commands to the palette, with optional key bindings, and runs a command by name. |
| `theme()` | The current theme's semantic colours: `text`, `muted`, `accent`, `success`, `warning`, `error`, and so on. Use these instead of raw colour values. |
| `renderer` | The OpenTUI renderer. |

A command name must not contain spaces; prefix it with the plugin id, as in `oldest-item.open`. Key bindings use the same syntax as `keybinds` in `cli.json`: a leader sequence is `<leader>o`, and a sequence of plain keys is written with spaces, as in `g o`.

## Slots

The following slots are available:

| Slot | Where it appears |
| --- | --- |
| `home_bottom` | Under the inbox list. |
| `sidebar_title` | At the top of the sidebar, on every screen with a sidebar. |
| `sidebar_content` | After the screen's own sidebar sections. |
| `sidebar_footer` | At the bottom of the sidebar. Only the last registration shows; the built-in footer (instance, version and connection) is registered through this same API. |
| `thread_header` | Above a task's title in the task thread. |

A render function receives `{ route }`. It runs inside Solid's reactive scope, so it renders again when a store value that it reads changes.

The sidebar is hidden below 100 columns and when you toggle it off with `ctrl+b`. Sidebar slots are not shown then.
