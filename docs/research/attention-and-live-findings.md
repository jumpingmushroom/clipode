# Attention feed and live-events findings

Investigation of a self-hosted Paperclip instance on 2026-11-20, run read-only against the
live instance after its upgrade to 2026.1117.0. Every name, email, ID, slug, host name, and
free-text value in this report is an invented placeholder. Field names, types, nesting, and
enum values are exactly as the server returned them.

The previous investigation, against 2026.1106.0, is kept in
`attention-and-live-findings-2026.1106.0.md`.

## Instance version

| Source | Value |
| --- | --- |
| `GET /api/health` (signed in), `version` | `2026.1117.0` |
| `GET /api/health`, `commit` | `c0f132898d2a2677312d8c72096187b27a3d9a38` |
| Matching release tag | `v2026.1117.0` (`c0f1328`). All source references below use this tag. |
| paperclip-android | `master` at `6432b56` (2026-11-10) |

## Which company was tested

The first company that `GET /api/companies` returns has no attention items: `totalCount` is
0 with `all=true`, `includeDismissed=true`, and `archived=true`. You chose a second
company for question 1. That company has 6 items: 4 `issue_thread_interaction` (3 questions,
1 confirmation) and 2 `blocker_attention`. Question 2 ran against the first company.

## Question 1: does the attention feed carry everything an inbox needs?

**Answer:** The feed carries every list-row field for all five kinds except two: the task
identifier for approvals and the agent name for blocked tasks. Each of those needs one
lookup. When a card is opened, the full body of every kind except failed runs, and the
answer options for agent questions, need one more request per task.

Approval and failed-run items did not exist on the instance during the test. Their columns are
marked **from source, not observed** and come from `server/src/services/attention.ts` at
`v2026.1117.0`.

### Field availability by kind

Legend: **inline** means the field is in the feed item. **extra** means the item has only an
ID, and you need the request named in the next table. **absent** means no endpoint the
feed points to supplies it.

| Field | Agent question (`issue_thread_interaction`, `detail.kind: questions`) | Confirmation (`issue_thread_interaction`, `detail.kind: confirmation`) | Approval (`approval`), from source, not observed | Failed run (`failed_run`), from source, not observed | Blocked task (`blocker_attention`) |
| --- | --- | --- | --- | --- | --- |
| Kind | inline: `sourceKind` + `detail.kind` | inline | inline: `sourceKind`, `subject.metadata.type` | inline | inline |
| Title | inline: `subject.title` | inline: `subject.title` | inline: `subject.title` (payload `title`, else `summary`, else the type) | inline: `subject.title` ("<agent> run failed") | inline: `subject.title` (the stalled blocker) |
| Task identifier | inline: `relatedIssue.identifier` (`subject.identifier` is `null`) | inline: `relatedIssue.identifier` | **extra**: `subject.identifier` and `relatedIssue` are both `null`; only `subject.metadata.issueId` | inline: `relatedIssue.identifier` when the run has a task | inline: `subject.identifier`, and the blocked task in `relatedIssue.identifier` |
| Agent name | inline: `originAgentName` | inline: `originAgentName` | inline: `originAgentName` (from `requestedByAgentId`) | inline: `originAgentName` and `detail.agentName` | **extra**: `originAgentName` is `null`; only `subject.metadata.assigneeAgentId` |
| Age | inline: `createdAt`, `activityAt` | inline | inline | inline | inline |
| Full request body (Markdown) | **extra**: only `detail.firstQuestionText` and `detail.questionCount` | **extra**: only `detail.promptExcerpt`; `detailsMarkdown` is in the interaction | **extra**: only `detail.summaryExcerpt` | inline: `subject.metadata.error` is the full error; the run log is **extra** | **extra**: `whyNow`, `detail.blockedTaskCount`, and `detail.blockingIssue` only; the description and blocker chain are on the task |
| Answer options or choices | **extra**: `decisionVerbs` has only `respond`; the options are in `payload.questions[].options` | inline: `decisionVerbs` `accept` / `reject` with the custom labels | inline: `approve`, `reject`, `request_revision` | inline: `retry`, `reassign`, `dismiss` | inline: `unblock`, `reassign`, `nudge` (`inlineResolvable: false`) |
| When it needs deciding | inline: `decideBy`, `decideByAttribution`, `expiresAt` (all `null` here) | inline | inline | inline | inline |
| Dismissed or snoozed | inline: `dismissal` {`kind`, `dismissedAt`, `snoozedUntil`, `isActive`} and `snoozedUntil` (all `null` here) | inline | inline | inline | inline |

Two details in the table:

- For the two interaction kinds, `resolverAudience.createdByAgentName` is `null` even though
  `createdByAgentId` is set. The server fills that name only when an interaction on the page
  names an addressee agent or uses the `not_creator` policy. Use `originAgentName` for the row
  instead; the server fills it for every interaction.
- Without `includeDismissed=true`, the server drops items with an active dismissal, so a
  client that shows dismissed or snoozed state must send that flag.

### Paging and filters observed

| Request | Result |
| --- | --- |
| `?all=true&includeDismissed=true` | 200, 6 items, `nextCursor: null` |
| Default (no parameters) | 200, 6 items, `nextCursor: null`. The default page size is 50. |
| `?limit=2`, then `cursor` twice | 200, pages of 2, 2, and 2 items; the last page has `nextCursor: null` |
| `?limit=101` | 400 `limit must be an integer between 1 and 100` |
| `?all=true&limit=5` | 400 `all cannot be combined with cursor or limit` |
| `?view=mine`, `?view=unassigned`, `?view=company` | 200, the same 6 items as the default. The route has no `view` parameter and ignores it. |
| `?sort=decide` | 200. The only accepted values are `activity` and `decide`. |
| `?archived=true&all=true` | 200, 0 items |
| `GET .../attention/summary` | 200. Keys: `companyId`, `generatedAt`, `totalCount`, `deskBadgeCount`, `countsBySourceKind` |
| `GET .../attention/tasks` | 200. The summary keys plus `taskIds` (6) |
| `GET .../attention/history?limit=5` | 200. Keys: `items`, `nextCursor` (resolved decisions) |
| `GET .../decisions?status=open&limit=100` | 200, an empty array |

### Extra endpoints

| Need | Endpoint | Observed | Cost for a 50-item inbox |
| --- | --- | --- | --- |
| Question prompts and options, confirmation `detailsMarkdown`, accept and reject labels | `GET /api/issues/{issueId}/interactions`, which returns every interaction on the task; filter by `id` | 200, 4.7 KB (2 interactions) and 5.5 KB (3 interactions) | One per **distinct task**, at most 50. Only when opened. |
| Blocked task description and blocker chain (`blockerAttention`, `blockedBy[]`) | `GET /api/issues/{issueId}` | 200, 10.7–12.8 KB | One per blocked item, when opened |
| Agent name for blocked tasks | `GET /api/companies/{id}/agents`, once, then cache by ID | 200, 28 KB for 9 agents | **1** per session |
| Approval task identifier | `GET /api/approvals/{id}/issues`, or `GET /api/issues/{subject.metadata.issueId}` | From source, not observed | One per approval, **needed for the row** |
| Approval body and payload | `GET /api/approvals/{id}` | From source, not observed | One per approval, when opened |
| Failed-run log | `GET /api/heartbeat-runs/{id}/log` | From source, not observed | Optional, when opened |

**Row cost.** The list needs 1 request for the feed, plus 1 for the agents list if any blocked
task is on the page, plus 1 per approval for its task identifier.

**Open cost.** Each opened item needs at most 1 request, and interactions on the same task
share it. If you prefetch all 50 items, the worst case is about 50 extra requests plus the
agents list. On this company, opening all 6 items takes at most 6 requests: one interaction
list per distinct task for the 4 interactions, and one task fetch per blocked item.

**Change since 2026.1106.0.** The row-level answer is unchanged: the same two lookups, and
the item fields are the same. New in 1117 are the `/attention/summary`, `/attention/tasks`,
and `/attention/history` routes; `/attention/summary` returned 404 on 1106.

### Scrubbed sample structures

One feed item per observed kind, from `GET /api/companies/{id}/attention?all=true&includeDismissed=true`, then the follow-up responses.

#### Feed item: `issue_thread_interaction`, `detail.kind: questions`

```json
{
  "companyId": "00000000-0000-4000-8000-000000000001",
  "sourceKind": "issue_thread_interaction",
  "subject": {
    "kind": "interaction",
    "id": "00000000-0000-4000-8000-00000000000b",
    "companyId": "00000000-0000-4000-8000-000000000001",
    "title": "example title",
    "identifier": null,
    "status": "pending",
    "href": "/demo/path",
    "metadata": {
      "kind": "ask_user_questions",
      "issueId": "00000000-0000-4000-8000-00000000000c",
      "createdByAgentId": "00000000-0000-4000-8000-00000000000d",
      "isPlanTarget": false,
      "targetDocumentKey": null
    }
  },
  "whyNow": "example whyNow",
  "decisionVerbs": [
    {
      "id": "respond",
      "label": "example label",
      "description": "example description"
    }
  ],
  "inlineResolvable": true,
  "entryRule": "example entryRule",
  "exitRule": "example exitRule",
  "dedupKey": "example dedupKey",
  "severity": "medium",
  "activityAt": "2026-11-18T13:16:03.838Z",
  "createdAt": "2026-11-18T13:16:03.838Z",
  "updatedAt": "2026-11-18T13:16:03.838Z",
  "relatedIssue": {
    "kind": "issue",
    "id": "00000000-0000-4000-8000-00000000000c",
    "companyId": "00000000-0000-4000-8000-000000000001",
    "title": "example title",
    "identifier": "DEMO-1",
    "status": "in_review",
    "href": "/demo/path",
    "metadata": {
      "priority": "medium",
      "assigneeAgentId": "00000000-0000-4000-8000-00000000000d",
      "assigneeUserId": null,
      "reviewPolicy": null
    }
  },
  "project": {
    "id": "00000000-0000-4000-8000-00000000000a",
    "name": "example name",
    "urlKey": "example urlKey",
    "color": "example color",
    "icon": null
  },
  "workspace": null,
  "detail": {
    "kind": "questions",
    "questionCount": 1,
    "firstQuestionText": "example firstQuestionText",
    "images": []
  },
  "resolverAudience": {
    "requestedResolverPolicy": "human_only",
    "effectiveResolverPolicy": "human_only",
    "effectiveResolverPolicySource": "requested",
    "resolverPolicyProvenance": "explicit",
    "addresseeAgentId": null,
    "addresseeUserId": null,
    "addresseeName": null,
    "createdByAgentId": "00000000-0000-4000-8000-00000000000d",
    "createdByAgentName": null
  },
  "id": "example id",
  "dismissalKey": "example dismissalKey",
  "dismissal": null,
  "expiresAt": null,
  "ruleKey": null,
  "originAgentName": "example originAgentName",
  "queues": [
    {
      "key": "example key",
      "title": "example title"
    }
  ],
  "shelf": false,
  "retentionDays": 30,
  "keep": false,
  "archivedAt": null,
  "retentionVersion": 1,
  "decideBy": null,
  "decideByAttribution": null,
  "snoozedUntil": null,
  "trainingExampleId": null,
  "rank": 3
}
```

#### Feed item: `issue_thread_interaction`, `detail.kind: confirmation`

```json
{
  "companyId": "00000000-0000-4000-8000-000000000001",
  "sourceKind": "issue_thread_interaction",
  "subject": {
    "kind": "interaction",
    "id": "00000000-0000-4000-8000-000000000007",
    "companyId": "00000000-0000-4000-8000-000000000001",
    "title": "example title",
    "identifier": null,
    "status": "pending",
    "href": "/demo/path",
    "metadata": {
      "kind": "request_confirmation",
      "issueId": "00000000-0000-4000-8000-000000000008",
      "createdByAgentId": "00000000-0000-4000-8000-000000000009",
      "isPlanTarget": false,
      "targetDocumentKey": null
    }
  },
  "whyNow": "example whyNow",
  "decisionVerbs": [
    {
      "id": "accept",
      "label": "example label",
      "description": "example description"
    },
    {
      "id": "reject",
      "label": "example label",
      "description": "example description"
    }
  ],
  "inlineResolvable": true,
  "entryRule": "example entryRule",
  "exitRule": "example exitRule",
  "dedupKey": "example dedupKey",
  "severity": "medium",
  "activityAt": "2026-11-18T13:35:14.126Z",
  "createdAt": "2026-11-18T13:35:14.126Z",
  "updatedAt": "2026-11-18T13:35:14.126Z",
  "relatedIssue": {
    "kind": "issue",
    "id": "00000000-0000-4000-8000-000000000008",
    "companyId": "00000000-0000-4000-8000-000000000001",
    "title": "example title",
    "identifier": "DEMO-1",
    "status": "in_review",
    "href": "/demo/path",
    "metadata": {
      "priority": "medium",
      "assigneeAgentId": "00000000-0000-4000-8000-000000000009",
      "assigneeUserId": null,
      "reviewPolicy": null
    }
  },
  "project": {
    "id": "00000000-0000-4000-8000-00000000000a",
    "name": "example name",
    "urlKey": "example urlKey",
    "color": "example color",
    "icon": null
  },
  "workspace": null,
  "detail": {
    "kind": "confirmation",
    "promptExcerpt": "example promptExcerpt",
    "isPlanTarget": false,
    "images": []
  },
  "resolverAudience": {
    "requestedResolverPolicy": "human_only",
    "effectiveResolverPolicy": "human_only",
    "effectiveResolverPolicySource": "requested",
    "resolverPolicyProvenance": "explicit",
    "addresseeAgentId": null,
    "addresseeUserId": null,
    "addresseeName": null,
    "createdByAgentId": "00000000-0000-4000-8000-000000000009",
    "createdByAgentName": null
  },
  "id": "example id",
  "dismissalKey": "example dismissalKey",
  "dismissal": null,
  "expiresAt": null,
  "ruleKey": null,
  "originAgentName": "example originAgentName",
  "queues": [],
  "shelf": false,
  "retentionDays": 30,
  "keep": false,
  "archivedAt": null,
  "retentionVersion": 1,
  "decideBy": null,
  "decideByAttribution": null,
  "snoozedUntil": null,
  "trainingExampleId": null,
  "rank": 2
}
```

#### Feed item: `blocker_attention`, `detail.kind: blocker`

```json
{
  "companyId": "00000000-0000-4000-8000-000000000001",
  "sourceKind": "blocker_attention",
  "subject": {
    "kind": "issue",
    "id": "00000000-0000-4000-8000-000000000003",
    "companyId": "00000000-0000-4000-8000-000000000001",
    "title": "example title",
    "identifier": "DEMO-1",
    "status": "in_review",
    "href": "/demo/path",
    "metadata": {
      "priority": "medium",
      "assigneeAgentId": "00000000-0000-4000-8000-000000000004",
      "assigneeUserId": null,
      "reviewPolicy": null
    }
  },
  "whyNow": "example whyNow",
  "decisionVerbs": [
    {
      "id": "unblock",
      "label": "example label",
      "description": "example description"
    },
    {
      "id": "reassign",
      "label": "example label",
      "description": "example description"
    },
    {
      "id": "nudge",
      "label": "example label",
      "description": "example description"
    }
  ],
  "inlineResolvable": false,
  "entryRule": "example entryRule",
  "exitRule": "example exitRule",
  "dedupKey": "example dedupKey",
  "severity": "high",
  "activityAt": "2026-11-20T13:31:32.187Z",
  "createdAt": "2026-11-18T08:28:10.889Z",
  "updatedAt": "2026-11-20T13:31:32.187Z",
  "relatedIssue": {
    "kind": "issue",
    "id": "00000000-0000-4000-8000-000000000005",
    "companyId": "00000000-0000-4000-8000-000000000001",
    "title": "example title",
    "identifier": "DEMO-1",
    "status": "blocked",
    "href": "/demo/path",
    "metadata": {
      "priority": "medium",
      "assigneeAgentId": "00000000-0000-4000-8000-000000000006",
      "assigneeUserId": null,
      "reviewPolicy": null
    }
  },
  "project": null,
  "workspace": null,
  "detail": {
    "kind": "blocker",
    "blockingIssue": null,
    "blockedTaskCount": 1,
    "images": []
  },
  "id": "example id",
  "dismissalKey": "example dismissalKey",
  "dismissal": null,
  "expiresAt": null,
  "ruleKey": null,
  "originAgentName": null,
  "queues": [],
  "shelf": false,
  "retentionDays": 30,
  "keep": false,
  "archivedAt": null,
  "retentionVersion": 7,
  "decideBy": null,
  "decideByAttribution": null,
  "snoozedUntil": null,
  "trainingExampleId": null,
  "resolverAudience": null,
  "rank": 1
}
```

#### Follow-up: question interaction from `GET /api/issues/{issueId}/interactions`

The element whose `id` matches the feed item's `subject.id`.

```json
{
  "id": "00000000-0000-4000-8000-00000000000b",
  "companyId": "00000000-0000-4000-8000-000000000001",
  "issueId": "00000000-0000-4000-8000-00000000000c",
  "kind": "ask_user_questions",
  "status": "pending",
  "continuationPolicy": "wake_assignee",
  "requestedResolverPolicy": "human_only",
  "effectiveResolverPolicy": "human_only",
  "resolverPolicyProvenance": "explicit",
  "effectiveResolverPolicySource": "requested",
  "idempotencyKey": "example idempotencyKey",
  "originCommentIds": [
    "00000000-0000-4000-8000-00000000001c"
  ],
  "sourceCommentId": null,
  "sourceIdentityContextId": "00000000-0000-4000-8000-00000000001d",
  "sourceRunId": "00000000-0000-4000-8000-00000000001e",
  "title": "example title",
  "summary": null,
  "createdByAgentId": "00000000-0000-4000-8000-00000000000d",
  "addresseeAgentId": null,
  "addresseeUserId": null,
  "createdByUserId": null,
  "resolvedByAgentId": null,
  "resolvedByRunId": null,
  "resolvedByUserId": null,
  "payload": {
    "version": 1,
    "supersedeOnUserComment": false,
    "questions": [
      {
        "id": "example id",
        "prompt": "example prompt",
        "selectionMode": "single",
        "required": true,
        "allowOther": true,
        "options": [
          {
            "id": "example id",
            "label": "example label",
            "freeText": true
          }
        ]
      }
    ],
    "questionSet": {
      "schema": "paperclip.question_set.v1",
      "questions": [
        {
          "id": "example id",
          "prompt": "example prompt",
          "required": true,
          "answerMode": "text"
        }
      ]
    }
  },
  "result": null,
  "resolvedAt": null,
  "dismissedAt": null,
  "dismissedByUserId": null,
  "createdAt": "2026-11-18T13:16:03.838Z",
  "updatedAt": "2026-11-18T13:16:03.838Z",
  "resolverPolicy": "human_only",
  "legacyResolverPolicyAliases": {
    "requested": "board_only",
    "effective": "board_only"
  }
}
```

#### Follow-up: confirmation interaction from `GET /api/issues/{issueId}/interactions`

```json
{
  "id": "00000000-0000-4000-8000-000000000007",
  "companyId": "00000000-0000-4000-8000-000000000001",
  "issueId": "00000000-0000-4000-8000-000000000008",
  "kind": "request_confirmation",
  "status": "pending",
  "continuationPolicy": "wake_assignee_on_accept",
  "requestedResolverPolicy": "human_only",
  "effectiveResolverPolicy": "human_only",
  "resolverPolicyProvenance": "explicit",
  "effectiveResolverPolicySource": "requested",
  "idempotencyKey": "example idempotencyKey",
  "originCommentIds": [],
  "sourceCommentId": null,
  "sourceIdentityContextId": "00000000-0000-4000-8000-00000000001a",
  "sourceRunId": "00000000-0000-4000-8000-00000000001b",
  "title": "example title",
  "summary": null,
  "createdByAgentId": "00000000-0000-4000-8000-000000000009",
  "addresseeAgentId": null,
  "addresseeUserId": null,
  "createdByUserId": null,
  "resolvedByAgentId": null,
  "resolvedByRunId": null,
  "resolvedByUserId": null,
  "payload": {
    "version": 1,
    "prompt": "example prompt",
    "acceptLabel": "example acceptLabel",
    "rejectLabel": "example rejectLabel",
    "rejectRequiresReason": false,
    "allowDeclineReason": true,
    "detailsMarkdown": "example detailsMarkdown",
    "supersedeOnUserComment": false
  },
  "result": null,
  "resolvedAt": null,
  "dismissedAt": null,
  "dismissedByUserId": null,
  "createdAt": "2026-11-18T13:35:14.126Z",
  "updatedAt": "2026-11-18T13:35:14.126Z",
  "resolverPolicy": "human_only",
  "legacyResolverPolicyAliases": {
    "requested": "board_only",
    "effective": "board_only"
  }
}
```

#### Follow-up: `GET /api/issues/{id}` for a blocked task, blocker fields only

The full response has 106 top-level keys (10.7 KB). These are the fields a blocked-task card needs.

```json
{
  "identifier": "DEMO-1",
  "title": "example title",
  "description": "example description",
  "status": "blocked",
  "assigneeAgentId": "00000000-0000-4000-8000-000000000006",
  "unblockDescriptor": null,
  "blockerAttention": {
    "state": "stalled",
    "reason": "stalled_review",
    "unresolvedBlockerCount": 1,
    "coveredBlockerCount": 0,
    "stalledBlockerCount": 1,
    "attentionBlockerCount": 0,
    "pendingFinalizeBlockerIssueIds": [],
    "sampleBlockerIdentifier": "DEMO-1",
    "sampleStalledBlockerIdentifier": "DEMO-1",
    "blockingTreeLive": false,
    "directBlockerIssueId": "00000000-0000-4000-8000-000000000003",
    "terminalBlockerIssueId": "00000000-0000-4000-8000-000000000003",
    "terminalBlocker": {
      "id": "00000000-0000-4000-8000-000000000003",
      "identifier": "DEMO-1",
      "title": "example title"
    }
  },
  "blockedBy": [
    {
      "id": "00000000-0000-4000-8000-000000000011",
      "identifier": "DEMO-1",
      "title": "example title",
      "status": "done",
      "displayStatus": "done",
      "priority": "high",
      "assigneeAgentId": "00000000-0000-4000-8000-000000000004",
      "assigneeUserId": null,
      "scheduledRetry": null,
      "activeRecoveryAction": null
    }
  ],
  "blockedTransitionAt": "2026-11-18T08:28:24.139Z"
}
```

#### `GET /api/companies/{id}/attention/summary`

```json
{
  "companyId": "00000000-0000-4000-8000-000000000001",
  "generatedAt": "2026-11-20T14:28:26.785Z",
  "totalCount": 6,
  "deskBadgeCount": 0,
  "countsBySourceKind": {
    "approval": 0,
    "decision": 0,
    "issue_thread_interaction": 4,
    "join_request": 0,
    "recovery_action": 0,
    "productivity_review": 0,
    "blocker_attention": 2,
    "review": 0,
    "failed_run": 0,
    "budget_alert": 0,
    "agent_error_alert": 0
  }
}
```

#### `GET /api/companies/{id}/attention/history`, one item

```json
{
  "sourceId": "00000000-0000-4000-8000-000000000002",
  "issueId": "00000000-0000-4000-8000-000000000003",
  "issueIdentifier": "DEMO-1",
  "issueTitle": "example issueTitle",
  "agentId": "00000000-0000-4000-8000-000000000004",
  "agentName": "example agentName",
  "projectId": null,
  "projectName": null,
  "title": "example title",
  "outcome": "answered",
  "resolvedAt": "2026-11-20T11:50:03.610Z",
  "resolvedByUserId": "example resolvedByUserId",
  "resolvedByAgentId": null,
  "id": "example id",
  "sourceKind": "issue_thread_interaction",
  "label": "example label",
  "target": null,
  "href": "/demo/path"
}
```

## Question 2: does the live-events WebSocket accept a session cookie from a non-browser client?

**Answer:** Yes. A non-browser client that sends only the session cookie connects with
`101 Switching Protocols`, with or without an `Origin` header, and with any `Origin` value.

Endpoint: `wss://paperclip.example.com/api/companies/{id}/events/ws`, reached through the
instance's TLS reverse proxy.

| Variant | Upgrade | Close | Messages in the first 30 s |
| --- | --- | --- | --- |
| a. `Cookie: <session cookie>`, no `Origin` | **101** | 1000, closed by the probe after 30 s | None unprompted. After `live.hello` at 5 s: `live.capabilities` 4 ms later. |
| b. `Cookie`, `Origin` = the instance origin | **101** | 1000, closed by the probe | None (no `live.hello` sent) |
| c. `Cookie`, `Origin: https://example.invalid` | **101** | 1000, closed by the probe | None (no `live.hello` sent) |
| d. No cookie, no `Origin` (control) | **403** `Forbidden`, body `forbidden`, before the upgrade | none | none |

### Handshake messages observed

The server sends nothing until the client speaks. The probe sent:

```json
{"type":"live.hello","version":1,"capabilities":["run-interests"]}
```

The server replied:

```json
{"type":"live.capabilities","version":1,"capabilities":["run-interests"]}
```

The probe did not send `live.interests`, so no `live.subscribed` message arrived.

### Events and pings during a 2-minute hold

The instance was idle. One connection (variant a) stayed open for 125 seconds.

- **Event types seen:** only `live.capabilities` (1), the hello reply. No `LiveEvent`
  arrived.
- **Pings:** WebSocket ping frames arrived at 26, 56, 86, and 116 seconds. The server sends a
  ping every 30 seconds from one timer shared by all sockets, so the first ping comes 0–30
  seconds after connecting. A socket that has not answered the previous ping with a pong is
  terminated at the next tick. The `ws` library answers pings automatically.

The event types a client can receive, from `packages/shared/src/constants.ts`:
`heartbeat.run.queued`, `heartbeat.run.status`, `heartbeat.run.progress`,
`heartbeat.run.event`, `heartbeat.run.log`, `heartbeat.run.activity`,
`agent.session.goal.changed`, `agent.status`, `agent.runtime_state.updated`,
`activity.logged`, `external_object.updated`, `plugin.ui.updated`, `plugin.worker.crashed`,
and `plugin.worker.restarted`.

### How the server authenticates the upgrade

From `server/src/realtime/live-events-ws.ts`, in order:

1. A bearer token in `Authorization`, or `?token=`, which is checked against **agent** API
   keys only.
2. Trusted cloud headers, on cloud-managed deployments only.
3. A Better Auth session resolved from the request headers, which is the `Cookie` header.
   The user must be an instance admin or an active member of the company.

Nothing checks `Origin`. When authentication fails, the server answers
`HTTP/1.1 403 Forbidden` and never upgrades.

## Contradictions with documentation or source

1. **`docs/api/attention.md` does not exist at `v2026.1117.0`.** The task asked for it to
   be read. The 1106 investigation found it on `master` only, so it has not yet shipped in a
   release. This report relies on `server/src/routes/attention.ts` and
   `packages/shared/src/types/attention.ts` instead.
2. **The `view` parameter does not exist in 1117.** `view=mine`, `view=unassigned`, and
   `view=company` return 200 with the same items as no parameter, because the route ignores
   unknown query keys. The nearest real filter is `queue` (a decision-queue key). The 1106
   report found `view` documented on `master`.
3. **`resolverAudience.createdByAgentName` is `null` while `createdByAgentId` is set.** The
   type comment says the display name is "resolved server-side". The service fills the name
   only when some interaction in the result names an addressee agent or uses the
   `not_creator` policy (`needsCompanyAgents` in `services/attention.ts`). The same item's
   `originAgentName` carries the name.
4. **Foreign `Origin` values are accepted on the WebSocket (variant c).** This is
   consistent with the source, which has no origin check. A browser on another site would
   still need the session cookie to be sent cross-site, which the cookie's `SameSite`
   setting governs; this report did not test that.
5. **`ApiClient.kt` in paperclip-android has no sign-in request.** The app signs in through
   an in-app WebView and shares that cookie store with OkHttp (`WebViewCookieJar`). The
   sign-in request in this probe follows the Better Auth route instead.
6. **The Android client opens the socket without an `Origin` header** (variant a). Its
   comment says the socket "only accepts cookie sessions". That holds for **board** API
   keys. Agent API keys are accepted as bearer tokens.
7. **No other contradictions** were found between the observed responses and
   `packages/shared/src/types/attention.ts` or `packages/shared/src/types/live.ts`.

## Session handling

- **Sign-in:** `POST /api/auth/sign-in/email` with `rememberMe: true` and an `Origin`
  header returned 200 and one `Set-Cookie` (`paperclip-default.session_token`). The probe
  kept the cookie in memory only.
- **Sign-out:** `POST /api/auth/sign-out` returned 200. A follow-up
  `GET /api/auth/get-session` with the old cookie returned **401**
  (`{"error":"Board authentication required"}`).
- **No credentials on disk:** the probe never printed or wrote the password, cookie, or
  tokens. It read credentials from `~/.config/paperclip-probe.env`, which was left in place.
- **Requests sent:** 3 probe runs (first company with question 2, then the second company
  twice: once to fix over-scrubbed enum values). Each run sent one sign-in POST, one
  sign-out POST, and GET requests only. The WebSocket sent one message per hello variant:
  `live.hello`.
- **Scrubbing:** the probe replaces values before saving, by key. IDs become stable fake
  UUIDs, task identifiers become `DEMO-1`, emails become `user@example.com`, links become
  `/demo/path`, and other free text becomes `example <field>`. Enum fields, timestamps,
  numbers, and booleans are kept. The real host name was replaced in the saved WebSocket URL
  after the run.

## Scripts that were run

Setup, in a scratch directory outside any project:

```sh
git clone --depth 1 --branch v2026.1117.0 https://github.com/paperclipai/paperclip.git
git clone --depth 1 https://github.com/splitpierre/paperclip-android.git
mkdir probe && cd probe && bun init -y && bun add ws@8.18.0
```

Run. Bun replaces the `ws` package with its own implementation, which does not report the HTTP status of a rejected upgrade, so the probe runs under Node 26 with type stripping. The env file sets `PAPERCLIP_URL`, `PAPERCLIP_EMAIL`, and `PAPERCLIP_PASSWORD`, and is never printed:

```sh
set -a; . ~/.config/paperclip-probe.env; set +a
node probe.ts                                                        # first company, questions 1 and 2
PROBE_COMPANY_NAME=<company> PROBE_SKIP_Q2=1 PROBE_OUT=out-q1 node probe.ts   # question 1 on the chosen company
```

Post-run scrub of the host name in the saved WebSocket URL:

```sh
sed -i 's#wss://[^/"]*/api#wss://paperclip.example.com/api#' out/q2-results.json
```

`probe.ts`, exactly as run in the final pass:

```ts
// Read-only probe of a Paperclip instance: attention feed (Q1) and live-events WebSocket (Q2).
// Only GET requests, except POST /api/auth/sign-in/email and POST /api/auth/sign-out.
// Credentials come from the environment and are never printed or written to disk.
// Everything written to ./out is scrubbed: ids, names, emails and free text are replaced.
import WebSocket from "ws";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = (process.env.PAPERCLIP_URL ?? "").replace(/\/+$/, "");
const EMAIL = process.env.PAPERCLIP_EMAIL ?? "";
const PASSWORD = process.env.PAPERCLIP_PASSWORD ?? "";
if (!BASE || !EMAIL || !PASSWORD) throw new Error("PAPERCLIP_URL, PAPERCLIP_EMAIL and PAPERCLIP_PASSWORD must be set");
const ORIGIN = new URL(BASE).origin;
const OUT = new URL(`./${process.env.PROBE_OUT ?? "out"}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// ---------- scrubbing ----------
const KEEP_KEYS = new Set([
  "sourceKind", "kind", "status", "severity", "type", "priority", "role", "adapterType", "approvalType",
  "requestedResolverPolicy", "effectiveResolverPolicy", "effectiveResolverPolicySource", "resolverPolicyProvenance",
  "outcome", "livenessState", "invocationSource", "entityType", "action", "actorType", "errorCode", "deploymentMode",
  "deploymentExposure", "bootstrapStatus", "version", "scopeKind", "logStore", "lastOutputStream", "state",
  "decideBy", "reason", "sort", "authKind", "connectionKind", "stream", "level", "originKind", "workMode",
  "subjectKind", "dismissalKind", "selectionMode", "inputType", "answerType", "verdict", "mode",
  "continuationPolicy", "answerMode", "schema", "resolverPolicy", "requested", "effective", "displayStatus",
  "visibility", "conversationState", "harnessKind", "sourceTrust", "reviewPolicy", "approvalStatus",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const idMap = new Map<string, string>();
function fakeUuid(real: string) {
  if (!idMap.has(real)) {
    const n = (idMap.size + 1).toString(16).padStart(12, "0");
    idMap.set(real, `00000000-0000-4000-8000-${n}`);
  }
  return idMap.get(real)!;
}
function scrubString(key: string, value: string, parentKey: string): string {
  if (UUID.test(value)) return fakeUuid(value);
  if (ISO.test(value)) return value; // timestamps are kept: they are not personal and show age
  if (KEEP_KEYS.has(key)) return value;
  if (parentKey === "decisionVerbs" && key === "id") return value; // verb ids are an enum
  if (key === "capabilities" || parentKey === "capabilities") return value;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(value)) return "user@example.com";
  if (/^[A-Z][A-Z0-9]{1,9}-\d+$/.test(value)) return "DEMO-1";
  if (key === "href" || key.endsWith("Url") || key === "url") return "/demo/path";
  return `example ${key || "text"}`;
}
function scrub(value: unknown, key = "", parentKey = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => scrub(v, key, parentKey));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Object keys that are ids (maps keyed by id) are scrubbed too.
      const kk = UUID.test(k) ? fakeUuid(k) : k;
      out[kk] = scrub(v, k, key);
    }
    return out;
  }
  if (typeof value === "string") return scrubString(key, value, parentKey);
  return value;
}
const save = (name: string, data: unknown) => writeFileSync(OUT + name, JSON.stringify(data, null, 2) + "\n");

// ---------- HTTP ----------
let cookieHeader = ""; // <session cookie>, memory only
type LogRow = { method: string; path: string; status: number; bytes: number };
const requestLog: LogRow[] = [];
function scrubPath(path: string) {
  return path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => fakeUuid(m))
    .replace(/cursor=[^&]+/, "cursor=<cursor>");
}
async function get(path: string): Promise<{ status: number; body: any; bytes: number }> {
  const res = await fetch(BASE + path, { headers: { Cookie: cookieHeader, Accept: "application/json" } });
  const text = await res.text();
  requestLog.push({ method: "GET", path: scrubPath(path), status: res.status, bytes: text.length });
  let body: any = text;
  try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, bytes: text.length };
}
function shapeOf(body: any): unknown {
  if (Array.isArray(body)) return { arrayLength: body.length };
  if (body && typeof body === "object") return Object.keys(body);
  return typeof body;
}

async function signIn() {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, rememberMe: true }),
  });
  const text = await res.text();
  requestLog.push({ method: "POST", path: "/api/auth/sign-in/email", status: res.status, bytes: text.length });
  if (res.status !== 200) {
    let shape: unknown = typeof text;
    try { shape = shapeOf(JSON.parse(text)); } catch {}
    console.log(`SIGN-IN FAILED: status ${res.status}, body shape ${JSON.stringify(shape)}`);
    process.exit(1);
  }
  const setCookies = res.headers.getSetCookie();
  cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");
  console.log(`sign-in 200; Set-Cookie names: ${setCookies.map((c) => c.split("=")[0]).join(", ")} (values: <session cookie>)`);
}
async function signOut() {
  const res = await fetch(`${BASE}/api/auth/sign-out`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookieHeader }, body: "{}",
  });
  requestLog.push({ method: "POST", path: "/api/auth/sign-out", status: res.status, bytes: (await res.text()).length });
  const check = await get("/api/auth/get-session");
  console.log(`sign-out ${res.status}; get-session with old cookie afterwards: ${check.status} body ${JSON.stringify(check.body)}`);
  cookieHeader = "";
}

// ---------- Q1: attention ----------
async function question1(cid: string) {
  const results: Record<string, unknown> = {};
  const feeds: Record<string, any> = {};
  const variants: Record<string, string> = {
    all_includeDismissed: "?all=true&includeDismissed=true",
    default: "",
    limit_2: "?limit=2",
    view_mine: "?view=mine",
    view_unassigned: "?view=unassigned",
    view_company: "?view=company",
    sort_decide: "?sort=decide",
    archived: "?archived=true&all=true",
    limit_101: "?limit=101",
    all_with_limit: "?all=true&limit=5",
  };
  for (const [name, qs] of Object.entries(variants)) {
    const r = await get(`/api/companies/${cid}/attention${qs}`);
    feeds[name] = r.body;
    const b = r.body ?? {};
    results[name] = {
      status: r.status, bytes: r.bytes,
      ...(r.status === 200
        ? { totalCount: b.totalCount, deskBadgeCount: b.deskBadgeCount, items: b.items?.length, nextCursor: b.nextCursor ? "<cursor>" : null,
            countsBySourceKind: b.countsBySourceKind, itemIds: (b.items ?? []).map((i: any) => i.id) }
        : { error: b }),
    };
  }
  // Follow the default paging with limit=2 to see the cursor work.
  const pages: unknown[] = [];
  let cursor = feeds.limit_2?.nextCursor as string | null;
  for (let i = 0; cursor && i < 10; i++) {
    const r = await get(`/api/companies/${cid}/attention?limit=2&cursor=${encodeURIComponent(cursor)}`);
    pages.push({ status: r.status, items: r.body?.items?.length, nextCursor: r.body?.nextCursor ? "<cursor>" : null });
    cursor = r.body?.nextCursor ?? null;
  }
  results.limit_2_following_pages = pages;
  // Compare the view variants to the default (the route has no view parameter).
  const ids = (n: string) => JSON.stringify((results[n] as any)?.itemIds ?? null);
  results.view_ignored = ["view_mine", "view_unassigned", "view_company"].map((v) => ({ variant: v, sameItemsAsDefault: ids(v) === ids("default") }));
  for (const k of Object.keys(results)) if ((results[k] as any)?.itemIds) (results[k] as any).itemIds = (results[k] as any).itemIds.length;

  const summary = await get(`/api/companies/${cid}/attention/summary`);
  results.summary = { status: summary.status, keys: shapeOf(summary.body), countsBySourceKind: summary.body?.countsBySourceKind, totalCount: summary.body?.totalCount };
  save("attention-summary.json", scrub(summary.body));
  const tasks = await get(`/api/companies/${cid}/attention/tasks`);
  results.tasks = { status: tasks.status, keys: shapeOf(tasks.body), taskIds: tasks.body?.taskIds?.length };
  const history = await get(`/api/companies/${cid}/attention/history?limit=5`);
  results.history = { status: history.status, keys: shapeOf(history.body), items: history.body?.items?.length };
  if (history.body?.items?.[0]) save("attention-history-item.json", scrub(history.body.items[0]));

  // One sample per source kind and per detail.kind, from the widest feed.
  const all = feeds.all_includeDismissed?.items ?? [];
  const samples: Record<string, any> = {};
  for (const item of all) {
    const key = `${item.sourceKind}__${item.detail?.kind ?? "none"}`;
    if (!samples[key]) samples[key] = item;
  }
  results.sampleKinds = Object.keys(samples);
  results.dismissedOrSnoozed = all.filter((i: any) => i.dismissal || i.snoozedUntil).length;
  results.withDecideBy = all.filter((i: any) => i.decideBy).length;
  results.originAgentNamePresent = all.map((i: any) => ({ sourceKind: i.sourceKind, detail: i.detail?.kind, originAgentName: i.originAgentName !== null, subjectIdentifier: i.subject?.identifier !== null, relatedIssueIdentifier: !!i.relatedIssue?.identifier, createdByAgentName: i.resolverAudience ? i.resolverAudience.createdByAgentName !== null : "n/a" }));
  for (const [k, item] of Object.entries(samples)) save(`item-${k}.json`, scrub(item));

  // Follow-up GETs for what is not inline.
  const followUps: Record<string, unknown> = {};
  const agents = await get(`/api/companies/${cid}/agents`);
  followUps.agentsList = { status: agents.status, shape: shapeOf(agents.body), bytes: agents.bytes };
  for (const [k, item] of Object.entries(samples)) {
    const issueId = item.subject?.metadata?.issueId ?? item.relatedIssue?.id ?? (item.subject?.kind === "issue" ? item.subject.id : null);
    if (item.sourceKind === "issue_thread_interaction" && issueId) {
      const r = await get(`/api/issues/${issueId}/interactions`);
      const match = Array.isArray(r.body) ? r.body.find((x: any) => x.id === item.subject.id) : null;
      followUps[`${k}:interactions`] = { status: r.status, bytes: r.bytes, interactionsOnTask: Array.isArray(r.body) ? r.body.length : null, matchedById: !!match };
      if (match) save(`followup-${k}-interaction.json`, scrub(match));
    }
    if (item.sourceKind === "approval") {
      for (const p of [`/api/approvals/${item.subject.id}`, `/api/approvals/${item.subject.id}/issues`]) {
        const r = await get(p);
        followUps[`${k}:${p.endsWith("issues") ? "approvalIssues" : "approval"}`] = { status: r.status, bytes: r.bytes, shape: shapeOf(r.body) };
        save(`followup-${k}-${p.endsWith("issues") ? "approval-issues" : "approval"}.json`, scrub(r.body));
      }
    }
    if (item.sourceKind === "failed_run") {
      const r = await get(`/api/heartbeat-runs/${item.subject.id}`);
      followUps[`${k}:run`] = { status: r.status, bytes: r.bytes, shape: shapeOf(r.body) };
    }
    if (issueId && !followUps[`issue:${issueId}`]) {
      const r = await get(`/api/issues/${issueId}`);
      followUps[`${k}:issue`] = { status: r.status, bytes: r.bytes, topLevelKeys: shapeOf(r.body) };
      followUps[`issue:${issueId}`] = true;
      if (item.sourceKind === "blocker_attention") save(`followup-${k}-issue.json`, scrub(r.body));
    }
  }
  for (const k of Object.keys(followUps)) if (k.startsWith("issue:")) delete followUps[k];
  results.followUps = followUps;
  // Open decisions (the "decision" kind the Android client loads separately).
  const decisions = await get(`/api/companies/${cid}/decisions?status=open&limit=100`);
  results.openDecisions = { status: decisions.status, shape: shapeOf(decisions.body) };
  return results;
}

// ---------- Q2: live events ----------
type WsResult = { variant: string; upgradeStatus: number | null; opened: boolean; close: { code: number; reason: string } | null; error: string | null; firstMessages: unknown[]; pings: number[] };
function tryWs(variant: string, url: string, headers: Record<string, string>, holdMs: number, sendHello: boolean, eventTypes?: Map<string, number>): Promise<WsResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const result: WsResult = { variant, upgradeStatus: null, opened: false, close: null, error: null, firstMessages: [], pings: [] };
    const ws = new WebSocket(url, { headers });
    const finish = () => { clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.close(1000, "probe done"); else finish(); }, holdMs);
    ws.on("unexpected-response", (_req, res) => {
      result.upgradeStatus = res.statusCode ?? null;
      let body = "";
      res.on("data", (c: Buffer) => (body += c.toString()));
      res.on("end", () => { result.error = `HTTP ${res.statusCode} ${res.statusMessage} body=${JSON.stringify(body.slice(0, 100))}`; finish(); });
    });
    ws.on("upgrade", (res) => { result.upgradeStatus = res.statusCode ?? null; });
    ws.on("open", () => {
      result.opened = true;
      if (sendHello) setTimeout(() => {
        ws.send(JSON.stringify({ type: "live.hello", version: 1, capabilities: ["run-interests"] }));
        result.firstMessages.push({ t: Date.now() - started, sent: "live.hello" });
      }, 5000);
    });
    ws.on("ping", () => result.pings.push(Math.round((Date.now() - started) / 1000)));
    ws.on("message", (data) => {
      const t = Date.now() - started;
      let msg: any = data.toString();
      try { msg = JSON.parse(msg); } catch {}
      const type = msg?.type ?? "(non-json)";
      if (eventTypes) eventTypes.set(type, (eventTypes.get(type) ?? 0) + 1);
      if (t <= 30_000 && result.firstMessages.length < 20) {
        result.firstMessages.push(type.startsWith("live.") ? { t, message: msg } : { t, type, payloadKeys: msg?.payload ? Object.keys(msg.payload) : null });
      }
    });
    ws.on("close", (code, reason) => { result.close = { code, reason: reason.toString() }; finish(); });
    ws.on("error", (err) => { if (!result.error) result.error = String(err.message); });
  });
}
async function question2(cid: string) {
  const wsBase = ORIGIN.replace(/^http/, "ws");
  const url = `${wsBase}/api/companies/${cid}/events/ws`;
  const [a, b, c, d] = await Promise.all([
    tryWs("a: cookie, no Origin", url, { Cookie: cookieHeader }, 30_000, true),
    tryWs("b: cookie, Origin = instance", url, { Cookie: cookieHeader, Origin: ORIGIN }, 30_000, false),
    tryWs("c: cookie, Origin = https://example.invalid", url, { Cookie: cookieHeader, Origin: "https://example.invalid" }, 30_000, false),
    tryWs("d: no cookie, no Origin", url, {}, 30_000, false),
  ]);
  const eventTypes = new Map<string, number>();
  const hold = await tryWs("hold: cookie, no Origin, 2 minutes", url, { Cookie: cookieHeader }, 125_000, true, eventTypes);
  return { url: url.replace(/companies\/[^/]+/, `companies/${fakeUuid(cid)}`), variants: [a, b, c, d], hold: { ...hold, firstMessages: hold.firstMessages.slice(0, 5), eventTypes: Object.fromEntries(eventTypes) } };
}

// ---------- main ----------
await signIn();
try {
  const health = await get("/api/health");
  console.log("health:", JSON.stringify({ status: health.body?.status, version: health.body?.version, commit: health.body?.commit }));
  const companies = await get("/api/companies");
  const list = Array.isArray(companies.body) ? companies.body : companies.body?.companies ?? [];
  // PROBE_COMPANY_NAME selects a company by name (used when the first company has no attention items).
  const wanted = process.env.PROBE_COMPANY_NAME;
  const company = wanted ? list.find((c: any) => c.name === wanted) : list[0];
  if (!company) throw new Error("company not found");
  const cid = company.id as string;
  console.log(`companies: ${list.length}; using ${wanted ? "the named company" : "the first"} (${fakeUuid(cid)})`);
  const q1 = await question1(cid);
  save("q1-results.json", q1);
  console.log("Q1 done");
  if (process.env.PROBE_SKIP_Q2 !== "1") {
    const q2 = await question2(cid);
    save("q2-results.json", q2);
    console.log("Q2 done");
  }
  save("health.json", { status: health.body?.status, version: health.body?.version, commit: health.body?.commit });
} finally {
  await signOut();
  save("request-log.json", requestLog);
}
```
