# Paperclip TUI: architecture and kickoff prompts

Nov 20, 2026 · @Johnny

## Summary

We are building a standalone terminal client for a self-hosted Paperclip instance, in the style of pasode: Bun, Solid and OpenTUI, opencode's look, a small plugin host and opencode-compatible themes. The name is `clipode`.

Decisions already made:

- **Shape:** a standalone binary in a fresh repository, MIT licensed. It is not an opencode plugin and not a fork of opencode or pasode.
- **Home screen:** the attention inbox, organised like the Decisions desk in paperclip-android.
- **Phase 1 is read-only.** Actions (answer, approve, comment, wake) come after the read path is solid.
- **Target instance:** authenticated mode on the LAN, reached over HTTP(S) and WebSocket. No access to the server's database or filesystem.
- **Audience:** a personal tool first, open-sourced once phase 1 works.
- **Design first:** a mockup is settled in Claude Design before any code is written.

Three references shape the design, each for a different reason:

| Reference | What we take from it |
| --- | --- |
| [opencode](https://github.com/anomalyco/opencode) (MIT) | Visual language, dialog and select patterns, theme format, keymap model. Code may be ported with attribution. |
| [pasode](https://github.com/jumpingmushroom/pasode) (no licence) | Architecture and feature ideas only: module split, plugin contract, config shape, release pipeline. |
| [paperclip-android](https://github.com/splitpierre/paperclip-android) (MIT) | Proof that a third-party client works against the stock API, the sign-in flow, the Decisions desk, and the transcript parsers. |

## Scope

Phase 1 ships a client that can show everything a board operator needs to see, and change nothing on the server.

| Phase | Goal | Contents |
| --- | --- | --- |
| 0 | Design settled | Mockup of the core screens in Claude Design, reviewed and frozen. |
| 1 | Read-only client | Sign-in, company picker, attention inbox (home), task list, task thread, run transcript, agents, live updates, themes, plugin host, config, single-binary release. |
| 2 | Decide and reply | Answer agent questions and confirmations, approve / reject / request revision, comment, dismiss and snooze inbox items. |
| 3 | Operate | Create and edit tasks, assign, change status and priority, wake / pause / resume agents, cancel runs. |
| 4 | Round out | Costs and quotas, projects, goals, routines, activity, search, desktop notifications. |

Out of scope for now: instance administration, adapter and connection setup, company import and export, anything that needs the experimental board chat.

Phase 1 performs `GET` requests only, plus the sign-in and sign-out calls. The client refuses any other method unless a later phase enables it explicitly, so a bug cannot mutate the instance.

## Provenance and licensing

The new repository is MIT licensed, and no pasode source is copied into it. A public repository without a licence gives no reuse rights by default, so pasode is used as a design reference only. This is a working rule and not legal advice.

| Source | Licence | Rule |
| --- | --- | --- |
| opencode | MIT | Code may be ported. Keep its copyright notice in `THIRD_PARTY_NOTICES.md` and mark ported files with a one-line header. |
| OpenTUI | MIT | Used as a dependency. |
| paperclip-android | MIT | Logic may be re-implemented in TypeScript (transcript parsing, inbox grouping). Credit it in the notices file. |
| Paperclip | MIT | Types and schemas come from the published `@paperclipai/shared` package and the instance's OpenAPI document. |
| pasode | None stated | Read for structure and behaviour. No files, functions, tests or README text are copied or translated line by line. |

Much of pasode's interface was itself ported from opencode, so the same components can be taken from opencode directly. If the original pasode author adds a licence later, this restriction can be lifted.

## Stack and repo layout

The stack is the one opencode and pasode already prove: Bun as runtime and compiler, Solid for reactivity, OpenTUI for rendering.

| Part | Choice | Note |
| --- | --- | --- |
| Runtime and build | Bun, `bun build --compile` | One binary per OS and architecture; no Node or Bun needed to run it. |
| Rendering | `@opentui/core` and `@opentui/solid`, current 0.9 line | pasode pins 0.5; 0.6 changed resource ownership and layout getters, so we start on the current line. |
| Reactivity | `solid-js` 1.9 | Stores and signals; no extra state library. |
| Language | TypeScript, strict | Typecheck with `bun check`, as pasode does. |
| API types | Response shapes from `@paperclipai/shared`, pinned to the tested Paperclip version and imported with `import type` only. Paths and query parameters generated from the instance's `/api/openapi.json`, GET operations only | Most OpenAPI responses carry no schema (596 of 688 on 2026.1117.0, including the feed, companies and runs), so they cannot type response bodies. Both are pinned to a tested Paperclip version. |
| Tests | `bun test` with recorded fixtures and a fake server | No live instance needed in CI. |

The code is split so that nothing outside `src/api` and `src/transcript` knows Paperclip's wire format, and nothing in the generic UI kit knows Paperclip at all.

```text
bin/clipode.ts        launcher: arguments, --version, update, then starts the app
src/
  api/                Paperclip access; imports no UI
    client.ts         fetch wrapper: base URL, cookie jar, Origin header, read-only guard, typed errors
    auth.ts           sign-in, sign-out, session check, credential storage
    live.ts           events WebSocket: connect, reconnect, resync; polling fallback
    types.ts          generated GET paths and query parameters (response types come from @paperclipai/shared)
    endpoints/        attention, issues, runs, agents, companies
  transcript/         run log to transcript entries; one parser per adapter family
  store/              Solid stores: session, attention, issues, runs, agents; refresh policy
  ui/                 generic kit: dialog, select, toast, spinner, markdown, scroll, layout
  theme/              theme schema, resolver, built-in themes, opencode theme loader
  keymap/             commands, leader key, palette, help
  screens/            sign-in, company picker, inbox, tasks, thread, run, agents
  sidebar/            built-in sidebar sections, registered through the plugin API
  plugin/             host, context type, loader
  config.ts  state.ts  app.tsx
plugins/              example plugins shipped in the repo
test/                 fixtures, fake server, screen tests
script/               build.ts, gen-types.ts
docs/                 ARCHITECTURE.md, PLUGINS.md, THEMES.md
```

Dependency rule: `screens` and `sidebar` read from `store`; `store` calls `api` and `transcript`; `ui`, `theme` and `keymap` import none of them. Plugins get `store`, `ui`, `theme` and `keymap` through one context object and never import host files.

&#91;embedded content: module layers · 4 levels plus the generic kit\]

Arrows point from a module to what it depends on. Replacing Paperclip's API shapes touches only the three highlighted boxes.

## Data layer

The client signs in the way the web UI and paperclip-android do: with an email and password, holding a session cookie. That one credential works for both the REST API and the live-events WebSocket on an authenticated instance.

### Sign-in and credentials

- **Primary path:** `POST /api/auth/sign-in/email` with `email`, `password` and `rememberMe`. The response sets the Better Auth session cookie, which the client keeps in a cookie jar.
- **Origin header:** the server keeps a list of trusted origins, and paperclip-android sends `Origin` on every non-GET request. The client sends the instance's own origin on sign-in and sign-out.
- **Storage:** the cookie is saved in `~/.local/state/clipode/auth.json` with mode `0600`, keyed by instance URL. The password is never written to disk.
- **Expiry:** a `401` on any request clears the session and returns to the sign-in screen with the instance URL and email prefilled.
- **Secondary path:** a bearer token from `PAPERCLIP_API_KEY` (for example a board key from `paperclipai auth login`). It works for REST. The events WebSocket accepts only agent keys as bearer tokens, so this path falls back to polling.
- **Local instances:** `local_trusted` mode needs no credential on loopback; the client detects this from a successful unauthenticated request and skips sign-in.

### Endpoints used in phase 1

| Purpose | Endpoint |
| --- | --- |
| Companies the user can see | `GET /api/companies` |
| Attention inbox | `GET /api/companies/{id}/attention` with `view`, `sort`, `limit`, `cursor`, `includeDismissed` |
| Inbox counts for the badge | `GET /api/companies/{id}/attention/summary` |
| Tasks, one task, its comments | Issue endpoints under `/api/companies/{id}/issues` and `/api/issues/{id}`; see `docs/api/issues.md` in the Paperclip repo |
| Runs for a company | `GET /api/companies/{id}/heartbeat-runs` |
| One run, its events, its log | `GET /api/heartbeat-runs/{id}`, `/events`, and `/log` with `offset` and `limitBytes` |
| Agents | Agent endpoints; see `docs/api/agents.md` |
| Live events | `WS /api/companies/{id}/events/ws`, authenticated by the session cookie on the upgrade request |

Exact paths and response shapes are confirmed against the generated types during the first build step. Paperclip releases almost daily, so the generated types are pinned to one tested version and the client shows a warning, not a crash, when a response does not match.

### What the live instance showed

Two read-only probes of the target instance on 2026-11-20 settled the open questions: one on `2026.1106.0`, and one after the upgrade to `2026.1117.0`, the version clipode is built and tested against. The fields on a feed item did not change between the two.

| Finding on `2026.1117.0` | Consequence for the client |
| --- | --- |
| `/attention/summary`, `/attention/tasks` and `/attention/history` exist | The header badge and sidebar totals come from the summary. History is the source for a later "recently decided" view. |
| There is no `view` parameter; the server ignores it. The real filters are `sort` (`activity` or `decide`), `queue`, `archived` and `includeDismissed` | No mine / unassigned / company switch in phase 1. `tab` on the inbox toggles the sort order instead. |
| `deskBadgeCount` was 0 with 6 open items, because it counts personally addressed cards only | The badge uses `totalCount`. |
| Dismissed and snoozed items are returned only with `includeDismissed=true` | The inbox always sends it and puts active dismissals in the Snoozed group. |
| `limit` is capped at 100, and `all=true` cannot be combined with `limit` or `cursor` | The inbox loads with `all=true`; paging by 100 is the fallback for a very large inbox. |
| Questions and confirmations share the source kind `issue_thread_interaction` | Per-kind counts in the sidebar are computed from the loaded items by `detail.kind`, not from `countsBySourceKind`. |
| `resolverAudience.createdByAgentName` is null | Read the agent name from `originAgentName`. |
| A `blocker_attention` item's `subject` is the blocking task; the blocked task is `relatedIssue` | The row title is the blocker and the sidebar names the blocked task. |
| The first company the API returned had no items at all | The client remembers the last company used, and the empty inbox is a normal screen. |
| `2026.1106.0` has no summary route and no live handshake | Minimum supported server is `2026.1106.0`: a 404 on the summary falls back to counting the feed, and a missing handshake reply is not an error. |

The feed is enough for every list row. Opening an item needs one more request, made when the item is opened and cached per task:

| Item kind (`sourceKind`) | In the feed | Fetched on open |
| --- | --- | --- |
| Agent question (`issue_thread_interaction`, `ask_user_questions`) | Title, task identifier, agent, first question text | Questions and options from `GET /api/issues/{issueId}/interactions`, filtered by interaction id |
| Confirmation (`issue_thread_interaction`, `request_confirmation`) | Title, task identifier, agent, 160-character prompt excerpt, accept and reject labels | `detailsMarkdown` and reject rules from the same interactions endpoint |
| Approval (`approval`), from source, not observed | Title, agent, 160-character summary | Body from `GET /api/approvals/{id}`; the task identifier needs `GET /api/approvals/{id}/issues`, also for the row |
| Failed run (`failed_run`), from source, not observed | Title, task identifier, agent, full error text | Optional run log from `GET /api/heartbeat-runs/{id}/log` |
| Blocked task (`blocker_attention`) | Both task identifiers and titles, server-written reason | Description and blocker chain from `GET /api/issues/{issueId}`; agent name from the agents list |

`GET /api/companies/{id}/agents` is loaded once per session and cached by id, which fills in agent names the feed leaves out. The feed defines eleven source kinds in total; kinds without a dedicated card render as a generic row with title, reason and age.

### Live updates

- **WebSocket first.** Events carry an id, a type and a payload. The types that matter in phase 1 are `heartbeat.run.status`, `heartbeat.run.log`, `heartbeat.run.event`, `agent.status` and `activity.logged`.
- **Interests.** The protocol has a `live.hello` and `live.interests` handshake that names the runs a client is watching, and a `live.resync` message from the server. The client implements these from `packages/shared/src/types/live.ts` and the server's `live-events-ws.ts`.
- **Events patch stores or invalidate them.** A run log event appends to the open transcript. An activity event marks the affected task and the inbox stale, and the store refetches them.
- **Reconnect.** Exponential backoff with a cap, a full refetch of visible data after every reconnect or resync, and a connection indicator in the footer.
- **Polling fallback.** With no WebSocket: inbox every 30 seconds, the visible list every 60 seconds, an open run's log every 2 seconds by byte offset. Polling slows down while the terminal is unfocused.

Confirmed on `2026.1117.0`: the WebSocket upgrade succeeds with only the session cookie, with any `Origin` header or none, and is refused with 403 without the cookie. The server stays silent until the client sends `live.hello`, then answers `live.capabilities` with `run-interests` within milliseconds. The client then sends `live.interests` with the ids of the runs it has open and receives `live.subscribed` with the same revision about 1 ms later; the revision must increase with every `live.interests`. The server pings every 30 seconds and drops a socket that misses a pong; Bun's WebSocket client answers pings itself and held a connection for 65 seconds. No event type announces an attention change, so the inbox refetches when `activity.logged` arrives. Bun reports a refused upgrade only as an error message (`Expected 101 status code: 403`) followed by close code 1006, with no status field, so after a failed connect the client checks the session with a `GET` to tell an expired session from a network fault rather than parse the message. All of this was confirmed from Bun 1.4.5 by `script/live-probe.ts` on 2026-11-20.

### Stores

Each store is a Solid store with the same small surface: `load()`, `refresh()`, a `status` of `idle | loading | ready | error | stale`, and the data. Screens never call the API directly.

| Store | Holds |
| --- | --- |
| `session` | Instance URL, user, deployment mode, selected company, connection state |
| `attention` | Inbox items, counts by kind, the three shelves |
| `issues` | Task list for the current filter, plus a cache of opened tasks with their threads |
| `runs` | Live and recent runs, and the transcript of the open run |
| `agents` | Agents with status, model and current task |

### Transcripts

A run's log is adapter output, and its format differs per adapter. `src/transcript` turns log records into a common list of entries: assistant text, thinking, user text, tool call with result, session init, final result with tokens and cost, and raw lines.

Phase 1 parses the Claude, Codex and ACP families, which is the set paperclip-android handles. The Claude parser is built and tested first, because the agents on the target instance run mostly on Claude; Codex and ACP follow. Any other adapter falls back to raw lines, so every run is at least readable.

## Screens and navigation

The app opens on the attention inbox and everything else is one or two keys away. The frame is opencode's: a main column, an optional right sidebar, a one-line tab bar for opened tasks, and a footer.

### Frame

- **Header line:** company name, current view, inbox badge count.
- **Tab bar:** tasks opened in this session, with a marker for live run, needs attention, or error. Hidden when only one is open.
- **Main column:** the current screen.
- **Sidebar:** context for the selected or opened item, built from plugin slots. Shown automatically on wide terminals, toggled with a key, hidden below about 100 columns.
- **Composer row:** the place where the prompt lives in opencode. In phase 1 it shows a single muted line saying the client is read-only, so the layout does not shift when replying arrives in phase 2.
- **Footer:** connection state (live, polling, offline), instance host, key hints, version.

### Screens

| Screen | Shows | Opens |
| --- | --- | --- |
| Sign-in | Instance URL, email, password; error states for wrong credentials, unreachable host, and a sign-in page from a proxy | Company picker or inbox |
| Company picker | Companies the user belongs to, as a select dialog | Inbox |
| Inbox (home) | Attention items on three shelves: Decide now, New today, Earlier, plus a collapsed Snoozed group. Each row has a kind marker, title, task identifier, agent and age. The list sorts by latest activity or by decide-by date. There is no mine / unassigned / company switch, because the server has no such filter. | Item detail |
| Item detail | The request as the agent wrote it: question, confirmation, approval, failed run or blocked task, with Markdown, code and tables rendered. Answer options are listed but inactive in phase 1. | The task thread or the run |
| Tasks | Tasks grouped by status, with filters for status, priority, assignee and project, and a search field. A tree view by parent comes after the flat list. | Task thread |
| Task thread | Title and description, then comments and run activity in time order. Sidebar: status, priority, assignee, project and goal, parent and sub-tasks, blockers, live run, cost. | Run transcript |
| Run transcript | Messages, reasoning, collapsible tool calls with output, and the final result. Follows the tail while the run is live. A footer line gives agent, model, duration, tokens and cost. | Back to the thread |
| Agents | The team: status, model, what each agent is doing now. | Agent detail with recent runs |

The three inbox shelves and the kinds of request come from paperclip-android's Decisions desk, which sorts by when a decision is needed. The phone app's Home dashboard has no equivalent here; its summary numbers go in the inbox sidebar.

### Keys

Defaults follow opencode and pasode, and every binding can be changed in the config file.

| Key | Action |
| --- | --- |
| `ctrl+x` | Leader |
| `ctrl+p` | Command palette |
| `leader i` / `t` / `a` | Inbox / Tasks / Agents |
| `up` `down` `j` `k` | Move selection |
| `enter` | Open |
| `esc` | Back one level |
| `tab` | Switch view inside a screen (inbox: sort by activity or by decide-by) |
| `/` | Filter or search the current list |
| `ctrl+b` | Toggle sidebar |
| `leader 1`..`9`, `leader .` `,` | Jump to and cycle tabs |
| `leader c` | Switch company |
| `leader shift+t` | Theme switcher with live preview |
| `leader h` | Help with every binding |
| `r` | Refresh the current screen |
| `ctrl+c` twice, `leader q` | Quit |

Minimum terminal size is 80 by 24. Mouse support is on by default: click to select, wheel to scroll, click a tab to switch.

### Agreed mockup

The look is settled in the [clipode TUI mockup](https://claude.ai/code/artifact/df40da5c-c274-43d9-8813-41e5c84cd6be): 16 frames covering the eight screens at 120 by 36, the inbox and task thread at 80 by 24, a light theme, the loading, empty and offline states, and the colour tokens. Screens are built to match it, with the exceptions listed below.

| Token | Dark | Light | Used for |
| --- | --- | --- | --- |
| background | `#0f1115` | `#f7f8fa` | Terminal ground |
| panel | `#181b22` | `#eceef2` | Header, dialogs, code blocks |
| border | `#2b303b` | `#cfd4dc` | Split edges, rules |
| text | `#d7dae0` | `#1d2129` | Primary text |
| muted text | `#8b93a1` | `#5d6573` | Secondary text, hints |
| accent | `#82a8ff` | `#2f5fd0` | Focus, spinner, headings |
| selection | `#1f2a44` | `#dbe5fb` | Selected row |
| success | `#7fc98f` | `#1f7a3d` | Live, running, done |
| warning | `#e0b05c` | `#8a5a00` | Needs attention |
| error | `#ef7f7f` | `#b3261e` | Failed, offline |

These two palettes ship as the built-in `clipode-dark` and `clipode-light` themes. Kind markers in rows are `?` question, `!` confirmation, `◆` approval, `✗` failed run and `■` blocked task; tab markers are a spinner for a live run, `▲` for needs attention and `✗` for error. The footer hints in the mockup add two defaults to the key table above: `g` followed by `i`, `t` or `a` goes to a screen, and `?` opens help.

Where the mockup shows something the API does not provide, the data wins:

| In the mockup | What the API gives | Built as |
| --- | --- | --- |
| Mine / Unassigned / Company switch on the inbox | No such filter | Left out. `tab` toggles the sort order. |
| A question opened as a long proposal with a table and a code block | A question carries prompts and options only; long Markdown exists on confirmations (`detailsMarkdown`) and in the task's comments | Questions show each prompt with its options. Confirmations render their Markdown as drawn. A link opens the task thread for context. |
| "Decide by today 16:00, in 1h 54m" | `decideBy` is a triage value set by a person (`today`, `this_week`, a date, or null) and was null on every item; `expiresAt` is a real timestamp when set | Show `decideBy` as given. Show a countdown only when `expiresAt` is set. |
| "Holds up 2 sub-tasks" on a question | Only blocked-task items carry a count (`detail.blockedTaskCount`) | Shown on blocked-task items only. |
| Sidebar groups for agents, tasks in flight and live runs on the inbox | Not in the attention feed | Filled from the agents, tasks and runs stores, which the inbox loads after the feed. |
| Shelves: Decide now, New today, Earlier | Not a server concept | A client rule, defined below. |

Shelf rule for phase 1: an item is in Decide now when its `decideBy` is today or past, its `expiresAt` falls within 24 hours, or its `severity` is `high`; otherwise in New today when it was created today; otherwise in Earlier. Items with an active dismissal go to Snoozed.

## Plugins, themes, config and state

The plugin contract, theme format and config shape stay close to opencode's and pasode's, so the tool feels familiar and existing opencode themes work unchanged.

### Plugins

A plugin is a module whose default export is `{ id, setup(ctx) }`, or an array of them. Built-in sidebar sections are written as plugins against the same context, which keeps the API honest.

```ts
export type Context = {
  id: string
  options: Record<string, unknown>
  paperclip: {
    session: SessionStore      // instance, user, company, connection
    attention: AttentionStore
    issues: IssuesStore
    runs: RunsStore
    agents: AgentsStore
    on(type: LiveEventType, handler: (event: LiveEvent) => void): () => void
    get<T>(path: string): Promise<T>   // read-only escape hatch
  }
  route: { current(): Route; navigate(to: Route): void }
  ui: {
    slot(name: SlotName, render: (props: SlotProps) => JSX.Element, order?: number): () => void
    toast(message: string, variant?: "info" | "success" | "warning" | "error"): void
    dialog: Dialogs              // alert, confirm, prompt, select
    components: { Select, Spinner, Markdown }
  }
  commands: { register(list: Command[]): () => void; run(id: string): void }
  theme: ResolvedTheme
  renderer: CliRenderer
}
```

| Slot | Where | Built-in sections |
| --- | --- | --- |
| `home_bottom` | Under the inbox list | none |
| `sidebar_title` | Top of the sidebar | Selected item's title |
| `sidebar_content` | Sidebar body, ordered | Inbox counts, task properties, sub-tasks and blockers, live run, cost |
| `sidebar_footer` | Bottom of the sidebar, single winner | Instance, version, connection |
| `thread_header` | Above a task thread | none |

Plugins are listed under `plugins` in the config file, as a path or a `[path, options]` pair. The launcher maps a plugin's `solid-js` and `@opentui/*` imports onto the host's copies, so a plugin needs no install or build step. A plugin that throws is reported in a toast and in the status dialog, and does not stop the app.

### Themes

- The theme schema is opencode's JSON format. Themes load from `~/.config/clipode/themes` and from `~/.config/opencode/themes`.
- A small set of built-in themes ships in the binary, including opencode's default.
- Components use semantic tokens (text, muted, border, accent, success, warning, error, selection) and never raw colours.
- Dark and light modes follow the terminal by default and can be forced.

### Config and state

| File | Purpose |
| --- | --- |
| `~/.config/clipode/cli.json` (JSONC) | Instance URL, theme, leader key, keybinds, sidebar behaviour, polling intervals, mouse, animations, plugins |
| `~/.local/state/clipode/auth.json` | Session cookie per instance, mode `0600` |
| `~/.local/state/clipode/kv.json` | Runtime choices: last company, open tabs, last view, theme picked in the switcher |

Environment variables override the file: `PAPERCLIP_URL`, `PAPERCLIP_API_KEY`, `CLIPODE_CONFIG_DIR`.

## Build, test and release

The build order puts the riskiest unknowns first: talking to the real instance, then rendering, then everything else.

1. **Scaffold.** Repository, licence, notices file, Bun and TypeScript setup, an empty OpenTUI app that starts and quits cleanly.
2. **API spike.** Type generation, the client, sign-in against the real instance, one attention request printed as JSON. Record the responses as fixtures.
3. **UI kit and theme.** Dialog, select, toast, spinner, Markdown, scroll container, theme loading, keymap and palette.
4. **Inbox.** The attention store and the home screen, matching the mockup.
5. **Tasks and thread.** List, filters, thread with comments and run activity, sidebar sections.
6. **Runs.** Transcript parsers and the transcript screen, with fixtures per adapter.
7. **Live updates.** WebSocket, reconnect, resync, polling fallback, connection indicator.
8. **Agents, tabs, company switch, settings dialog.**
9. **Plugin host.** Loader, context, slots, one example plugin, plugin documentation.
10. **Release.** Compile targets, install script, self-update, GitHub Actions workflow.

### Tests

- **Parsers and stores:** unit tests over recorded fixtures, with one fixture file per adapter family and per attention item kind.
- **Screens:** OpenTUI's test renderer renders each screen from fixtures at 80, 120 and 200 columns and compares text snapshots.
- **Client:** a fake server in the test process checks cookie handling, the `401` path, the read-only guard and WebSocket reconnect.
- **No test talks to a real instance.** A separate `bun run smoke` script does, on demand, using the configured instance.

### Release

- Targets: Linux and macOS, x64 and arm64. Linux binaries build on Linux and macOS binaries on a Mac runner so they carry a valid signature.
- A version tag triggers the workflow: typecheck, tests, build, start each binary once, then publish gzipped binaries with a `SHA256SUMS` file.
- `install.sh` downloads the right binary and verifies its checksum. `clipode update` and an in-app command do the same and restart.

## Risks and open questions

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Paperclip's API changes between releases | Screens break after a server upgrade | Pinned generated types, tolerant decoding, a visible warning on shape mismatch, a tested-version note in the README |
| The OpenAPI document is hand-maintained and may lag the routes | Generated types are wrong in places | Cross-check with `@paperclipai/shared` and with recorded responses from the real instance |
| Sign-in is blocked by the trusted-origins check or a proxy in front of the instance | Cannot authenticate | Send the instance origin; detect HTML sign-in pages and say so; keep the bearer-token path as a fallback |
| The live-events handshake is more involved than the type file suggests | Live updates slip | Polling is built first and always works; the WebSocket is an upgrade |
| Adapter log formats vary and change | Transcripts render badly | Raw-line fallback for every adapter; fixtures per adapter; parsers isolated in one folder |
| OpenTUI is pre-1.0 | Breaking changes on upgrade | Pin exact versions; wrap OpenTUI-specific calls in `src/ui` |
| pasode has no licence | Copied code could not be redistributed | Reference only; port shared components from opencode |

Open questions:

- [x] Decided: the tool, binary and config directory are named clipode.
- [x] Answered: the feed covers every list row; opening an item needs one more request per task.
- [x] Answered: the session cookie is accepted on the WebSocket upgrade from a non-browser client, with or without an `Origin` header.
- [x] Answered: agents run mostly on Claude, so the Claude transcript parser comes first.

Open after the mockup review:

- [ ] Whether the shelf rule above matches how you triage, in particular treating every high-severity item as Decide now.
- [ ] Whether a question's detail should also pull in the comment the agent wrote alongside it (`originCommentIds`), to get closer to the mockup.
- [x] Observed: `live.interests` is answered by `live.subscribed` with the same revision.

## Prompt for Claude Design

Use this first. Its output is the visual reference that the build prompt points at, so export the agreed frames as images into `docs/design/` in the new repository.

```text
Design a mockup for a terminal user interface (TUI). The result must look like a real terminal
window, not a web app: one monospace font, everything aligned to a character grid, no rounded
cards, no shadows, no gradients, no icons other than Unicode characters that exist in common
terminal fonts. Borders are box-drawing characters or single-cell coloured edges. Colour is
truecolor but used sparingly.

WHAT THE PRODUCT IS
A terminal client for Paperclip, an open-source app for managing a team of AI agents that work
on tasks. The person using it is the "board operator": they answer what agents ask, approve or
reject, watch agent runs, and decide what happens next. This first version is read-only: it
shows everything and changes nothing.

VISUAL LANGUAGE
Follow the look of the OpenCode terminal client (opencode.ai): dark background, a quiet muted
grey for secondary text, one accent colour, bold section headers in the sidebar, thin split
borders, generous empty space, a one-line footer with key hints. Dialogs are centred panels
with a title, a filter field and a list. Selection is a full-width highlighted row. Keep the
interface calm: at most one accent colour plus green, amber and red for status.

FRAME (the same on every screen)
- Header line: company name on the left, current view in the middle, inbox count on the right.
- Optional one-line tab bar under the header for opened tasks, with a small marker per tab:
  spinner for a live run, a triangle for needs attention, a cross for error.
- Main column on the left, taking the remaining width.
- Sidebar on the right, about 32 columns wide, with bold section headers and muted values.
- A single muted line above the footer where a message composer will later live. In this
  version it reads: read-only - replies arrive in a later version.
- Footer line: connection state (a dot plus live, polling or offline), instance host, a few
  key hints, version number.

SCREENS TO DESIGN, each at 120 columns by 36 rows
1. Inbox (the home screen). A list of things that need the operator, grouped under three
   headers: Decide now, New today, Earlier, plus a collapsed Snoozed group with a count. Each
   row: a one-character kind marker, a title, a task identifier, the agent's name, and the age.
   Kinds: question, confirmation, approval, failed run, blocked task. A small view switch at
   the top: Mine, Unassigned, Company. The sidebar shows counts per kind and a short summary
   of agents running and tasks in flight.
2. Inbox item opened. The agent's request rendered as Markdown: a short proposal, a small
   comparison table, a code block, and the answer options listed as inactive choices with a
   note that answering is not available yet. The sidebar shows the task it belongs to, the
   agent, when it was asked, and when it needs deciding.
3. Tasks. Tasks grouped by status (In progress, Todo, Blocked, In review, Done), each row with
   identifier, title, priority marker, assignee and a sub-task progress count. A filter line
   at the top. A live-run spinner on rows an agent is working on right now.
4. Task thread. Title and description at the top, then a time-ordered thread mixing comments
   from agents and people with compact run entries (agent, status, duration, cost). The
   sidebar shows status, priority, assignee, project, goal, parent, sub-tasks, blockers, a
   live-run indicator and the cost so far.
5. Run transcript. A live agent run in the OpenCode transcript style: assistant text, a
   collapsed reasoning block, tool calls as compact blocks with name, argument summary and a
   few lines of output, one coloured diff, and a closing line with agent, model, duration,
   tokens and cost. Show it mid-run, with a spinner and the view following the tail.
6. Agents. The team as a list: status dot, name and role, model, and what each is doing now.
7. Sign-in. A centred panel on an otherwise empty screen: instance URL, email, password, and
   one line for an error message. Include the app's wordmark as large block-character text.
8. Command palette and theme switcher. Two centred dialogs over a dimmed inbox: a filterable
   command list with key hints on the right, and a theme list with the selection previewed.

ALSO SHOW
- The Inbox and the Task thread at 80 columns by 24 rows, where the sidebar is hidden and rows
  truncate with an ellipsis.
- The Inbox in a light theme.
- Three states of the Inbox as small variants: loading, empty (nothing needs you), and
  offline with a reconnecting message in the footer.

SAMPLE CONTENT (invented; use it consistently across screens)
Company: Fjordline Labs. Task identifiers: FJO-118, FJO-131, FJO-142, FJO-150.
Agents: Ingrid (CEO), Tobias (CTO), Maren (Backend engineer), Elias (Designer), Sigrid (QA).
Example items: "Choose a queue for the import service" (question, Maren, FJO-142);
"Approve hire: Data engineer" (approval, Ingrid); "Confirm DNS change for staging"
(confirmation, Tobias, FJO-131); "Run failed: migration 0042 timed out" (failed run, Maren,
FJO-150); "Blocked: waiting on brand colours" (blocked, Elias, FJO-118).

NAME
The product is called "clipode". Use it for the wordmark and the footer.

DELIVERABLE
One frame per screen and variant, labelled, at exact character-grid sizes, plus one frame
that lists the colour tokens used (background, panel, border, text, muted text, accent,
selection, success, warning, error) with their values for the dark and the light theme.
```

## Prompt for Claude Code

Before running it: create the empty repository, export this document as Markdown to `docs/ARCHITECTURE.md`, and put the agreed mockup frames in `docs/design/`. Save the probe report as docs/research/attention-and-live-findings.md. Replace the instance URL placeholder.

```text
We are starting a new open-source project: a terminal client (TUI) for a self-hosted Paperclip
instance (https://github.com/paperclipai/paperclip), in the style of the OpenCode terminal
client. Name: clipode. Licence: MIT.

READ FIRST
1. docs/ARCHITECTURE.md in this repository. It is the agreed design: scope, licensing rules,
   stack, repo layout, data layer, screens, plugin contract, build order. Follow it. If you
   think part of it is wrong, say so and propose the change before working around it.
2. docs/design/ holds the agreed mockup frames and colour tokens. The screens must match them, except where the "Agreed mockup"
   section of the architecture document says the data wins.
3. docs/research/attention-and-live-findings.md is a read-only probe of my real instance:
   response shapes, the version gap to master, and WebSocket behaviour. Where it disagrees
   with the Paperclip docs or master source, the probe wins. My instance runs 2026.1117.0.

REFERENCE REPOSITORIES
Clone these outside this repository (for example under ../ref/) and read them as needed.
Never vendor them.
- https://github.com/paperclipai/paperclip (MIT). The server. Source of truth for the API:
  server/src/routes, server/src/realtime/live-events-ws.ts, packages/shared, docs/api.
- https://github.com/anomalyco/opencode (MIT). packages/tui is the visual and structural
  model: dialogs, select lists, toasts, theme format and resolution, keymap, transcript
  rendering. Code may be ported with attribution.
- https://github.com/splitpierre/paperclip-android (MIT). A working third-party Paperclip
  client. Read net/ApiClient.kt for sign-in and cookies, net/LiveEvents.kt for the
  WebSocket, data/Transcript.kt for run-log parsing, ui/screens/DecisionsScreen.kt and
  InboxScreen.kt for how the attention inbox is grouped.
- https://github.com/jumpingmushroom/pasode (NO LICENCE). A small OpenCode-style client for
  a different backend, and the closest model for this project's size and module split. You
  may read it to understand structure and behaviour. You must not copy or closely translate
  any of its files, functions, tests or documentation. When you need a component that pasode
  also has, port it from opencode.

LICENSING RULES
- Add LICENSE (MIT) and THIRD_PARTY_NOTICES.md with the opencode and paperclip-android
  copyright notices.
- Any file ported from opencode starts with a one-line comment naming its source path.

STACK
Bun as runtime, test runner and compiler. TypeScript, strict. solid-js with @opentui/core and
@opentui/solid on the current 0.9 line, pinned to exact versions. Check the current OpenTUI
documentation (https://opentui.com/docs) before using an API from memory or from pasode,
which is on 0.5; the 0.6 release changed resource ownership and layout getters.

HARD CONSTRAINTS FOR THIS PHASE
- Read-only. The API client allows GET requests, plus POST for sign-in and sign-out only. Any
  other method throws before a request is sent. Cover this with a test.
- Authentication is an email and password sign-in that yields a session cookie (see the data
  layer section). Never write the password to disk. Store the cookie with file mode 0600.
- Never commit credentials, cookies or real instance data. Fixtures recorded from my instance
  must be scrubbed: replace names, emails, ids, tokens and free text with invented values.
- Screens read from stores. Only src/api and src/transcript know Paperclip's wire format.
- Use theme tokens by semantic role. No raw colour values in components.
- Tests never contact a real instance. A separate smoke script may, using PAPERCLIP_URL,
  PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD from the environment.

MY INSTANCE
Paperclip in authenticated mode on my LAN at <INSTANCE_URL>. I will export the three
environment variables above in my shell before you run the smoke script. Ask me to run
anything that needs a browser.

HOW TO WORK
- Follow the build order in the architecture document, one step per session of work. After
  each step: run typecheck and tests, show me what changed and how to try it, update
  docs/ARCHITECTURE.md if a decision changed, commit with a conventional commit message, then
  stop and wait for my review.
- Start every step by stating the plan in a few lines. Ask when a decision is mine to make:
  naming, scope, anything that changes the user-facing design.
- Prefer small files with one job. Do not add a dependency without saying why.
- Write CLAUDE.md early, with the commands to run, the constraints above and the reference
  repository rules, so later sessions start with the same ground rules.

FIRST TASK (steps 1 and 2 of the build order)
1. Scaffold the repository: package.json, tsconfig, bunfig, licence and notices, CLAUDE.md,
   a launcher at bin/clipode.ts, and an OpenTUI app that opens, shows the wordmark, and
   quits cleanly on ctrl+c.
2. API spike:
   a. Write script/gen-types.ts, which fetches /api/openapi.json from PAPERCLIP_URL and
      generates src/api/types.ts. Record which Paperclip version it was generated from.
   b. Implement src/api/client.ts and src/api/auth.ts with the read-only guard, the cookie
      jar and the Origin header.
   c. Write the smoke script: sign in, list companies, fetch the attention feed and one
      heartbeat run for the first company, and print a short summary of each.
   d. Try the live-events WebSocket with the session cookie and report exactly what the
      server answers. The probe report says it connects with the cookie alone; confirm that from Bun.
   e. Save scrubbed copies of the responses under test/fixtures/ and add the first unit
      tests for the client.
3. Report: what works, what differs from the architecture document, and what you recommend
   changing before the UI work starts. Then stop.
```

For later sessions, a short follow-up is enough: "Continue with step N of the build order in docs/ARCHITECTURE.md. Same rules as CLAUDE.md."
