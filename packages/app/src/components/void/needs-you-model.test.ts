import { describe, expect, test } from "bun:test"
import type { PermissionRequest, QuestionRequest } from "@opencode-ai/sdk/v2/client"
import { needsYouCards, type NeedsYouEntry } from "./needs-you-model"

const request = (id: string, patterns: string[], permission = "bash"): PermissionRequest => ({
  id,
  sessionID: "ses_" + id,
  permission,
  patterns,
  metadata: {},
  always: [],
})

const question = (id: string, text: string): QuestionRequest => ({
  id,
  sessionID: "ses_" + id,
  questions: [{ question: text, header: "Q", options: [] }],
})

const entry = (id: string, permission?: PermissionRequest, asked?: QuestionRequest): NeedsYouEntry => ({
  sessionID: "ses_" + id,
  title: "Session " + id,
  projectName: "demo",
  directory: "/work/demo",
  permission,
  question: asked,
})

describe("needs you cards", () => {
  test("only sessions with a pending permission produce a card", () => {
    const cards = needsYouCards([entry("a"), entry("b", request("b", ["npm test"])), entry("c")])
    expect(cards.map((card) => card.id)).toEqual(["b"])
  })

  test("a card carries the session, the project and the requested action", () => {
    const [card] = needsYouCards([entry("b", request("b", ["npm test -- broker", "npm run lint"]))])
    expect(card).toEqual({
      id: "b",
      kind: "permission",
      rootID: "ses_b",
      sessionID: "ses_b",
      directory: "/work/demo",
      title: "Session b",
      projectName: "demo",
      tool: "bash",
      detail: "npm test -- broker npm run lint",
    })
  })

  test("a permission without patterns has an empty detail", () => {
    const [card] = needsYouCards([entry("d", request("d", [], "edit"))])
    expect(card.tool).toBe("edit")
    expect(card.detail).toBe("")
  })

  test("a child session permission keeps its own session id and the root id", () => {
    const child = { ...request("p1", ["ls"]), sessionID: "ses_child" }
    const [card] = needsYouCards([{ ...entry("root", child), sessionID: "ses_root" }])
    expect(card.sessionID).toBe("ses_child")
    expect(card.rootID).toBe("ses_root")
  })

  test("a pending question produces a question card with the first question as detail", () => {
    const [card] = needsYouCards([entry("q", undefined, question("q", "Which branch?"))])
    expect(card.kind).toBe("question")
    expect(card.id).toBe("q")
    expect(card.detail).toBe("Which branch?")
  })

  test("a permission wins over a question in the same session", () => {
    const cards = needsYouCards([entry("b", request("b", ["ls"]), question("q", "x"))])
    expect(cards.map((card) => card.kind)).toEqual(["permission"])
  })

  test("no entries give no cards", () => {
    expect(needsYouCards([])).toEqual([])
  })
})
