import { expect, test } from "bun:test"
import { age, elapsed, fit, truncate } from "../../src/ui/format.ts"

test("age, elapsed and truncation", () => {
  const now = Date.parse("2026-11-20T15:00:00Z")
  expect(age("2026-11-20T14:48:00Z", now)).toBe("12m")
  expect(age("2026-11-20T14:00:00Z", now)).toBe("1h")
  expect(age("2026-11-18T15:00:00Z", now)).toBe("2d")
  expect(age(null, now)).toBe("")
  expect(elapsed("2026-11-20T14:56:48Z", now)).toBe("3m 12s")
  expect(truncate("Keep or drop the old CSV importer", 10)).toBe("Keep or d…")
  expect(truncate("short", 10)).toBe("short")
  expect(fit("12m", 4, "right")).toBe(" 12m")
})
