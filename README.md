# clipode

clipode is a terminal client for a self-hosted [Paperclip](https://github.com/paperclipai/paperclip) instance, in the style of the OpenCode terminal client. It shows what a board operator needs: the attention inbox, tasks and their threads, agent run transcripts, and the agents, with live updates.

You can answer what agents ask, accept or reject confirmations, approve, reject or discuss approvals, decide agents' decisions and stalled task reviews, retry failed runs, clear an agent's error, resolve recovery actions, comment on tasks with files attached, dismiss or snooze inbox items, create, edit, assign and triage tasks, wake, pause and resume agents, cancel runs, and run, pause or resume routines. clipode sends only those writes, each to one specific route, and refuses any other change to your instance. To make it read-only, set `"readOnly": true` in `cli.json`.

clipode is tested against Paperclip `2026.1117.0`. The oldest supported server is `2026.1106.0`.

## Install

To install the latest release for Linux or macOS (x64 or arm64) into `~/.local/bin`, run the following command:

```sh
curl -fsSL https://raw.githubusercontent.com/jumpingmushroom/clipode/main/install.sh | sh
```

The script checks the download against the release's `SHA256SUMS` file. To install somewhere else, set `CLIPODE_INSTALL_DIR`. To install a specific version, set `CLIPODE_VERSION`, for example `CLIPODE_VERSION=0.1.0`.

To update an installed binary, run `clipode update`, or choose **Update clipode** in the command palette.

## Sign in

Start `clipode` and enter your instance URL, email, and password. clipode keeps the session cookie in `~/.local/state/clipode/auth.json` with mode `0600`. It never writes your password to disk. For a local instance in `local_trusted` mode, leave the email and password empty.

## Use it

clipode opens on the inbox. The following keys work everywhere:

| Key | Action |
| --- | --- |
| `ctrl+p` | Command palette |
| `?` or `ctrl+x h` | Every key binding |
| `g i`, `g t`, `g a` | Go to the inbox, tasks, or agents |
| `g c` | Go to costs: runs, tokens and spend by agent, model and project, rolling windows, quotas and budgets; `a` switches between this month and all time |
| `g p` | Go to projects: status and task counts; `enter` shows a project's tasks |
| `g r`, `g h` | Go to routines (schedules, next and last runs; `enter` opens one with its runs, `o` its task) or activity (what happened in the company; `a` shows bookkeeping too) |
| `g /` or `ctrl+x /` | Search tasks, comments, documents, agents and projects |
| `j`, `k`, `enter`, `esc` | Move, open, go back |
| `/` | Filter the task list |
| `ctrl+s` | Send the answers to an agent's questions (in an opened item, `enter` selects an option) |
| `c` | Comment on the task on screen; `ctrl+j` adds a line, `ctrl+v` pastes the clipboard's text, or attaches it if it is an image, `ctrl+o` attaches files by path, `enter` sends. On a task assigned to you, the comment hands it back to the agent that gave it to you (shown as "to <agent>"), which wakes it; `ctrl+t` picks another agent or none |
| `d`, `t` | Open the task's documents (plans, specs), or move to its parent or a sub-task (in a task thread) |
| `f` | Attach files to the task on screen or the selected task, without a comment (`ctrl+v` in the prompt pastes a clipboard image) |
| `d`, `s`, `u` | Dismiss, snooze, or restore the selected inbox item |
| `n` | New task (in Tasks): description, optional title, project, assignee, model, plan or ask mode, private, and files (paste or drag their paths; `ctrl+v` on the Files row pastes a clipboard image) |
| `s`, `p`, `a`, `e` | Change status or priority, assign, or edit the title and description (in a task thread, or on the selected task in Tasks) |
| `w`, `p` | Wake an agent, or pause or resume it (on Agents and agent detail); run a routine now, or pause or resume it (on Routines and a routine) |
| `x` | Cancel a live run (in its transcript), or clear an agent's error (on Agents and agent detail) |
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
  "notifications": true,
  "readOnly": false,
  "plugins": ["~/clipode-plugins/hello.tsx"]
}
```

The environment variables `PAPERCLIP_URL` and `CLIPODE_CONFIG_DIR` override the file. To sign in with a board API key instead of a password, set `PAPERCLIP_API_KEY`; clipode then polls for updates, because the events WebSocket does not accept board keys.

While the terminal is in the background, clipode sends a desktop notification when a new item reaches the inbox. It uses the terminal's own notification support (for example in kitty, Ghostty, WezTerm, iTerm2 or foot), so it also works over SSH; set `"notifications": false` to turn it off.

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
