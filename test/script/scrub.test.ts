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
  }
  const out = scrub(real) as Record<string, any>
  const text = JSON.stringify(out)

  for (const secret of ["Real Person", "real.person", "10.0.0.5", "ACME", "3f2b8c1e", "Ship it"]) {
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
  // The same real id maps to the same fake id everywhere, including object keys.
  expect(out.parentId).toBe(out.id)
  expect(Object.keys(out.byAgent)).toEqual([out.id])
})
