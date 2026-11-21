import { describe, expect, test } from "bun:test"
import {
  defaultModelGroups,
  defaultModelPanel,
  defaultModelPatch,
  inheritedBy,
  isDraftDirty,
  selectDefaultModel,
  toggleEffort,
} from "./default-model-panel-model"

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

const choices: Parameters<typeof defaultModelGroups>[0] = [
  {
    id: "anthropic",
    name: "Anthropic",
    models: {
      opus: { name: "Opus", variants: { low: {}, high: {} } },
      haiku: { name: "Haiku" },
    },
  },
  { id: "opencode", name: "OpenCode", models: { beam: { name: "Beam Free" } } },
  { id: "empty", name: "Empty", models: {} },
]

describe("default model groups", () => {
  test("lists real models per connected provider with their effort variants", () => {
    const groups = defaultModelGroups(choices, true)
    expect(groups.map((group) => group.name)).toEqual(["Anthropic", "Free models"])
    expect(groups[0].models).toEqual([
      { ref: "anthropic/opus", name: "Opus", variants: ["low", "high"] },
      { ref: "anthropic/haiku", name: "Haiku", variants: [] },
    ])
  })

  test("keeps upstream provider names outside the void theme", () => {
    expect(defaultModelGroups(choices, false).map((group) => group.name)).toEqual(["Anthropic", "OpenCode"])
  })
})

describe("default model draft", () => {
  const groups = defaultModelGroups(choices, true)

  test("selecting a model keeps the effort only when the model has it", () => {
    expect(selectDefaultModel({ model: "anthropic/opus", variant: "high" }, "anthropic/opus", groups)).toEqual({
      model: "anthropic/opus",
      variant: "high",
    })
    expect(selectDefaultModel({ model: "anthropic/opus", variant: "high" }, "anthropic/haiku", groups)).toEqual({
      model: "anthropic/haiku",
      variant: undefined,
    })
  })

  test("an effort toggles off when picked again", () => {
    expect(toggleEffort({ model: "a/b", variant: "low" }, "high")).toEqual({ model: "a/b", variant: "high" })
    expect(toggleEffort({ model: "a/b", variant: "high" }, "high")).toEqual({ model: "a/b", variant: undefined })
  })

  test("dirty compares the draft with the saved values", () => {
    expect(isDraftDirty({ model: "a/b", variant: "high" }, { model: "a/b", variant: "high" })).toBe(false)
    expect(isDraftDirty({ model: "a/c", variant: "high" }, { model: "a/b", variant: "high" })).toBe(true)
    expect(isDraftDirty({ model: "a/b" }, { model: "a/b", variant: undefined })).toBe(false)
  })

  test("the patch writes the model and clears an unset effort", () => {
    expect(defaultModelPatch({ model: "anthropic/opus", variant: "high" })).toEqual({
      model: "anthropic/opus",
      agent: { main: { variant: "high" } },
    })
    expect(defaultModelPatch({ model: "anthropic/haiku" })).toEqual({
      model: "anthropic/haiku",
      agent: { main: { variant: "" } },
    })
    expect(defaultModelPatch({})).toBeUndefined()
  })
})

describe("inherited by", () => {
  test("splits agents that use the default from agents with their own model", () => {
    const nodes = [
      { name: "main", inherits: false, isMain: true },
      { name: "architect", inherits: true, isMain: false },
      { name: "worker", inherits: false, isMain: false },
      { name: "doc", inherits: false, isMain: false },
    ]
    expect(inheritedBy(nodes)).toEqual({ names: ["main", "architect"], own: 2 })
  })
})
