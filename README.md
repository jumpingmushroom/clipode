# clipode

clipode is a terminal client for a self-hosted [Paperclip](https://github.com/paperclipai/paperclip) instance, in the style of the OpenCode terminal client. It shows what a board operator needs: the attention inbox, tasks and their threads, agent run transcripts, and the agents, with live updates.

This version is read-only. It sends `GET` requests, plus the sign-in and sign-out requests, and refuses anything else, so it cannot change your instance.

clipode is tested against Paperclip `2026.1117.0`. The oldest supported server is `2026.1106.0`.

## Install

To install the latest release for Linux or macOS (x64 or arm64) into `~/.local/bin`, run the following command:

```sh
curl -fsSL https://raw.githubusercontent.com/jumpingmushroom/clipode/main/install.sh | sh
```

The script checks the download against the release's `SHA256SUMS` file. To install somewhere else, set `CLIPODE_INSTALL_DIR`. To install a specific version, set `CLIPODE_VERSION`, for example `CLIPODE_VERSION=0.1.0`.

To update an installed binary, run `clipode update`, or choose **Update clipode** in the command palette.

## Sign in

Start `clipode` and enter your instance URL, email, and password. clipode keeps the session cookie in `~/.local/state/clipode/auth.json` with mode `0600`. It never writes your password to disk.

## Use it

clipode opens on the inbox. The following keys work everywhere:

| Key | Action |
| --- | --- |
| `ctrl+p` | Command palette |
| `?` or `ctrl+x h` | Every key binding |
| `g i`, `g t`, `g a` | Go to the inbox, tasks, or agents |
| `j`, `k`, `enter`, `esc` | Move, open, go back |
| `/` | Filter the task list |
| `ctrl+b` | Show or hide the sidebar |
| `ctrl+t` | Switch theme, with a live preview |
| `ctrl+x c` | Switch company |
| `ctrl+x s` | Settings |
| `ctrl+c` twice, or `ctrl+x q` | Quit |

## Configure

clipode reads `~/.config/clipode/cli.json`, a JSON file that can contain comments. All fields are optional:

```jsonc
{
  "url": "https://paperclip.example.com",
  "theme": "nord",
  "mode": "dark",
  "leader": "ctrl+x",
  "keybinds": { "go.tasks": "<leader>t,g t" },
  "sidebar": "auto",
  "polling": { "inbox": 30, "list": 60 },
  "mouse": true,
  "plugins": ["~/clipode-plugins/hello.tsx"]
}
```

The environment variables `PAPERCLIP_URL` and `CLIPODE_CONFIG_DIR` override the file.

Themes use opencode's theme format. clipode loads themes from `~/.config/clipode/themes` and `~/.config/opencode/themes`, so existing opencode themes work unchanged. For plugins, see [Plugins](docs/PLUGINS.md).

## Develop

clipode runs on [Bun](https://bun.sh), Solid, and [OpenTUI](https://opentui.com). To set up a checkout and run the checks, run the following commands:

```sh
bun install
bun run start
bun run typecheck
bun test
```

To build a binary for this machine into `dist/`, run `bun run build`. For the design and the build order, see [Architecture](docs/ARCHITECTURE.md). For contributor rules, see `CLAUDE.md`.

## Licence

MIT. clipode includes code adapted from opencode, Paperclip, and paperclip-android. For their notices, see `THIRD_PARTY_NOTICES.md`.
