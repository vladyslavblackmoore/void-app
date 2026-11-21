import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import type { Message } from "@opencode-ai/sdk/v2/client"
import { runModelLabel, runSummary } from "./void-run-model"

const providers = [{ id: "p", name: "P", models: { m: { name: "Model M", limit: { context: 1000 } } } }]

const user = {
  id: "u1",
  sessionID: "s",
  role: "user",
  time: { created: 1 },
  agent: "main",
  model: { providerID: "p", modelID: "m" },
} as unknown as Message

const assistant = (total: number) =>
  ({
    id: "a1",
    sessionID: "s",
    role: "assistant",
    providerID: "p",
    modelID: "m",
    tokens: { input: total, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  }) as unknown as Message

describe("run summary", () => {
  test("a first turn with no tokens yet has no context but still has a model", () => {
    const summary = runSummary({ id: "s", messages: [user, assistant(0)], providers, todos: 0, files: 0 })
    expect(summary.context).toBeUndefined()
    expect(summary.model).toBe("Model M")
    expect(summary.empty).toBe(false)
  })

  test("a user message alone yields the model from the message", () => {
    expect(runModelLabel([user], providers)).toBe("Model M")
  })

  test("a finished turn yields the context usage", () => {
    const summary = runSummary({ id: "s", messages: [user, assistant(250)], providers, todos: 0, files: 0 })
    expect(summary.context?.usage).toBe(25)
  })

  test("a selected session is never empty", () => {
    expect(runSummary({ id: "s", messages: [], providers, todos: 0, files: 0 }).empty).toBe(false)
  })

  test("the new session screen with nothing is empty", () => {
    expect(runSummary({ id: undefined, messages: [], providers, todos: 0, files: 0 }).empty).toBe(true)
  })

  test("a selected session with a model and nothing else is not empty and the view hides the empty text for it", () => {
    expect(runSummary({ id: "s", messages: [user], providers, todos: 0, files: 0 }).empty).toBe(false)
    const view = readFileSync(new URL("./void-run-view.tsx", import.meta.url), "utf8")
    expect(view).toContain("fallback={")
    expect(view).not.toContain("props.empty && !props.id")
  })

  test("the view renders its sections inside one stable root so a session switch replaces them cleanly", () => {
    const view = readFileSync(new URL("./void-run-view.tsx", import.meta.url), "utf8")
    const css = readFileSync(new URL("./void-session-sheets.css", import.meta.url), "utf8")
    expect(view).toContain('<div data-slot="void-run-body">')
    expect(css).toContain('[data-slot="void-run-body"] {\n  display: contents;')
  })
})
