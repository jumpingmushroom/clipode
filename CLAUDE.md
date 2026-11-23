# clipode

A terminal client (TUI) for a self-hosted Paperclip instance, in the style of the OpenCode TUI. It reads everything and sends a small allowlist of writes (answers, decisions, comments, dismissals, and task create and update). MIT licensed.

Read `docs/ARCHITECTURE.md` before any work. It is the agreed design and holds the build order. `docs/design/` holds the agreed mockup, and `docs/research/attention-and-live-findings.md` holds what the real instance returns. Where the probe disagrees with Paperclip's docs or source, the probe wins.

## Commands

Bun is installed in `~/.bun/bin`. Add it to `PATH` if `bun` is not found.

| Command | What it does |
| --- | --- |
| `bun install` | Install pinned dependencies |
| `bun run start` | Start the app (`bin/clipode.ts`) |
| `bun run typecheck` | Type check with `bun check` |
| `bun test` | Unit tests; never touches a real instance |
| `bun run smoke` | Sign in to the real instance and print a summary |
| `bun run live-probe` | Open the live-events WebSocket with the session cookie and print the exchange |
| `bun run record` | Record scrubbed fixtures for one company (`SMOKE_COMPANY=<issue prefix>`) into `test/fixtures/company/` |
| `bun run audit-fixtures` | Search all fixtures for real names from the instance and for keys that are not field names; run before committing fixtures |
| `bun run build` | Compile a binary for this machine into `dist/` (`--target=linux-arm64,darwin-arm64` or `--all` for others), with gzipped copies and `SHA256SUMS` |
| `bun run gen-types` | Regenerate `src/api/types.ts` from the instance's `/api/openapi.json` |

The last five need `PAPERCLIP_URL`, `PAPERCLIP_EMAIL` and `PAPERCLIP_PASSWORD`. They are in `smoke.env` at the repository root (mode 600, ignored by git): run them as `bun --env-file=smoke.env run <script>`, and never print the file.

## Hard constraints

- **Writes only through the allowlist.** `src/api/client.ts` sends `GET` anywhere, sign-in and sign-out, and, when the client allows writes, only the routes listed in `WRITES` (phase 2: answers, decisions, comments, dismissals; phase 3: creating and updating tasks). Everything else throws `ReadOnlyError` before a request is sent, and `readOnly: true` in `cli.json` turns all writes off. Tests cover both lists. Add a route only with its phase in `docs/ARCHITECTURE.md`, and send writes to a real instance only in the scratch company (prefix `CLI`).
- **Credentials.** Sign in with email and password to get a session cookie. Never write the password to disk. The cookie goes in `~/.local/state/clipode/auth.json` with mode `0600`.
- **No real data in git.** Never commit credentials, cookies, the instance URL or raw responses. Fixtures recorded from the instance go through `script/scrub.ts`, and `bun run audit-fixtures` must pass before they are committed.
- **Wire format stays in two folders.** Only `src/api` and `src/transcript` know Paperclip's wire format. Screens read from stores.
- **Theme tokens only.** Components use semantic tokens (`text`, `muted`, `accent`, and so on) and never raw colour values.
- **Tests never contact a real instance.** They use fixtures and a fake server started inside the test (`Bun.serve({ port: 0 })`).

## Reference repositories

Clone them under `../ref/` and never vendor them.

| Repository | Licence | Rule |
| --- | --- | --- |
| `paperclipai/paperclip`, at tag `v2026.1117.0` | MIT | Source of truth for the API: `server/src/routes`, `server/src/realtime`, `packages/shared`. |
| `anomalyco/opencode` | MIT | `packages/tui` is the visual model. Code may be ported. A ported file starts with a one-line comment naming its source path, for example `// Ported from opencode packages/tui/src/ui/dialog.tsx`. |
| `splitpierre/paperclip-android` | MIT | Logic such as transcript parsing and inbox grouping may be re-implemented. Credit it in `THIRD_PARTY_NOTICES.md`. |
| `jumpingmushroom/pasode` | **None** | Read it for structure and behaviour only. Do not copy or closely translate its files, functions, tests or docs. Port shared components from opencode instead. |

## Stack notes

- `@opentui/core` and `@opentui/solid` are pinned at `0.9.7`, and `solid-js` at `1.9.20`. OpenTUI 0.9 requires Solid 1.9, so do not take Solid 2. Check the OpenTUI docs or the installed `.d.ts` files before using an API from memory or from pasode, which is on 0.5.
- In 0.9, a `<span>` takes colours through `style={{ fg }}`. A `<text>` takes `fg` directly.
- Screen tests use `testRender` from `@opentui/solid` with `captureCharFrame()` and `mockInput`. `pressEscape()` is handled asynchronously; wait about 40 ms before asserting.
- Keys go through `@opentui/keymap`. Write leader bindings as `<leader>i` and plain-key sequences with spaces: `g t` (clipode adds a parser for that; `gt` alone is the named key `>`). Screen commands use `useCommands` with `mode: "base"`, dialog keys `mode: "modal"`. Never add or remove layers inside a key handler: wrap dialog changes made from a handler in `afterDispatch`. A dialog with a text field must not bind `j`/`k`.
- Keep files small, with one job each. Say why before adding a dependency.

## Workflow

Follow the build order in `docs/ARCHITECTURE.md`, one step per session. Start each step by stating the plan in a few lines. After each step: run the typecheck and tests, show what changed and how to try it, update `docs/ARCHITECTURE.md` if a decision changed, and commit with a conventional commit message. Then stop for review. Ask the user about naming, scope, and anything that changes the user-facing design.
