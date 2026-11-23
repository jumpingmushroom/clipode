import { expect, test } from "bun:test"
import { snoozeUntil } from "../../src/store/snooze.ts"

test("snooze times", () => {
  const fri = new Date(2026, 10, 20, 15, 30) // Friday
  expect(snoozeUntil("1h", fri)).toEqual(new Date(2026, 10, 20, 16, 30))
  expect(snoozeUntil("4h", fri)).toEqual(new Date(2026, 10, 20, 19, 30))
  expect(snoozeUntil("tomorrow", fri)).toEqual(new Date(2026, 10, 21, 9))
  expect(snoozeUntil("monday", fri)).toEqual(new Date(2026, 10, 23, 9))
  // On a Sunday evening, Monday is the next day, not a week later.
  expect(snoozeUntil("monday", new Date(2026, 10, 22, 20))).toEqual(new Date(2026, 10, 23, 9))
})
