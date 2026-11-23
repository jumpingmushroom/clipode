import { expect, test } from "bun:test"
import type { ActivityEvent, RoutineListItem } from "@paperclipai/shared"
import { activityVerb, isMinor } from "../../src/api/activity-format.ts"
import { toEntry } from "../../src/api/endpoints/activity.ts"
import { toRoutine } from "../../src/api/endpoints/routines.ts"

const trigger = (over: object) => ({ id: "t", kind: "schedule", label: null, enabled: true, cronExpression: "0 9 * * 1", timezone: "Europe/Oslo", nextRunAt: null, lastFiredAt: null, lastResult: null, ...over })

test("a routine shows its first trigger, the soonest enabled next run and its last run's task", () => {
  const r = toRoutine({
    id: "r1", title: "Weekly report", status: "active", assigneeAgentId: "a1", projectId: null, concurrencyPolicy: "skip_if_active",
    triggers: [trigger({ label: "Mondays 09:00", nextRunAt: "2026-11-30T08:00:00.000Z" }), trigger({ nextRunAt: "2026-11-24T08:00:00.000Z" }), trigger({ enabled: false, nextRunAt: "2026-11-23T08:00:00.000Z" })],
    lastRun: { status: "completed", triggeredAt: "2026-11-23T08:00:00.000Z", createdAt: "", linkedIssueId: "i1", linkedIssue: { id: "i1", identifier: "DEMO-4" } },
    activeIssue: null,
  } as unknown as RoutineListItem)
  expect(r).toMatchObject({ schedule: "Mondays 09:00", moreTriggers: 2, nextRunAt: "2026-11-24T08:00:00.000Z", lastRun: { status: "completed", taskId: "i1", identifier: "DEMO-4" }, activeTask: null })
})

const event = (over: Partial<ActivityEvent>) => ({ id: "e", companyId: "c", actorType: "agent", actorId: "a1", agentId: null, runId: null, entityType: "issue", entityId: "i1", details: null, createdAt: "2026-11-23T08:00:00.000Z", action: "issue.created", ...over }) as ActivityEvent

test("activity is worded like the web UI, with status changes and decisions spelled out", () => {
  expect(activityVerb("issue.updated", { status: "done", _previous: { status: "in_progress" } })).toBe("changed status from in progress to done on")
  expect(activityVerb("issue.updated", { priority: "high" })).toBe("changed priority to high on")
  expect(activityVerb("issue.stalled_review_decided", { action: "request_changes" })).toBe("requested changes on")
  expect(activityVerb("issue.thread_interaction_accepted", { interactionKind: "ask_user_questions" })).toBe("accepted the answers on")
  expect(activityVerb("environment.lease_acquired", null)).toBe("environment lease acquired")
  expect(isMinor("cost.reported")).toBe(true)
  expect(isMinor("issue.comment_added")).toBe(false)
})

test("an entry opens its task, agent or run; an approval opens its first task", () => {
  expect(toEntry(event({ details: { identifier: "DEMO-1", issueTitle: "Fix it" } }))).toMatchObject({ subject: "DEMO-1 Fix it", target: { kind: "task", id: "i1" }, minor: false })
  expect(toEntry(event({ entityType: "heartbeat_run", entityId: "run1", action: "heartbeat.invoked", details: { agentId: "a1" } })).target).toEqual({ kind: "run", id: "run1", agentId: "a1" })
  expect(toEntry(event({ entityType: "approval", entityId: "ap1", action: "approval.created", details: { type: "hire_agent", issueIds: ["i2"] } }))).toMatchObject({ subject: "hire agent approval", target: { kind: "task", id: "i2" } })
  expect(toEntry(event({ entityType: "cost_event", entityId: "x", action: "cost.reported" }))).toMatchObject({ target: null, minor: true })
})
