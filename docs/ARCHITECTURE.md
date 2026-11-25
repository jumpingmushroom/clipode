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

## Phase 2: decide and reply (release 1.0)

Phase 2 makes clipode read and write, and ships as version 1.0. Decided on 2026-11-23:

- **A write allowlist, not a removed guard.** `src/api/client.ts` keeps refusing every request that is not a `GET`, except for the exact routes in the following table. Setting `readOnly: true` in `cli.json` restores phase 1 behaviour.
- **Confirm before sending** only for approvals and rejections (an approval's approve, reject and request revision, and a confirmation's reject). Answers, accepts, comments, dismissals and snoozes are sent at once.
- **Optimistic updates.** An item leaves the inbox when its answer is sent and comes back, with an error toast, if the server refuses.
- **Live testing** happens in a scratch company with a test agent on the target instance, never on real work. Tests stay on the fake server.

| Action | Route at `2026.1117.0` | Body |
| --- | --- | --- |
| Answer an agent's questions | `POST /api/issues/{id}/interactions/{interactionId}/respond` | `answers: [{ questionId, optionIds, otherText? }]`, `summaryMarkdown?` |
| Accept a confirmation | `POST …/interactions/{interactionId}/accept` | `selectedOptionIds?` |
| Reject a confirmation | `POST …/interactions/{interactionId}/reject` | `reason?` (up to 4000 characters) |
| Approve or reject an approval | `POST /api/approvals/{id}/approve`, `/reject` | `decisionNote?` |
| Request a revision | `POST /api/approvals/{id}/request-revision` | `decisionNote?` |
| Decide a stalled task review (1.1) | `POST /api/issues/{id}/stalled-review-decision` | `action: "approve" \| "request_changes" \| "send_back"`, `note` (required for `request_changes`) |
| Comment on a task | `POST /api/issues/{id}/comments` | `body`, `clientRequestId?` (a UUID, for safe retries) |
| Dismiss or snooze an inbox item | `POST /api/companies/{companyId}/inbox-dismissals` | `itemKey` (the item's `dismissalKey`), `kind: "dismiss" \| "snooze"`, `snoozedUntil?` |
| Undo a dismissal or snooze | `DELETE /api/companies/{companyId}/inbox-dismissals/{itemKey}` | none |

The bodies are read from `packages/shared/src/validators` and `server/src/routes/inbox-dismissals.ts` at the tag. A live probe in the scratch company (prefix `CLI`) on 2026-11-23 confirmed them; scrubbed requests and responses are in `test/fixtures/writes/`:

| Action | Observed |
| --- | --- |
| Answer (`respond`) | `200`, the interaction with `status` resolved; the item leaves the feed |
| Accept a confirmation, body `{}` | `200`, `status: "accepted"`, `result: { version, outcome }` |
| Approve with a note | `200`, the approval |
| Dismiss, snooze | `201`, the dismissal record |
| Undo a dismissal or snooze | `204` with an empty body |
| Comment | `201`, the comment. A second request with the same `clientRequestId` also answers `201` and creates no second comment, so a retry is safe. |

Rejecting a confirmation, and rejecting or requesting a revision on an approval, were verified through the app on 2026-11-23 (CLI-8): the server recorded `rejected` with the reason, and `rejected` and `revision_requested` with the note. Question and option ids are readable keys chosen by the agent (`colour`, `blue`). Answers need them, and the phase 1 item model drops them.

A fifth decision kind appeared in the probe: a task review (`sourceKind: "review"`) for a task in review. Since 1.1 it has its own row marker, `◇`. Only a stalled review (`subject.metadata.reviewAttentionState: "stalled"`: no reviewer, approval or monitor left) is decided in the inbox, with approve (the task becomes done), request changes (a note is required) or send back; these go through the prompt like approvals. Any other review is decided where it waits, as in the web UI, and its item offers only `o` to open the task. Request bodies come from `stalledReviewDecisionSchema`. Verified through the app on 2026-11-23: a scratch task moved to in review with nobody assigned became a stalled review (CLI-9), and request changes moved it back to todo with the note posted on the task.

Build order for phase 2:

1. **Probe.** Send each action once in the scratch company and record the requests and responses, scrubbed, as fixtures.
2. **Write guard.** The allowlist, `readOnly`, and tests that every other method and path still throws.
3. **Answer and decide.** Selectable options in the item view, the confirm step for approvals and rejections, optimistic removal from the inbox.
4. **Composer.** The composer row becomes a text field for comments and written answers.
5. **Dismiss and snooze.** Inbox keys, a snooze duration choice, and undo.
6. **Question context.** The Context section from `originCommentIds`.
7. **Release 1.0.**

Built as of 1.0: all seven steps. In an opened item, `j`/`k` choose, `enter` or `space` selects, and `ctrl+s` sends answers; `o` opens the task or run. `c` comments from the composer row; `d`, `s` and `u` dismiss, snooze and restore in the inbox. The inbox badge counts items that need you, without snoozed ones. A new toast replaces a passing one; only errors queue. Verified live in the scratch company: answer, accept, approve, comment, dismiss, snooze and restore. Rejections and revision requests were verified later, through the app (CLI-8).

## Phase 3: operate (release 1.2 onwards)

Phase 3 starts, as decided on 2026-11-23, with tasks: create and edit them, assign them, and change their status and priority. Agent controls (wake, pause, resume) and cancelling runs follow.

| Action | Route at `2026.1117.0` | Body |
| --- | --- | --- |
| Create a task | `POST /api/companies/{companyId}/issues` | `description` and/or `title` (without a title the server takes one from the description and flags it for generation), `projectId?`, `assigneeAgentId?`, `assigneeAdapterOverrides?: { adapterConfig: { model } }`, `workMode?: "planning" \| "ask"`, `visibility?: "private"`, `idempotencyKey` |
| Edit, assign, change status or priority | `PATCH /api/issues/{id}` | any of `title`, `description`, `status`, `priority`, `assigneeAgentId` (null to unassign), `projectId` |
| Models for the model choice (a read) | `GET /api/companies/{companyId}/adapters/{adapterType}/models` | answers `[{ id, label }]` |
| Attach a file to a task (1.4) | `POST /api/companies/{companyId}/issues/{issueId}/attachments` | multipart form, field `file`; answers `201` with the attachment. Size (10 MB by default) and types are server settings. |
| Wake an agent (1.6) | `POST /api/agents/{id}/wakeup` | `source: "on_demand"`, `triggerDetail: "manual"`, `reason?`, `idempotencyKey`; answers `202` with the queued run |
| Pause or resume an agent (1.6) | `POST /api/agents/{id}/pause`, `/resume` | none; answers `200` with the agent. A resume takes effect a moment after the answer, so the agent is read again. |
| Cancel a run (1.6) | `POST /api/heartbeat-runs/{runId}/cancel` | none; answers `200` with the run, also when it is already cancelled. A `cancellationRequestId` is refused with `409` ("Correlated Stop requires a native run") for these runs, so it is not sent. |

Probed in the scratch company on 2026-11-23 (scrubbed in `test/fixtures/writes/task-*.json`): create answers `201` with the task; a second create with the same `idempotencyKey` answers `200` with the same task. Every update answers `200` with the task. `expectedStatusVersion` is accepted only for a status-only backlog-to-todo promotion and otherwise refused with `422`, so clipode sends status changes without it. Assigning an agent wakes it.

`PATCH /api/issues/{id}` accepts many more fields (execution policy, visibility, hiding). The allowlist admits the route; only clipode's task functions build its bodies, and they send the fields in the table and nothing else.

Since 1.13, a comment on a task assigned to you hands it back, as the web UI's composer does: commenting alone does not wake anyone, because only the assignee is woken and the task is yours. Found on SKO-291 on 2026-11-25: the agent moved it to in review and assigned it to the user; two comments from clipode woke nothing, while the web UI's comment reassigned it to the agent in the same request. The composer then shows "to <agent>", the agent that last assigned the task to you (from `GET /api/issues/{id}/activity`), else the agent that commented last; `ctrl+t` picks another agent or none. Sending with an agent is one `PATCH /api/issues/{id}` with `comment`, `commentClientRequestId`, `attachmentIds?`, `assigneeAgentId` and `assigneeUserId: null`; the server adds the comment, reassigns and wakes the agent. Without one, the comment goes through `POST …/comments` as before. Unlike the web UI, clipode does not clear `assigneeAdapterOverrides` on the hand-back. Verified in the scratch company on 2026-11-25: CLI-4, assigned to the user, handed to Paperclipper with a comment; the agent ran a second later and answered.

Keys: in the task thread, and on the selected row in Tasks, `s` changes status, `p` changes priority, `a` assigns (agents or unassigned), and `e` edits. `n` creates a task.

Agent controls (1.6): on the Agents screen and agent detail, `w` wakes the agent after a prompt for an optional reason, and `p` pauses it (after a confirmation) or resumes a paused one at once. In a live run's transcript, `x` cancels the run after a confirmation. Verified in the scratch company.

The inbox's other items (1.14), as decided on 2026-11-25. The attention feed has eleven kinds; until 1.14 clipode acted on six. These get their own row markers and choices in the opened item:

| Item (`sourceKind`) | Choice | Route at `2026.1117.0` | Body |
| --- | --- | --- | --- |
| Failed run (`failed_run`), on a task | Retry the run | `POST /api/issues/{id}/retry` | `idempotencyKey`, `observedRunId` (the failed run); `202` with `accepted: true`, or `200` with `accepted: false, stale: true` when the task is closed or unassigned, or has a newer run |
| Failed run without a task | Retry the run | `POST /api/agents/{id}/wakeup` (already allowed) | as a wake, plus `reason: "retry_failed_run"`, `failedRunId` |
| Agent error (`agent_error_alert`, `⊘`) | Clear the error | `POST /api/agents/{id}/clear-error` | none; `409` unless the agent is in error |
| Decision (`decision`, `◈`) | An option, or dismiss | `POST /api/decisions/{id}/decide`, `/dismiss` | `optionId`, `inputValues?`, `idempotencyKey`; dismiss takes `reason?` and runs no option's effects |
| Approval | Comment on the approval | `POST /api/approvals/{id}/comments` | `body`; the discussion (`GET …/comments`) shows above the choices |
| Recovery action (`recovery_action`, `↻`) | Try again, mark done, send for review, or false positive (done or review) | `POST /api/issues/{sourceIssueId}/recovery-actions/resolve` | `actionId`, `outcome: "restored" \| "false_positive"`, `sourceIssueStatus`, `resolutionNote?`, as the web UI's recovery card sends them |

Probed in the scratch company on 2026-11-25 (scrubbed in `test/fixtures/writes/`): the test agent created decisions on CLI-10 (agents create them; a board user cannot); deciding answered `200` with the decision, `status: "decided"` and the option's effects run (`executionStatus: "succeeded"`); the same key replayed it, and a second choice answered `409 decision_already_resolved`. Dismissing answered `200`. A retry on CLI-11 while its run was going answered `202`, accepted, and the same key again `202`; retries of a done task and of a task the agent had handed back answered `200`, stale. Clearing the error of a working agent answered `409` ("Only agents in error status can have their error cleared"). An approval comment answered `201`. Clearing a real error, resolving a recovery action and retrying a run without a task follow the server's source: no agent was in error and no recovery action existed to try them on.

A decision lists each option with what choosing it does ("comments on a task", "cancels a task and its subtasks", or "no effects"). Choosing asks for the decision's inputs first. A destructive option is confirmed, and one that cancels a task tree needs the task identifier typed, as in the web UI. Retrying and clearing an error are sent at once, like the web UI's buttons; recovery outcomes go through the note prompt like approvals. `o` on an agent error opens the agent. On Agents and agent detail, `x` clears the selected agent's error.

Left to the web UI: budget alerts (raising a budget is untested here, since no company has one), join requests (access administration), the recovery card's workspace repairs, and run watchdog decisions (they live on the task's run ledger, not in the inbox). Those items show their summary and say so.

Routines (1.16), as decided on 2026-11-25: a routine screen and two controls.

| Action | Route at `2026.1117.0` | Body |
| --- | --- | --- |
| Routine detail (a read) | `GET /api/routines/{id}` | the routine with `descriptionDocument`, every trigger, `recentRuns` and `activeIssue` |
| Run history (a read) | `GET /api/routines/{id}/runs?limit=50` | runs newest first, each with `status`, `source`, `linkedIssue` and `failureReason` |
| Run now | `POST /api/routines/{id}/run` | `source: "manual"`, `idempotencyKey`; answers `202` with the run |
| Pause or resume | `PATCH /api/routines/{id}` | `status: "paused" \| "active"`; answers `200` with the routine |

Probed in the scratch company on 2026-11-25 with a routine created for the purpose (no triggers, assigned to the test agent; scrubbed in `test/fixtures/writes/routine-*.json`): a paused routine still runs when started by hand (`202`, `issue_created`); the same key replays the same run; a second run while the first task was open answered `202` with `status: "coalesced"`, joined to it, as the routine's concurrency policy says. No routine on the instance has variables, so clipode sends none; one that needs them would be refused by the server. The PATCH route takes every routine field; only clipode's routine function builds its body, and it sends `status` alone.

`enter` on Routines opens the routine: its description, every trigger with its next run, and its runs with the task each created (`enter` opens it). On Routines and the routine screen, `w` runs the routine now after a confirmation (it creates a task and wakes the agent, and names a run still going), and `p` pauses or resumes it at once, as with agents. The toast says whether the run started, joined one still going, or was skipped. Verified through the app on 2026-11-25: pause, resume, and a run that created CLI-15.

Held comments (1.16.1), found on SKO-226 on 2026-11-25. A comment from clipode was saved but never reached the agent, and the web UI showed it as queued with a Send button. The server holds a task's new comments in a queue (`GET /api/issues/{id}/queued-comments`) while a run is going, and also, with `state: "deferred"` and `executionWait`, when it cannot start new work: here the last run had failed on 21 Nov without a verified stop (`process_identity_missing`: "The previous run has no verified stop record. Paperclip cannot start this message yet."), its recovery action was resolved as blocked, and nothing reached the inbox. Commenting from the web UI would have been held the same way.

- After a comment, clipode reads the queue. If the comment (matched by its `clientRequestId`) is held with a reason, the composer says so, with the reason, instead of "Comment posted".
- The thread ends with a Held section: the reason (or "waiting for the agent's current run to finish") and the held comments.
- `w` in the thread sends them now, as the web UI's Send does: `POST /api/issues/{id}/queued-comments/interrupt` with the queue's `queueId`, `revision` and `targetRunId`. The server takes it as the user's word to start the agent even without a verified stop, and stops a run still going first, so `w` asks before sending and says which. A queue that changed since it was read answers `409`. From the server's source at the tag (`server/src/routes/issues.ts`, board users only); not yet verified live, since a held comment cannot be made on purpose in the scratch company.

Monitors and scheduled retries (1.17), asked for on 2026-11-25 after SKO-275, where the web UI showed "Resumes in 1h 17m … Check now". An agent waiting on something outside Paperclip schedules an issue monitor (`monitorNextCheckAt`, `monitorAttemptCount`, `monitorNotes`, and `executionState.monitor` with `serviceName`, `maxAttempts` and `timeoutAt`, all in `GET /api/issues/{id}`); a failed run may leave a `scheduledRetry`. The thread ends with a Waiting section: when the agent looks again, how many checks are done of how many, what it watches, until when, the agent's note, and that a comment wakes the agent sooner. `w` in the thread wakes the agent now for whatever waits: held comments first (1.16.1), else the monitor check or the retry. Neither of the last two is confirmed, as in the web UI: the agent only looks again sooner.

| Action | Route at `2026.1117.0` | Answer |
| --- | --- | --- |
| Check now | `POST /api/issues/{id}/monitor/check-now`, body `{}` | `200 {"ok": true}`; `409` with a reason when no check can start (none scheduled, a run being recovered) |
| Retry now | `POST /api/issues/{id}/scheduled-retry/retry-now`, body `{}` | `200` with `outcome`: `promoted` or `already_promoted` started it; `waiting`, `no_scheduled_retry` or `gate_suppressed` did not, and clipode shows the `message` |

Probed in the scratch company on 2026-11-25: the test agent scheduled a monitor on CLI-16; check-now answered `200` and used the scheduled check up (a second answered `409`, "Issue has no scheduled monitor"); the agent ran at once, commented and closed the task. Retry-now without a scheduled retry answered `200`, `no_scheduled_retry`. The Tasks list does not mark tasks with a monitor: its `view=index` rows do not carry the monitor fields, and the full rows are too heavy to poll.

Since 1.3, `n` and `e` open one task dialog modelled on the web UI's composer: description first, an optional title, then project, assignee, and, for a new task, model (from the assignee's adapter), mode (standard, plan, ask) and private. `tab` moves between fields, `enter` or `space` changes a choice field through a picker, and `ctrl+s` saves. A new task starts in the project of the task on screen. Unset fields are left out of the request so the server applies its defaults. Verified in the scratch company: CLI-5 (every field) and CLI-6 (description only, project, private).

Since 1.4 the new-task dialog has a Files row. `enter` opens a prompt for file paths: dragging files into the terminal pastes their paths, and quoted paths, backslash-escaped spaces and `~` all work. Files are checked to exist and be non-empty when added; `backspace` removes the last. As in the web UI, files are uploaded once the task exists; a file the server refuses is named in the toast with its reason, and the task stays. clipode does not guess the server's size and type limits. Verified with CLI-7. Since 1.5, `ctrl+v` on the Files row, or in the attach prompt, reads an image from the system clipboard through OpenTUI's native host clipboard (as opencode does; no external tool), saves it as a PNG in the temp folder and adds it like any other file. Where the system offers no clipboard access (a headless server, for example), the dialog says so.

Since 1.12, files go on comments and existing tasks too, through the same two allowed routes. The attach route answers with the attachment, whose `id` a comment can carry: `POST /api/issues/{id}/comments` accepts `attachmentIds` (up to 20, unique, uploaded to the same task), and the server links each attachment to the comment (`issueCommentId`). In the composer, `ctrl+o` opens the attach prompt (file paths, or `ctrl+v` for the clipboard's image or copied paths); the files show before the text and are uploaded when the comment is sent, which then carries the ids of those the server took. A comment of files alone is sent as "Attached <names>", since the server needs some text. `f` on a task (thread or Tasks row) uploads files to the task without a comment. The new-task dialog, the composer and `f` share one prompt (`src/screens/attach-prompt.tsx`). Since 1.12.1, `ctrl+v` reads the clipboard as opencode does, image first and then text (terminals send `ctrl+v` as a key, not a paste): in any multi-line text field it pastes text at the cursor, and where the field takes files (the composer, the new-task description) an image becomes a file. On the Files row and in the attach prompt, copied text is read as file paths. Verified in the scratch company on 2026-11-25 (CLI-9): the comment's file was linked to the comment, the `f` file to the task only, and commenting did not reopen the cancelled task.

## Phase 4: round out (release 1.7 onwards)

Phase 4 adds reads only; the write allowlist does not change. It starts with desktop notifications, then search, then the rest of the scope line in the table above.

Desktop notifications (1.7): when an inbox refresh, live or polled, brings an item that was not in the feed before, clipode sends one notification through OpenTUI's `renderer.triggerNotification`, which writes the terminal's own notification escape sequence (so it works over SSH and needs no system tool; a terminal without one ignores it). The items present at the first load, snoozed items, and items seen before are never reported. One new item is named (kind, task identifier and title); several at once are counted. Notifications are sent only while the terminal does not have focus, or always where the terminal cannot report focus. `"notifications": false` in `cli.json` turns them off.

Search (1.8): `g /` or `ctrl+x /`, from any screen, opens a search dialog in the style of the command palette. It sends `GET /api/companies/{companyId}/search?q=…&limit=50` 300 ms after the last keystroke (the server allows 60 searches a minute per user and answers `429` beyond that, which the dialog reports) and lists the results in the server's order. Probed on 2026-11-23: results are `issue`, `agent` or `project` (`artifact` from source, not seen); a task hit covers matches in its title, identifier, description, comments and documents, with `sourceLabel` naming where ("Title", "Comment", a document's title) and `snippets[0]` holding the matched text with highlight offsets. An agent's or project's result `id` is its own id. Each row shows the task identifier and title, where it matched, and, for matches outside the title, the text from just before the first match. `enter` opens the task thread or the agent; a project opens Tasks limited to that project (since 1.10).

Routines and activity (1.9), as decided on 2026-11-23 (costs and quotas wait). Both are reads and load only when their screen is first opened; after that a live `activity.logged` event (for routines, one whose `entityType` starts with `routine`) or the list poll refreshes them.

- Routines (`g r`): `GET /api/companies/{companyId}/routines` lists each routine with its triggers, `lastRun` (with `linkedIssue`) and `activeIssue`. Probed on 2026-11-23: every trigger on the instance is a `schedule` with a human `label` ("Every 30 min, 08:00–22:30 Oslo"), a `cronExpression`, a `timezone` and `nextRunAt`. The list shows status, agent, the first trigger's label (or cron), when the next enabled trigger fires, and the last run's result; the sidebar adds project, time zone and what happens if a run is still going (`concurrencyPolicy`). Since 1.16, `enter` opens the routine (see Phase 3 for its screen and controls) and `o` opens the task the routine is working on, else the one its last run created.
- Activity (`g h`): `GET /api/companies/{companyId}/activity?limit=300` (the server's default is 100, its most 500). Probed: half or more of the entries are bookkeeping (environment leases, cost reports, tool discovery, read marks). As in the web UI, whose wording and list of shown actions clipode ports, bookkeeping is hidden until `a`; unlike the web UI, answers, accepted and rejected requests and review verdicts are shown, since they are what an operator does. Each row has the age, who (an agent's name, "You" for the signed-in user, "Board" for another person, "System"), the action in words, and the task or name. `enter` opens the task (an approval's first linked task), agent or run.
- Goals: no company on the instance has any, so there is no goals screen yet.

Projects (1.10, `g p`): the list clipode already reads for the task dialog (`GET /api/companies/{companyId}/projects`), now with `status`, `description`, `leadAgentId`, `targetDate` and `archivedAt`. Probed on 2026-11-23: one to four projects per company, none with a lead, goals or a target date. Archived projects are left out. Each row has the status and the project's open, in-flight and done task counts, counted from the task list; the sidebar adds lead, target date and description. `enter` opens Tasks limited to the project by id (the route's `projectId`), with the project's name in the title; `g t` shows all tasks again.

Costs and quotas (1.11, `g c`): one scrolling report built from seven reads, fetched again each time the screen opens and on `r`:

| Part | Route at `2026.1117.0` | Notes |
| --- | --- | --- |
| Total | `GET /api/companies/{id}/costs/summary?period=month\|all` | spend, budget and pricing state; `eventCount` counts ledger events, so runs come from the model rows |
| By agent, by model, by project | `…/costs/by-agent`, `…/costs/by-provider`, `…/costs/by-project` (same `period`) | agent and model rows count runs (`apiRunCount + subscriptionRunCount`); project rows only events, shown as runs |
| Rolling windows | `…/costs/window-spend` | 5h, 24h and 7d tokens per provider |
| Quotas | `…/costs/quota-windows` | the server asks each provider; a failed account carries `error` |
| Budgets | `GET /api/companies/{id}/budgets/overview` | policies, active incidents, paused agents and projects |

Probed on 2026-11-25: every run on the instance is billed to a Claude subscription (`billingType: "subscription_included"`), so spend is $0 everywhere; no company has a budget; and every quota request fails ("Subscription quota is currently unavailable", `errorFamily` `permission_denied` or `provider_unavailable`). The report therefore leads with runs and tokens, adds a cost column only when there is spend, says when every run is on a subscription, and shows the server's reason for a missing quota. Agents and projects are sorted busiest first. There is no sidebar warning for budgets or quotas: none exist here, and checking quotas on every start would make the server ask the provider each time.

Task content (1.15), as decided on 2026-11-25. Probed the same day: `GET /api/issues/{id}` already carries `documentSummaries` (key, title, latest revision number, who updated it and when, no body) and `workProducts` (type, provider, title, url, status), so the thread needs no extra request; 4 of 44 tasks in one company had documents (a price list, a ledger at revision 13, plans), and work products were attachments recorded as `artifact`. Sub-tasks come from the task list already loaded (`parentId`).

- The thread shows a Documents section under the description (title, revision, who, when) and a Work products section as Markdown links, so a pull request's or preview's URL can be followed. `d` opens the task's document, through a picker when there are several; the document screen sends `GET /api/issues/{id}/documents/{key}` on every visit and shows the latest revision as Markdown, with its number, author and time. Older revisions are not shown.
- `t` picks the parent or a sub-task and opens it; sub-task rows in the thread sidebar open on click.
- Queued comments: see held comments (1.16.1) below. The probe saw only empty queues, which was wrong to generalise.

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
- **Local instances:** `local_trusted` mode needs no credential on loopback; the client detects this from a successful unauthenticated request and skips sign-in. On the sign-in screen, leaving the email and password empty tries exactly that. With `PAPERCLIP_API_KEY` set, the client sends the key as a bearer token, skips the sign-in screen, and polls without opening the WebSocket.

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
- **Reconnect.** Exponential backoff from 1 second, capped at 30 seconds, a full refetch of visible data after every reconnect or resync, and a connection indicator in the footer. After a failed connect, a `GET /api/auth/get-session` decides the state: 401 ends the session, a network error is `offline`, success is `polling`. `ctrl+r` retries at once.
- **Event routing.** `activity.logged` refetches the inbox and the task list, and the thread of its task if that thread was opened. `heartbeat.run.queued` and `heartbeat.run.status` refetch live runs and an open transcript. `heartbeat.run.log` and `heartbeat.run.event` read new log bytes of an open transcript. `agent.status` refetches agents. Refetches are debounced by 300 ms. Ids come from `issueId`/`runId` or from `entityType` with `entityId`.
- **Polling fallback.** With no WebSocket: inbox every 30 seconds, the visible list every 60 seconds, an open run's log every 2 seconds by byte offset. Polling slows down while the terminal is unfocused.

Confirmed on `2026.1117.0`: the WebSocket upgrade succeeds with only the session cookie, with any `Origin` header or none, and is refused with 403 without the cookie. The server stays silent until the client sends `live.hello`, then answers `live.capabilities` with `run-interests` within milliseconds. The client then sends `live.interests` with the ids of the runs it has open and receives `live.subscribed` with the same revision about 1 ms later; the revision must increase with every `live.interests`. The server pings every 30 seconds and drops a socket that misses a pong; Bun's WebSocket client answers pings itself and held a connection for 65 seconds. No event type announces an attention change, so the inbox refetches when `activity.logged` arrives. Bun reports a refused upgrade only as an error message (`Expected 101 status code: 403`) followed by close code 1006, with no status field, so after a failed connect the client checks the session with a `GET` to tell an expired session from a network fault rather than parse the message. All of this was confirmed from Bun 1.4.5 by `script/live-probe.ts` on 2026-11-20.

### Stores

Each store is a Solid store with the same small surface: `load()`, `refresh()`, a `status` of `idle | loading | ready | error`, and the data. Screens never call the API directly. `load()` reuses a request on its way; `refresh()` always asks again, and only the newest answer is kept, so a refresh after a write or a changed sort never shows an older answer (since 1.12.2). Transcript items are replaced, not edited, when a later log chunk adds to them, because the run screen keys its rows by item.

The write allowlist is checked against the URL as it will be sent, after the URL parser has resolved `\`, `%2e%2e` and dot segments, and every path must start with `/` and stay on the instance's origin; any other request throws `ReadOnlyError` before it is sent (since 1.12.2).

| Store | Holds |
| --- | --- |
| `session` | Instance URL, user, deployment mode, selected company, connection state |
| `attention` | Inbox items, counts by kind, the three shelves |
| `issues` | Task list for the current filter, plus a cache of opened tasks with their threads |
| `runs` | Live and recent runs, and the transcript of the open run |
| `agents` | Agents with status, model and current task |

### Transcripts

A run's log is adapter output, and its format differs per adapter. `src/transcript` turns log records into a common list of entries: assistant text, thinking, user text, tool call with result, session init, final result with tokens and cost, and raw lines.

Phase 1 parses the Claude, Codex and ACP families, which is the set paperclip-android handles. The parsers are ported from Paperclip's own UI parsers (`packages/adapter-utils/src/acpx-engine/ui.ts` and `packages/adapters/*/src/ui/parse-stdout.ts`).

Found on `2026.1117.0`: `claude_local` agents write ACP records (`acpx.session`, `acpx.text_delta`, `acpx.tool_call`, `acpx.status`, `acpx.result`), not Claude Code's stream-json. So the format is detected per line from the record's `type`, not from the agent's adapter type, and the ACP parser is the one tested against a recorded log. Claude stream-json and Codex are tested with invented logs. Any other line falls back to a raw line, so every run is at least readable.

The log is read by byte offset: `nextOffset` is present only when a read stopped at `limitBytes`, so a finished run is read in ranges until it is absent, and a live run is polled from the last offset every 2 seconds. Records split lines at arbitrary points, so lines are rebuilt per stream and a partial line is carried into the next read.

In the transcript, `t` expands reasoning, `e` expands tool output beyond 3 lines, and `s` shows ACP status lines (usage updates and similar), hidden by default. In a task thread, `o` lists the task's runs.

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
| Task thread | Title and description, then comments and run activity in time order; it opens at the latest entry and follows new ones until scrolled up. Task references (links to a task, and bare identifiers of known tasks) show the task's status glyph and open it on click, in the thread and in inbox items. Sidebar: status, priority, assignee, project and goal, parent and sub-tasks, blockers, live run, cost. | Run transcript |
| Run transcript | Messages, reasoning, collapsible tool calls with output, and the final result. Follows the tail while the run is live. A footer line gives agent, model, duration, tokens and cost. | Back to the thread |
| Agents | The team: status, model, what each agent is doing now. | Agent detail with recent runs |

The three inbox shelves and the kinds of request come from paperclip-android's Decisions desk, which sorts by when a decision is needed. The phone app's Home dashboard has no equivalent here; its summary numbers go in the inbox sidebar.

### Keys

Defaults follow opencode and pasode, and every binding can be changed in the config file. Bindings run on OpenTUI's own `@opentui/keymap` (the engine opencode uses): a timed leader, comma-separated alternatives, and a `mode` layer field that switches screen bindings off while a dialog is open. In binding strings, leader sequences are written `<leader>i` and plain-key sequences with spaces, `g t`.

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
| `leader 1`..`9`, `leader .` `,`, `leader w` | Jump to, cycle and close tabs (in a binding string, `,` is written `comma`) |
| `leader s` | Settings: instance, user, company, theme, sidebar, config file, sign out |
| `ctrl+r` | Reconnect the live connection |
| `leader c` | Switch company |
| `leader shift+t`, `ctrl+t` | Theme switcher with live preview (`ctrl+t` is from the mockup's palette) |
| `leader h` | Help with every binding |
| `r` | Refresh the current screen |
| `ctrl+c` twice, `leader q` | Quit |

Minimum terminal size is 80 by 24. Mouse support is on by default: click to select, wheel to scroll, click a tab to switch, click a task reference to open it.

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
| A model per agent in the Agents list ("claude-sonnet-5-5") | `adapterConfig.model` is empty for `claude_local` agents on the default model | The Model column shows the configured model, else the adapter type; a run's transcript shows the model the session reported. |
| Agents "Today" group with runs and cost | No per-day summary endpoint | Left out; agent detail lists recent runs with duration and cost. |
| Sub-task progress "2/5" on task rows | List rows carry `parentId` but no counts | Counted from the full task list, which the Tasks screen loads anyway. |
| Run entries in the thread with a one-line summary ("Scoped into 5 sub-tasks") | `/issues/{id}/runs` has status, times and `usageJson.costUsd`, no summary | Run entries show agent, status, duration and cost. |
| Filter chips `project:any  assignee:any  priority:any` | No server filter needed for one company's tasks | One filter line: free text plus `project:`, `assignee:`, `priority:` and `status:` tokens, applied in the client. |
| Mine / Unassigned / Company tabs above the list | Only two sort orders | Built as a `Latest` / `Decide by` switch in the same place; `tab` toggles it. |
| Agents group: Running, Waiting on you, Blocked | Agent statuses are active, idle, running, paused, error, pending approval and terminated; none is "blocked" | Running (status `running`), Waiting on you (distinct agents behind open inbox items), Error (status `error`). |
| A question body with a proposal, table and code block | The question's prompt and options only | Each prompt is rendered as Markdown, followed by its options as inactive `( )` or `[ ]` choices. |

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

Built as of step 9: the sidebar footer is a built-in plugin registered through this API. The other built-in sidebar sections (inbox counts, task properties, run usage) are still screen components and move behind the slots when they need to be replaceable. A slot render runs inside Solid's reactive scope, so it renders again when the store values it reads change. `ctx.theme` is a function, because the theme can change while the app runs. The contract is documented in `docs/PLUGINS.md`.

Plugins are listed under `plugins` in the config file, as a path or a `[path, options]` pair. The launcher maps a plugin's `solid-js` and `@opentui/*` imports onto the host's copies, so a plugin needs no install or build step. A plugin that throws is reported in a toast and in the status dialog, and does not stop the app.

### Themes

- The theme schema is opencode's JSON format. Themes load from `~/.config/clipode/themes` and from `~/.config/opencode/themes`.
- Built-in themes: `clipode-dark` and `clipode-light` (the agreed tokens), `system` (generated from the terminal palette, as in opencode), and opencode's `opencode`, `everforest`, `gruvbox`, `kanagawa`, `nord` and `solarized`. With no theme chosen, clipode follows the terminal with `clipode-dark` or `clipode-light`. An opencode palette maps onto clipode's tokens as background → background, backgroundPanel → panel, border → border, text → text, textMuted → muted, primary → accent, backgroundElement → selection, and success, warning and error unchanged.
- Components use semantic tokens (text, muted, border, accent, success, warning, error, selection) and never raw colours.
- Dark and light modes follow the terminal by default and can be forced.

### Config and state

| File | Purpose |
| --- | --- |
| `~/.config/clipode/cli.json` (JSONC) | Instance URL, theme, leader key, keybinds, sidebar behaviour, polling intervals, mouse, plugins, notifications, read-only |
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
8. **Agents, tabs, company switch, settings dialog.** The company switch (`leader c`) and the company picker after sign-in were built early, in step 4, because the inbox needs a company.
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
- Built as of step 10: `script/build.ts` compiles with OpenTUI's Solid transform plugin and installs every platform's native OpenTUI package first, because the core package's loader names all of them. A binary is about 135 MB, of which the Bun runtime is 107 MB; gzipped, about 59 MB. The workflow builds each target on a runner of that platform (`ubuntu-latest`, `ubuntu-24.04-arm`, `macos-15-intel`, `macos-latest`). Releases are expected at `github.com/jumpingmushroom/clipode`; the address is set in `src/update.ts` and `install.sh`.

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

- [x] Decided: the shelf rule stands, including every high-severity item on Decide now.
- [x] Decided: a question's detail shows the comment the agent wrote alongside it (`originCommentIds`) as a Context section above the question, from the task's comments. Agents do not always link it: on 2026-11-23 a question said "see the proposal comment" with `originCommentIds` empty, while the proposal was a comment written 12 seconds earlier by the same run. So without linked comments, the context is the comments whose `createdByRunId` equals the interaction's `sourceRunId`.
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
