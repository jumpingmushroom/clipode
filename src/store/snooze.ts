// Snooze durations offered in the inbox, as local times.
export type SnoozeChoice = "1h" | "4h" | "tomorrow" | "monday"

export const SNOOZE_CHOICES: { value: SnoozeChoice; title: string }[] = [
  { value: "1h", title: "1 hour" },
  { value: "4h", title: "4 hours" },
  { value: "tomorrow", title: "Tomorrow at 9:00" },
  { value: "monday", title: "Monday at 9:00" },
]

export function snoozeUntil(choice: SnoozeChoice, now = new Date()): Date {
  if (choice === "1h") return new Date(now.getTime() + 3_600_000)
  if (choice === "4h") return new Date(now.getTime() + 4 * 3_600_000)
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9)
  if (choice === "monday") while (at.getDay() !== 1) at.setDate(at.getDate() + 1)
  return at
}
