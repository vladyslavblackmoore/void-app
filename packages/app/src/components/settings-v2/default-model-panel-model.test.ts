import { describe, expect, test } from "bun:test"
import { defaultModelPanel } from "./default-model-panel-model"

const providers: Parameters<typeof defaultModelPanel>[0]["providers"] = [
  { id: "anthropic", name: "Anthropic", models: { opus: { name: "Opus" } } },
  { id: "opencode", name: "OpenCode", models: { beam: { name: "Beam Free" } } },
]

describe("default model panel", () => {
  test("is unset without a configured model", () => {
    expect(defaultModelPanel({ providers })).toEqual({ state: "unset" })
  })

  test("resolves the configured model and effort from connected providers", () => {
    expect(defaultModelPanel({ model: "anthropic/opus", variant: "high", providers, isVoid: true })).toEqual({
      state: "ready",
      providerName: "Anthropic",
      modelName: "Opus",
      effort: "high",
    })
  })

  test("is unavailable when the provider is not connected and keeps the raw model name", () => {
    expect(defaultModelPanel({ model: "google/gemini", providers, isVoid: true })).toEqual({
      state: "unavailable",
      providerName: "google",
      modelName: "gemini",
      effort: undefined,
    })
  })

  test("upstream provider names are neutral under the void theme only", () => {
    expect(defaultModelPanel({ model: "opencode/beam", providers, isVoid: true })).toMatchObject({
      providerName: "Free models",
    })
    expect(defaultModelPanel({ model: "opencode/beam", providers, isVoid: false })).toMatchObject({
      providerName: "OpenCode",
    })
  })

  test("a malformed model reference is unset", () => {
    expect(defaultModelPanel({ model: "nomodel", providers })).toEqual({ state: "unset" })
  })
})
