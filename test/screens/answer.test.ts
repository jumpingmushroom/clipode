import { expect, test } from "bun:test"
import type { Question } from "../../src/api/model.ts"
import { choicesFor, missing, toAnswers, toggle, writeOther } from "../../src/screens/answer.ts"

const single: Question = { id: "colour", prompt: "Which colour?", options: [{ id: "red", label: "Red" }, { id: "blue", label: "Blue" }], multiple: false, allowOther: true, required: true }
const multi: Question = { id: "days", prompt: "Which days?", options: [{ id: "mon", label: "Mon" }, { id: "tue", label: "Tue" }], multiple: true, allowOther: false, required: false }

test("choices cover every option, the written answer, and the decision verbs", () => {
  expect(choicesFor({ kind: "question", questions: [single, multi] }).map((c) => c.label)).toEqual(["Red", "Blue", "Something else, with a written reply", "Mon", "Tue"])
  expect(choicesFor({ kind: "confirmation", prompt: "", detailsMarkdown: null, acceptLabel: "Confirm Blue", rejectLabel: "Choose again" }).map((c) => c.kind)).toEqual(["accept", "reject"])
  expect(choicesFor({ kind: "approval", summary: "", identifier: null }).map((c) => c.kind === "approval" && c.decision)).toEqual(["approve", "reject", "request-revision"])
})

test("single choice replaces, multiple choice toggles, a written answer replaces a single choice", () => {
  let s = toggle({}, single, "red")
  s = toggle(s, single, "blue")
  expect(s.colour).toEqual({ optionIds: ["blue"], otherText: undefined })
  s = writeOther(s, single, "Teal")
  expect(s.colour).toEqual({ optionIds: [], otherText: "Teal" })
  s = toggle(toggle(toggle(s, multi, "mon"), multi, "tue"), multi, "mon")
  expect(s.days!.optionIds).toEqual(["tue"])
})

test("required questions must be answered; answers carry ids and written text", () => {
  expect(missing([single, multi], {}).map((q) => q.id)).toEqual(["colour"])
  const s = writeOther(toggle({}, multi, "mon"), single, "Teal")
  expect(missing([single, multi], s)).toEqual([])
  expect(toAnswers([single, multi], s)).toEqual([
    { questionId: "colour", optionIds: [], otherText: "Teal" },
    { questionId: "days", optionIds: ["mon"] },
  ])
})
