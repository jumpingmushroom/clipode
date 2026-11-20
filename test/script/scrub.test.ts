import { expect, test } from "bun:test"
import { createScrubber } from "../../script/scrub.ts"

test("scrubber replaces personal data and keeps structure, enums and timestamps", () => {
  const { scrub } = createScrubber()
  const real = {
    id: "3f2b8c1e-9d4a-4e6b-8f1a-2c3d4e5f6a7b",
    companyId: "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d",
    name: "Real Person",
    email: "real.person@corp.example",
    status: "in_progress",
    reason: "the build server at 10.0.0.5 is down",
    identifier: "ACME-42",
    href: "/ACME/issues/ACME-42",
    createdAt: "2026-11-18T13:16:03.838Z",
    count: 3,
    live: true,
    decisionVerbs: [{ id: "accept", label: "Ship it" }],
    byAgent: { "3f2b8c1e-9d4a-4e6b-8f1a-2c3d4e5f6a7b": 2 },
    parentId: "3f2b8c1e-9d4a-4e6b-8f1a-2c3d4e5f6a7b",
    env: { SONARR_API_KEY: { type: "plain", value: "abc" }, "access.ssh_key": 1 },
  }
  const out = scrub(real) as Record<string, any>
  const text = JSON.stringify(out)

  for (const secret of ["Real Person", "real.person", "10.0.0.5", "ACME", "3f2b8c1e", "Ship it", "SONARR", "ssh_key", "abc"]) {
    expect(text).not.toContain(secret)
  }
  expect(out.status).toBe("in_progress")
  expect(out.reason).toBe("example reason")
  expect(out.email).toBe("user@example.com")
  expect(out.identifier).toBe("DEMO-1")
  expect(out.createdAt).toBe(real.createdAt)
  expect(out.count).toBe(3)
  expect(out.live).toBe(true)
  expect(out.decisionVerbs[0]).toEqual({ id: "accept", label: "example label" })
  // Non-UUID ids stay distinct and stable.
  const ids = scrub([{ id: "attention:a:1" }, { id: "attention:b:2" }, { id: "attention:a:1" }]) as { id: string }[]
  expect(ids[0]!.id).not.toBe(ids[1]!.id)
  expect(ids[0]!.id).toBe(ids[2]!.id)
  expect(ids[0]!.id).not.toContain("attention")
  // The same real id maps to the same fake id everywhere, including object keys.
  expect(out.parentId).toBe(out.id)
  expect(Object.keys(out.byAgent)).toEqual([out.id])
  // Keys that are not field names, such as env var names, are replaced.
  expect(Object.keys(out.env)).toEqual(["example_key_1", "example_key_2"])
  expect(out.env.example_key_1.type).toBe("plain")
})

test("log scrubbing keeps record and chunk structure and drops text", () => {
  const { scrubLog } = createScrubber()
  const chunk = JSON.stringify({ type: "acpx.tool_call", name: "Read", toolCallId: "call_1", text: "cat /home/real/secret.txt", tag: "tool_call" })
  const content = [
    JSON.stringify({ ts: "2026-11-20T10:00:00.000Z", stream: "stdout", chunk: chunk + "\n", seq: 1 }),
    JSON.stringify({ ts: "2026-11-20T10:00:01.000Z", stream: "stderr", chunk: "plain text from Real Person\n", seq: 2 }),
    JSON.stringify({ ts: "2026-11-20T10:00:02.000Z", stream: "stdout", chunk: JSON.stringify({ type: "x", name: "Real Person" }), seq: 3 }),
  ].join("\n")
  const out = scrubLog(content)
  expect(out).not.toContain("secret")
  expect(out).not.toContain("Real Person")
  const [first, second, third] = out.split("\n").map((l) => JSON.parse(l))
  expect(first.seq).toBe(1)
  expect(first.stream).toBe("stdout")
  expect(JSON.parse(first.chunk.trim())).toEqual({ type: "acpx.tool_call", name: "Read", toolCallId: "toolCallId-1", text: "example text", tag: "tool_call" })
  expect(second.chunk).toBe("example chunk\n")
  expect(JSON.parse(third.chunk).name).toBe("example name")
})
